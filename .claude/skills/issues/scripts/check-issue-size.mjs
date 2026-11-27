#!/usr/bin/env node
// Checks each issue's Size: line (the issues skill, #375): an estimate under 1,000 changed lines, a stated
// exception, or a split parent that names its open children. Read only: it writes nothing. The consistency check runs it.
// Usage:  gh issue list --limit 200 --json number,title,body,labels | node check-issue-size.mjs    issues on stdin
//         node check-issue-size.mjs docs/issues/*.md     issue files, before GitHub; a `Status: done` file is skipped
// Exit 0: every issue passes. Exit 1: one line per issue with a gap. Exit 2: the input can't be read, holds no issue,
// or has a split parent with no labels.
// It fails closed: an estimate it can't read in the one shape below fails, so it never passes 1,000 or more.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMIT = 1000; // changed lines; at this or over, the issue is split

// A Size: value starts a line (after a list dash or bold) or follows a "·". Any case; "**Size:**" or "**Size**:".
const SIZE = /^\**size\**[ \t]*:\**[ \t]*/i;
const LIST_MARK = /^[ \t]*(?:[-*+][ \t]+)?/;
// The one estimate shape: an optional qualifier, one number or a range (each with an optional k), then "lines" or
// "loc", with "changed" before or after. Thousands are grouped by a comma or a space; a decimal needs a k ("1.5k").
const QTY = String.raw`(\d+(?:[.,]\d{1,2})?\s*k|\d{1,3}(?:[,    ]\d{3})+|\d+)`;
const ESTIMATE = new RegExp(
  String.raw`^(?:(?:about|around|roughly|approximately|approx\.?|under|up to|at most|~|≈|<|≤)\s*)?` +
    String.raw`${QTY}(?:\s*(?:-|to|[‐-―−])\s*${QTY})?\s*(?:changed\s+)?(?:lines?|loc)(?:\s+changed)?\.?$`,
  "i",
);
const LIMIT_WORD = /^(?:under|up to|at most|<|≤)/i;
// A number of lines in a later part of the value, one word allowed before the unit: a second estimate. So is "test"
// next to a number, also after a bracket or a qualifier ("tests: about 600", "tests (600)", "600 in tests").
// "#1024", "1200-x.ts", "test/12-x.ts" or "AC-12-1 tests" isn't one.
const SECOND = /\d\+?\s*k?\s*(?:\p{L}+\s+)?(?:lines?|loc)(?!\p{L})/iu;
const TESTS = /(?<![\p{L}\p{N}])tests?(?![\p{L}\p{N}/._-])[\s:=~≈+(]*(?:(?:about|around|roughly|approx\.?|another|add|adds|plus)\s*)?\d|(?<![\p{L}\p{N}#/._-])\d[\d,.]*\s*k?\s*(?:\p{L}+\s+)?tests?(?![\p{L}\p{N}/._-])/iu;
// The two whole forms, each only at the start of the value or right after a "·".
const EXCEPTION = /^exception:\s*/i;
const SPLIT = /^split into\s+(#\d+(?:\s*(?:,|&|and)\s*#\d+)*)\s*$/i;
// A reason that says there is none, once its punctuation is gone: "n/a", "-", "<reason>", "TBD.", "not needed", or one
// that starts with none, tbd, tbc, todo or n/a ("none yet", "TBD later"). "none of it splits" and "no way to split" are real.
const PLACEHOLDERS = new Set(["", "none", "na", "no", "nil", "null", "tbd", "tbc", "todo", "unknown", "reason", "nope",
  "nothing", "later", "no reason", "no reason yet", "no reason given", "not needed", "not applicable", "no need",
  "to be decided", "to be confirmed", "unknown yet"]);
const PLACEHOLDER_START = /^(?:none(?! of\b)|tbd|tbc|todo|na)\b/;
// A reason that names an issue or says it is split is a split parent written as an exception: "split into", "splitting
// into", "broken into", "already split", "Split.", "child issues", "children 12 and 13". A "no", "can't", "too" or the
// like in the same clause, right before it, makes it a real reason ("can't be split into parts"); one in an earlier
// clause doesn't ("too big, split into child issues").
const SPLIT_SAID = new RegExp(
  String.raw`(?<!\p{L})(?:(?:already|was|been|is|are|now|got)\s+split|split(?:s|ting)?(?:\s+up)?\s+(?:into|in|across|between|as)` +
    String.raw`|(?:broken|cut)(?:\s+up)?\s+into|split\s*[.!]?\s*$|child(?:ren)?\s+issues?|children\s+#?\d+)(?!\p{L})`,
  "giu",
);
const CLAUSE = /[,;:.()]/;
const NEGATION = /(?<!\p{L})(?:no|not|never|cannot|can['’]?t|won['’]?t|don['’]?t|doesn['’]?t|isn['’]?t|unable|without|hard|too)(?!\p{L})/iu;
// Size written in a way the value reader skips: a table cell, "_Size_:", a full-width colon, "Size -". The unit follows
// the number, with a "+" and any one word allowed between ("1500+ lines", "1,500 code lines"), but not a unit like px or
// MB, so "font size: 16px, line-height: 24px" and "font size: 16px line-height" aren't one.
const MENTION = /(?<!\p{L})size(?!\p{L})[\s_*`]*[:：|=\-–—][^\n]*?\d\+?\s*k?\s*(?:(?!(?:px|pt|em|rem|vh|vw|kb|mb|gb|tb|bytes?)\s)\p{L}+\s+)?(?:lines?|loc)(?!\p{L})/iu;
// CommonMark: up to 3 spaces of indent, closed by a run of the same character at least as long.
const FENCE = /^ {0,3}((`|~)\2{2,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1\2*[ \t]*$|(?![\s\S]))/gm;
const QUOTE = /^[ \t]*>.*$/gm;
const STATUS = /^[ \t]*(?:[-*+][ \t]+)?\**status\**[ \t]*:\**[ \t]*([a-z-]+)/im;

// What the issue says itself: comments, fenced blocks and quotes are examples or someone else's words.
const plain = (text) => text.replace(/<!--[\s\S]*?-->/g, "").replace(FENCE, "").replace(QUOTE, "");
const statusOf = (body) => plain(body ?? "").match(STATUS)?.[1].toLowerCase() ?? null;

// Every Size: value in the body, each up to the next Size: or the end of its line, and each line that mentions a
// size in lines but holds no value the reader takes.
function scan(body) {
  const values = [];
  const unread = [];
  for (const line of plain(body).split(/\r?\n/)) {
    const before = values.length;
    let current = null;
    for (const segment of line.replace(LIST_MARK, "").split("·").map((s) => s.trim())) {
      if (SIZE.test(segment)) values.push((current = [segment.replace(SIZE, "")]));
      else current?.push(segment);
    }
    if (values.length === before && MENTION.test(line)) unread.push(line.trim());
  }
  return { values: values.map((segments) => segments.join(" · ")), unread };
}

const count = (qty) => {
  const k = /k$/i.test(qty);
  const n = k ? Number(qty.replace(/\s*k$/i, "").replace(",", ".")) * 1000 : Number(qty.replace(/\D/g, ""));
  return Math.round(n);
};
const comma = (n) => n.toLocaleString("en-US");

function parse(value) {
  const segments = value.split("·").map((s) => s.trim());
  const [head] = segments;
  const exception = segments.find((s) => EXCEPTION.test(s));
  const split = segments.map((s) => s.match(SPLIT)).find(Boolean);
  const size = { estimate: null, exception: exception === undefined ? null : exception.replace(EXCEPTION, "") };
  if (!EXCEPTION.test(head) && !SPLIT.test(head)) {
    const match = head.match(ESTIMATE);
    if (match) size.estimate = Math.max(...match.slice(1).filter(Boolean).map(count));
    else if (/\d/.test(head)) size.unreadable = head;
    if (match && LIMIT_WORD.test(head)) size.limit = true;
  }
  const second = segments.slice(1).find((s) => !EXCEPTION.test(s) && !SPLIT.test(s) && (SECOND.test(s) || TESTS.test(s)));
  if (second !== undefined) size.second = second;
  if (split) size.split = split[1].match(/\d+/g).map(Number);
  return size;
}

/** The issue's first Size value as { estimate, exception, split?, unreadable?, second?, limit? }, or null when it has none. */
export function readSize(body) {
  const [value] = scan(body).values;
  return value === undefined ? null : parse(value);
}

const noReason = (reason) => {
  const words = reason.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  return PLACEHOLDERS.has(words) || PLACEHOLDER_START.test(words);
};
const splitReason = (reason) =>
  /#\d+/.test(reason) || [...reason.matchAll(SPLIT_SAID)].some((m) => !NEGATION.test(reason.slice(0, m.index).split(CLAUSE).pop()));
const labelledReady = (labels) =>
  (labels ?? []).some((l) => String(typeof l === "string" ? l : l?.name).toLowerCase() === "status:ready");
// A file is ready unless it says blocked: coordinate's local mode adds `Status: ready` to a file with no status line.
const isReady = (issue) =>
  issue.file ? statusOf(issue.body) !== "blocked" : labelledReady(issue.labels) || statusOf(issue.body) === "ready";

// A split parent names at least one other issue in the list, never itself, and is never ready.
function splitProblem(issue, split, open) {
  if (split.includes(issue.number)) return "the split names itself. Name its child issues: `Size: split into #<child>, #<child>`.";
  if (!split.some((n) => open.has(n))) {
    return `none of its children (${split.map((n) => `#${n}`).join(", ")}) is open in this list. Close it once its last child merges, or name its open children.`;
  }
  if (isReady(issue)) return "a split parent is never ready. Remove `status:ready`, or in a file write `Status: blocked`, until its last child is done.";
  return null;
}

function sizeProblem(issue, open) {
  const { values, unread } = scan(issue.body ?? "");
  const total = "Write one total, like `Size: about 600 lines · <files or modules>`.";
  if (unread.length) return `a Size the check can't read: "${unread[0]}". Write \`Size: about 600 lines · <files or modules>\` at the start of a line.`;
  if (values.length > 1) return `${values.length} Size: lines. Keep one: \`Size: <estimate> lines · <files or modules>\`.`;
  if (!values.length) return "no Size: line. Write `Size: <estimate> lines · <files or modules>`.";
  const size = parse(values[0]);
  if (size.unreadable) return `can't read this estimate: "${size.unreadable}". ${total}`;
  if (size.second !== undefined) return `a second estimate after the "·": "${size.second}". ${total}`;
  if (size.exception !== null && (size.split || splitReason(size.exception))) return "the Size: line states both an exception and a split. Keep one.";
  if (size.exception !== null) return noReason(size.exception) ? "the Size: exception has no reason. Write `Size: exception: <reason>`." : null;
  if (size.split) return splitProblem(issue, size.split, open);
  if (size.estimate === null) return "the Size: line has no estimate. Write `Size: <estimate> lines · <files or modules>`.";
  if (size.estimate >= LIMIT) {
    const hint = size.limit ? " Write your estimate, not the limit." : "";
    return `the estimate is ${comma(size.estimate)} lines, 1,000 or more. Split it into child issues, or write \`Size: exception: <reason>\`.${hint}`;
  }
  return null;
}

/** One message per issue with a gap: no Size line or two, an unreadable or missing estimate, 1,000 or more, or a bad split. */
export function checkSizes(issues) {
  const open = new Set(issues.map((i) => i.number));
  return issues.flatMap((issue) => {
    const problem = sizeProblem(issue, new Set([...open].filter((n) => n !== issue.number)));
    return problem ? [`#${issue.number} ${issue.title}: ${problem}`] : [];
  });
}

// An issue file before GitHub: docs/issues/NNN-short-title.md, titled by its first "# " heading.
function fromFile(path) {
  const body = readFileSync(resolve(path), "utf8");
  const number = Number(basename(path).match(/^(\d+)/)?.[1] ?? NaN);
  const title = body.match(/^#\s+(.+)$/m)?.[1].trim() ?? basename(path);
  return { number: Number.isNaN(number) ? basename(path) : number, title, body, file: true, done: statusOf(body) === "done" };
}

// The REST API sends an empty body as null. Labels are `gh issue list --json labels`'s list. Only a split parent
// needs them, to tell whether it is ready, so one with no labels can't be read as not ready.
function fromStdin() {
  const issues = JSON.parse(readFileSync(0, "utf8"));
  if (!Array.isArray(issues) || !issues.every((i) => i && (typeof i.body === "string" || i.body === null))) throw new Error("not a list");
  if (!issues.every((i) => i.labels == null || Array.isArray(i.labels))) throw new Error("labels must be a list");
  const bare = issues.find((i) => i.labels == null && scan(i.body ?? "").values.some((v) => parse(v).split));
  if (bare) throw new Error(`#${bare.number} is a split parent with no labels, so whether it is ready can't be read`);
  return issues;
}

function main(args) {
  let all;
  try {
    all = args.length ? args.map(fromFile) : fromStdin();
  } catch (error) {
    console.error(`check-issue-size: expected a JSON list of issues with number, title, body and labels on stdin, or issue files (${error.message}).`);
    return 2;
  }
  const issues = all.filter((issue) => !issue.done);
  const skipped = all.length - issues.length;
  if (!issues.length) {
    // An empty list is most often a misspelled milestone or glob, so it never reads as clean.
    console.error(`check-issue-size: no issues to check (${skipped} done skipped). Check the milestone name or the file list.`);
    return 2;
  }
  const problems = checkSizes(issues);
  for (const line of problems) console.log(line);
  const read = `${issues.length} issue${issues.length === 1 ? "" : "s"} read${skipped ? `, ${skipped} done skipped` : ""}.`;
  console.log(problems.length ? `${read} ${problems.length} with a size gap.` : `${read} Every Size: line is under 1,000 lines or a stated exception.`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
