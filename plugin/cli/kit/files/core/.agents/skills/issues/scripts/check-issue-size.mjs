#!/usr/bin/env node
// Checks each issue's Size: line (the issues skill, #375): an estimate under 1,000 changed lines, a stated
// exception, or a split parent that names its children. Read only: it writes nothing. The consistency check runs it.
// Usage:  gh issue list --limit 200 --json number,title,body | node check-issue-size.mjs    issues as JSON on stdin
//         node check-issue-size.mjs docs/issues/*.md     issue files, before GitHub; a `Status: done` file is skipped
// Exit 0: every issue passes. Exit 1: one line per issue with a gap. Exit 2: the input can't be read, or holds no issue.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMIT = 1000; // changed lines; at this or over, the issue is split

// "Size:" at the start of a line (after a list dash, quote or bold) or after a "·" separator, as in
// "Complexity: 2 · Size: about 150 lines · Skills: issues".
const SIZE_LINES = /(?:^[\s>*-]*|·\s*)\**Size:\**[ \t]*(.*)$/gm;
const EXCEPTION = /\bexception:\s*(.*)$/i;
// A split parent: "split into #12, #13" or "split into #12 and #13".
const SPLIT = /\bsplit into\s+(#\d+(?:\s*(?:,|&|and)\s*#\d+)*)/i;
// The files come after the first separator, or after the first "lines" or "loc" ("1.5kLOC" counts; "guidelines" doesn't).
const SEPARATOR = /\s[·|]\s|;/;
const UNIT = /(?<![a-jl-z])(?:lines?|loc)\b/i;
// A number of lines, not one inside "#1024" or "src/1200-x.ts". Thousands are split by ",", ".", "'" or a space and
// always have three digits after it: "1,200", "1.000", "1 200". A dot or comma before other digits is a decimal:
// "1.5k", "1,25k". A "k" (also glued to "loc" or "lines") means thousands.
const NUMBER = /(?<![#\w/.])(\d{1,3}(?:[,.'    ]\d{3})+(?!\d)|\d+)(?:[.,](\d+))?(\s*k(?![a-jm-z]))?/gi;
const FENCE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm;
const DONE = /^Status:\s*done\b/im;

// What a reader sees: HTML comments and fenced blocks are examples, never the issue's own Size line.
const plain = (text) => text.replace(/<!--[\s\S]*?-->/g, "").replace(FENCE, "");
const sizeLines = (body) => [...plain(body).matchAll(SIZE_LINES)].map((m) => m[1]);
const count = ([, whole, decimal, k]) => {
  const n = Number(`${whole.replace(/\D/g, "")}${decimal ? `.${decimal}` : ""}`);
  return Math.round(k ? n * 1000 : n);
};
const comma = (n) => n.toLocaleString("en-US");

function parse(line) {
  // The estimate comes first; the files after it may hold numbers too.
  let [estimatePart] = line.split(SEPARATOR);
  estimatePart = estimatePart.replace(EXCEPTION, "").replace(SPLIT, "");
  const unit = estimatePart.match(UNIT);
  if (unit) estimatePart = estimatePart.slice(0, unit.index + unit[0].length);
  const numbers = [...estimatePart.matchAll(NUMBER)].map(count);
  const exception = line.match(EXCEPTION);
  const split = line.match(SPLIT);
  const size = {
    estimate: numbers.length ? Math.max(...numbers) : null,
    exception: exception ? exception[1].replace(/\s*·.*$/, "").trim() : null,
  };
  if (split) size.split = split[1].match(/\d+/g).map(Number);
  return size;
}

/** The issue's Size line as { estimate, exception, split? }, or null when it has none. Comments and fences don't count. */
export function readSize(body) {
  const [line] = sizeLines(body);
  return line === undefined ? null : parse(line);
}

/** One message per issue with a gap: no Size line or two, no estimate, an empty exception, or 1,000 or more. */
export function checkSizes(issues) {
  const problems = [];
  for (const { number, title, body } of issues) {
    const name = `#${number} ${title}`;
    const lines = sizeLines(body ?? "").length;
    const size = readSize(body ?? "");
    if (lines > 1) problems.push(`${name}: ${lines} Size: lines. Keep one: \`Size: <estimate> lines · <files or modules>\`.`);
    else if (!size) problems.push(`${name}: no Size: line. Write \`Size: <estimate> lines · <files or modules>\`.`);
    else if (size.exception === "") problems.push(`${name}: the Size: exception has no reason. Write \`Size: exception: <reason>\`.`);
    else if (size.exception || size.split) continue;
    else if (size.estimate === null) problems.push(`${name}: the Size: line has no estimate. Write \`Size: <estimate> lines · <files or modules>\`.`);
    else if (size.estimate >= LIMIT) {
      problems.push(`${name}: the estimate is ${comma(size.estimate)} lines, 1,000 or more. Split it into child issues, or write \`Size: exception: <reason>\`.`);
    }
  }
  return problems;
}

// An issue file before GitHub: docs/issues/NNN-short-title.md, titled by its first "# " heading.
function fromFile(path) {
  const body = readFileSync(resolve(path), "utf8");
  const number = Number(basename(path).match(/^(\d+)/)?.[1] ?? NaN);
  const title = body.match(/^#\s+(.+)$/m)?.[1].trim() ?? basename(path);
  return { number: Number.isNaN(number) ? basename(path) : number, title, body, done: DONE.test(body) };
}

// The REST API sends an empty body as null.
function fromStdin() {
  const issues = JSON.parse(readFileSync(0, "utf8"));
  if (!Array.isArray(issues) || !issues.every((i) => i && (typeof i.body === "string" || i.body === null))) throw new Error("not a list");
  return issues;
}

function main(args) {
  let all;
  try {
    all = args.length ? args.map(fromFile) : fromStdin();
  } catch (error) {
    console.error(`check-issue-size: expected a JSON list of issues with number, title and body on stdin, or issue files (${error.message}).`);
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
