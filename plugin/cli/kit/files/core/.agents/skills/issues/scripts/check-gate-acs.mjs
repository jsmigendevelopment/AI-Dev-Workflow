#!/usr/bin/env node
// Checks that an issue which adds a refusal also says what happens to every other input (the issues skill, #747):
// default deny. An issue with an AC whose THEN refuses, blocks, hides or exits non-zero on an input needs an AC
// whose WHEN names the rest ("not on the allowed list", "any other", "unknown", "not listed") and whose THEN refuses.
// Read only: it writes nothing. The consistency check runs it (check 13).
// Usage:  gh issue list --limit 200 --json number,title,body | node check-gate-acs.mjs    issues on stdin
//         node check-gate-acs.mjs docs/issues/*.md     issue files, before GitHub; a `Status: done` file is skipped (a GitHub body never is)
// Exit 0: no issue has a refusing AC without a covering one. Exit 1: one line per such issue, naming its first
// refusing AC. Exit 2: the input can't be read, holds no issue, or an issue has no AC line the reader can take.
// It fails closed: an unreadable issue is never a pass. What satisfies it is exact (docs/decisions/747-1.md).
import { readFileSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// An AC line: an optional list mark, checkbox and `auto`/`agent` tag, then AC-<id>, an optional (auto), a colon or dash,
// then the text. An "AC-1" in the middle of a sentence, or at its start with no colon, is a mention, not an AC.
const AC_START = /^[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+)?(?:\[[ xX]\][ \t]*)?(?:[`*_]*(auto|agent)[`*_]*[ \t:·-]*)?[*_`]*AC-([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(?![A-Za-z0-9])[*_`]*[ \t]*(?:[(\[](auto|agent)[)\]][*_`]*[ \t]*)?(?:[:：.—–-][ \t]*|(?=when\b))(.*)$/i;
const BLOCK_START = /^[ \t]*(?:#|[-*+][ \t]|\d+[.)][ \t])/;
const WHEN_THEN = /^when\b(.*?)\bthen\b(.*)$/is;

// What a refusing THEN says: the issue's words (refuses, blocks, hides, exits non-zero) and their near synonyms.
const wordsRe = (alternatives) => new RegExp(String.raw`(?<![\p{L}-])(?:${alternatives.join("|")})(?![\p{L}-])`, "giu");
const BASE_REFUSALS = [
  String.raw`refus(?:e|es|ed|ing|al)`, String.raw`block(?:s|ed|ing)?`, String.raw`reject(?:s|ed|ing)?`,
  String.raw`den(?:y|ies|ied)`, String.raw`forbid(?:s|den)?`, String.raw`disallow(?:s|ed)?`, String.raw`hid(?:e|es|den)`,
  String.raw`fail(?:s|ed)?`, String.raw`prints?\s+nothing`, String.raw`nothing\s+(?:is\s+)?(?:printed|shown|written)`,
  String.raw`(?:is|are)\s+not\s+(?:printed|shown|written|allowed)`, String.raw`never\s+(?:prints?|shows?|writes?)`,
  String.raw`exits?\s+(?:with\s+)?(?:code\s+|status\s+)?(?:non-?zero|[1-9]\d*)`, String.raw`exit\s+(?:code\s+|status\s+)?(?:is\s+)?(?:non-?zero|[1-9]\d*)`,
];
// More words that mark an AC as refusing. They go on the detecting list only, never the covering one, so a wider list
// can only flag more issues (the gate rule). "errors" is the verb here, not the noun after "no" or "without".
const MORE_REFUSALS = [
  String.raw`(?<!\b(?:no|any|without|zero|with|of|the|more|fewer|all|new|some|many|few|these|those|its|their|same|type|lint|syntax)\s)errors`,
  String.raw`exits?\s+with\s+an?\s+error`, String.raw`(?:returns?|responds?\s+with)\s+(?:an?\s+)?(?:http\s+)?(?:status\s+)?(?:code\s+)?(?:4\d\d|4xx)`,
  String.raw`(?:is|are)\s+not\s+(?:accepted|permitted)`, String.raw`(?:isn|aren)['’]t\s+(?:accepted|permitted|allowed|printed|shown|written)`,
  String.raw`abort(?:s|ed|ing)?`, String.raw`can(?:not|['’]t)\s+continue`, String.raw`(?:does\s+not|doesn['’]t)\s+print`, String.raw`(?:is|are|gets?)\s+redacted`,
];
const REFUSES = wordsRe(BASE_REFUSALS); // what a covering AC's THEN must say
const REFUSES_ANY = wordsRe([...BASE_REFUSALS, ...MORE_REFUSALS]); // what marks an AC as refusing
// A negation in the few words before a refusal word ("not refused", "never blocks", "doesn't refuse", "no flag is refused").
const NEGATED = /(?:(?<![\p{L}])(?:not|never|no|nor|without)|n['’]t)\s+(?:[\p{L}'’-]+\s+){0,3}$/iu;
// "accepted rather than refused", "runs instead of failing": the word names what does not happen.
const INSTEAD = /(?<![\p{L}])(?:rather\s+than|instead\s+of)\s+(?:[\p{L}'’-]+\s+){0,3}$/iu;
// A quoted, backticked or fenced span is a mention of a word, not the AC's result. It is swapped for a mark.
const SPANS = /```[\s\S]*?```|`[^`]*`|"[^"]*"|“[^”]*”/g;
const MARK = "";

// What names "every other input" in a WHEN: an allowed-list phrase, a quantified rest, or an unknown/unlisted input.
const CATCH_ALL = [
  /\bnot\s+(?:on|in|among|one\s+of|part\s+of|inside)\s+(?:the|an?|that|this|its|any)\s+(?:[\w-]+\s+){0,3}(?:list|allowlist|allow-list|template|set|names|keys|values|flags|inputs)\b/i,
  /\b(?:any|every|all|each)\s+(?:other|remaining|unlisted|unknown|unrecognized|unrecognised|unsupported|unexpected)\b/i,
  /\b(?:anything|everything)\s+else\b/i,
  /\b(?:unknown|unlisted|unrecognized|unrecognised|unsupported|unexpected)\b/i,
  /\bnot\s+(?:listed|allowed|known|recognized|recognised|approved|permitted|supported)\b/i,
];

// What the issue says itself: comments, fenced blocks and quotes are examples or someone else's words.
const FENCE = /^ {0,3}((`|~)\2{2,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1\2*[ \t]*$|(?![\s\S]))/gm;
const QUOTE = /^[ \t]*>.*$/gm;
const STATUS = /^[ \t]*(?:[-*+][ \t]+)?\**status\**[ \t]*:\**[ \t]*([a-z-]+)/im;
const plain = (text) => text.replace(/<!--[\s\S]*?-->/g, "").replace(FENCE, "").replace(QUOTE, "");
const statusOf = (body) => plain(body ?? "").match(STATUS)?.[1].toLowerCase() ?? null;

/** The AC lines of a body, in order: { id, tag, text }. A wrapped line joins its AC; an "Out of scope" section has none. */
export function readAcs(body) {
  const acs = [];
  let current = null;
  let skipping = false;
  for (const line of plain(body ?? "").split(/\r?\n/)) {
    if (/^[ \t]*#{1,6}\s/.test(line)) skipping = /^[ \t]*#{1,6}\s*(?:out of scope|not in scope|non-goals?)\b/i.test(line);
    const start = skipping ? null : line.match(AC_START);
    if (start) {
      acs.push((current = { id: `AC-${start[2]}`, tag: (start[1] ?? start[3] ?? "").toLowerCase(), text: start[4] }));
    } else if (current && line.trim() && !BLOCK_START.test(line)) current.text += ` ${line.trim()}`;
    else current = null;
  }
  return acs.map((ac) => ({ ...ac, text: ac.text.replace(/^[\s*_`]+/, "").trim() }));
}

/**
 * True when `then` holds a refusal word that is not a mention: not in quotes, backticks or a fence, not negated in the
 * few words before it, not after "rather than" or "instead of", and not "is not printed" said of a quoted name.
 */
const refuses = (then) => {
  const said = then.replace(SPANS, MARK);
  return [...said.matchAll(REFUSES)].some((m) => {
    const before = said.slice(0, m.index);
    const ofQuoted = /^(?:is|are)\s/i.test(m[0]) && before.trimEnd().endsWith(MARK);
    return !NEGATED.test(before) && !INSTEAD.test(before) && !ofQuoted;
  });
};

// Lookalike letters that read as Latin: Cyrillic and Greek, both cases. An AC may hide a refusal word with them.
const LOOKALIKES = Object.fromEntries([
  ..."а:a е:e о:o р:p с:c у:y х:x і:i ј:j ѕ:s һ:h ԁ:d к:k м:m н:h т:t в:b А:A В:B Е:E К:K М:M Н:H О:O Р:P С:C Т:T Х:X У:Y І:I Ј:J Ѕ:S".split(" "),
  ..."α:a ο:o ν:v ρ:p ι:i κ:k τ:t υ:u χ:x γ:y ϲ:c Α:A Β:B Ε:E Ζ:Z Η:H Ι:I Κ:K Μ:M Ν:N Ο:O Ρ:P Τ:T Υ:Y Χ:X".split(" "),
].map((pair) => pair.split(":")));
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

/** The text as a reader sees it: compatibility forms folded (NFKC, so full-width letters), invisible characters dropped, lookalikes made Latin. */
export const normalise = (text) => text.normalize("NFKC").replace(INVISIBLE, "").replace(/[Ͱ-ϿЀ-ԯ]/g, (c) => LOOKALIKES[c] ?? c);

/** True when the AC's own THEN refuses (a negated refusal still counts: it is a gate, so it needs the rest covered). */
export function isRefusing(ac) {
  const text = normalise(ac.text);
  const then = WHEN_THEN.exec(text)?.[2] ?? text;
  return then.search(REFUSES_ANY) !== -1;
}

/** True when the AC's WHEN names every other input, its THEN refuses, and it isn't an `agent` check. */
export function coversTheRest(ac) {
  const m = WHEN_THEN.exec(ac.text);
  return Boolean(m) && ac.tag !== "agent" && CATCH_ALL.some((re) => re.test(m[1])) && refuses(m[2]);
}

/** The first refusing AC of a body when no AC covers the rest, else null. Throws when the body has no AC line. */
export function gateGap(body) {
  const acs = readAcs(body);
  if (!acs.length) throw new Error("no AC line");
  const refusing = acs.find(isRefusing);
  return refusing && !acs.some(coversTheRest) ? refusing : null;
}

function problemLine(issue) {
  let gap;
  try {
    gap = gateGap(issue.body);
  } catch {
    return { unreadable: `${issue.label}: no AC line the check can read. Write \`AC-<issue>-<n>: WHEN <situation> THEN <result>\` at the start of a line.` };
  }
  if (!gap) return null;
  return { gap: `${issue.label}: ${gap.id} refuses an input and no AC says what happens to every other input. Add \`AC-<issue>-<n>: WHEN the input is not on the allowed list THEN it is refused\`.` };
}

// An issue file before GitHub: docs/issues/NNN-short-title.md, titled by its first "# " heading.
function fromFile(path) {
  const body = readFileSync(resolve(path), "utf8");
  const number = basename(path).match(/^(\d+)/)?.[1] ?? readAcs(body)[0]?.id.match(/^AC-(\d+)-/)?.[1];
  const title = body.match(/^#\s+(.+)$/m)?.[1].trim();
  return { label: `${number ? `#${number}` : basename(path)}${title ? ` ${title}` : ""}`, body, done: statusOf(body) === "done" };
}

function fromStdin() {
  const issues = JSON.parse(readFileSync(0, "utf8"));
  if (!Array.isArray(issues) || !issues.every((i) => i && (typeof i.body === "string" || i.body === null))) throw new Error("not a list");
  return issues.map((i) => ({ label: `#${i.number} ${i.title ?? ""}`.trim(), body: i.body ?? "", done: false })); // A GitHub body can say "Status: done" to switch the check off, so only a file is skipped.
}

function main(args) {
  let all;
  try {
    all = args.length ? args.map(fromFile) : fromStdin();
  } catch (error) {
    console.error(`check-gate-acs: expected a JSON list of issues with number, title and body on stdin, or issue files (${error.message}).`);
    return 2;
  }
  const issues = all.filter((issue) => !issue.done);
  const skipped = all.length - issues.length;
  if (!issues.length) {
    // An empty list is most often a misspelled milestone or glob, so it never reads as clean.
    console.error(`check-gate-acs: no issues to check (${skipped} done skipped). Check the milestone name or the file list.`);
    return 2;
  }
  const found = issues.map(problemLine).filter(Boolean);
  for (const f of found) console.log(f.unreadable ?? f.gap);
  if (found.length) return found.some((f) => f.unreadable) ? 2 : 1;
  console.log(`${issues.length} issue${issues.length === 1 ? "" : "s"} read${skipped ? `, ${skipped} done skipped` : ""}. No AC refuses an input without an AC for every other input.`);
  return 0;
}

/** True when node started this file, also through a symlinked file or folder (#506, as in check-issue-size.mjs). */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false; // An argv[1] that names no file (a REPL, a loader's stand-in) isn't this module.
  }
}

if (isMainModule()) process.exitCode = main(process.argv.slice(2));
