// #254: a step that asks, waits, offers or leaves work for the person needs its own "On Full" branch. The override at
// the top of a skill lost to the specific step below it, so the scan reads each step on its own.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, ROOT)), "utf8");

// Words that hand a step to the person. "never asks the person" or "don't ask them" says no ask happens.
const NOT = "(?<!\\b(?:never|don.t|doesn.t|not|nothing|no one) )";
export const HANDS_TO_PERSON = new RegExp(`${NOT}(?:${[
  "\\bthen ask\\b", "\\basks? (?:the person|them|the owner|which)\\b", "\\boffers? (?:three|two|one|to|once)\\b",
  "\\b(?:the person|they) picks?\\b", "\\bwithout (?:their|the person.s) yes\\b", "\\bneeds? (?:your|their|the person.s) yes\\b",
  "\\bwaits? (?:for|on) (?:the person|their|a yes|them)\\b", "\\bwaits? (?:\\w+ ){1,2}for (?:the person|them|their)\\b",
  "\\*\\*[^*]+\\*\\* Ask\\b",
].join("|")})`, "i");
// The step's own branch. "(on Full too)" keeps the person, so it isn't one. Lowercase "full automation" isn't either.
const ON_FULL = /\b[Oo]n Full\b(?!,? (?:too|as well)\b)/;

/**
 * A file's steps: each list item (at any depth), table row, heading or paragraph, with the lines that continue it.
 * A child bullet is its own step, so a branch in the parent doesn't cover it.
 */
export const steps = (text) => {
  const out = [];
  let cur = null;
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t) cur = null;
    else if (!cur || /^(?:[-*] |\d+\. |#|\|)/.test(t)) out.push((cur = { line: i + 1, text: t }));
    else cur.text += ` ${t}`;
  });
  return out;
};

/** The steps in `text` that hand something to the person with no On Full branch of their own. */
export const unbranched = (text) => steps(text).filter((s) => HANDS_TO_PERSON.test(s.text) && !ON_FULL.test(s.text));

/** Every unbranched step in these files, as "file:line: text". */
export const scan = (files) => files.flatMap((f) => unbranched(read(f)).map((s) => `${f}:${s.line}: ${s.text.slice(0, 120)}`));

/** The .md files under a repo folder. */
export const mdFiles = (dir) => readdirSync(fileURLToPath(new URL(dir, ROOT)), { recursive: true })
  .filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f.replaceAll("\\", "/")}`);
