#!/usr/bin/env node
// Checks each issue's Size: line (the issues skill, #375): an estimate under 1,000 changed lines, a stated
// exception, or a split parent that names its open children. Read only: it writes nothing. The consistency check runs it.
// Usage:  gh issue list --limit 200 --json number,title,body,labels | node check-issue-size.mjs    issues on stdin
//         node check-issue-size.mjs docs/issues/*.md     issue files, before GitHub; a `Status: done` file is skipped
// Exit 0: every issue passes. Exit 1: one line per issue with a gap. Exit 2: the input can't be read, or holds no issue.
// It fails closed: an estimate it can't read in the one shape below fails, so it never passes 1,000 or more.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMIT = 1000; // changed lines; at this or over, the issue is split

// A Size: value starts a line (after a list dash or bold) or follows a "·". Any case; "**Size:**" or "**Size**:".
const SIZE = /^\**size\**[ \t]*:\**[ \t]*/i;
const LIST_MARK = /^[ \t]*(?:[-*+][ \t]+)?/;
// The one estimate shape: an optional qualifier, one number or a range (each with an optional k), an optional
// "changed", then "lines" or "loc". Thousands are grouped by a comma or a space; a decimal needs a k ("1.5k").
const QTY = String.raw`(\d+(?:[.,]\d{1,2})?\s*k|\d{1,3}(?:[,    ]\d{3})+|\d+)`;
const ESTIMATE = new RegExp(
  String.raw`^(?:(?:about|around|roughly|approximately|approx\.?|under|up to|at most|~|≈|<|≤)\s*)?` +
    String.raw`${QTY}(?:\s*(?:-|to|[‐-―−])\s*${QTY})?\s*(?:changed\s+)?(?:lines?|loc)$`,
  "i",
);
// The two whole forms, each only at the start of the value or right after a "·".
const EXCEPTION = /^exception:\s*/i;
const SPLIT = /^split into\s+(#\d+(?:\s*(?:,|&|and)\s*#\d+)*)\s*$/i;
const FENCE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm;
const QUOTE = /^[ \t]*>.*$/gm;
const DONE = /^Status:\s*done\b/im;
const READY_FILE = /^Status:\s*ready\b/im;

// What the issue says itself: comments, fenced blocks and quotes are examples or someone else's words.
const plain = (text) => text.replace(/<!--[\s\S]*?-->/g, "").replace(FENCE, "").replace(QUOTE, "");

// Every Size: value in the body, each up to the next Size: or the end of its line.
function sizeValues(body) {
  const values = [];
  for (const line of plain(body).split(/\r?\n/)) {
    let current = null;
    for (const segment of line.replace(LIST_MARK, "").split("·").map((s) => s.trim())) {
      if (SIZE.test(segment)) values.push((current = [segment.replace(SIZE, "")]));
      else current?.push(segment);
    }
  }
  return values.map((segments) => segments.join(" · "));
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
  }
  if (split) size.split = split[1].match(/\d+/g).map(Number);
  return size;
}

/** The issue's first Size value as { estimate, exception, split?, unreadable? }, or null when it has none. */
export function readSize(body) {
  const [value] = sizeValues(body);
  return value === undefined ? null : parse(value);
}

const isReady = ({ body, labels }) =>
  (labels ?? []).some((l) => (typeof l === "string" ? l : l?.name) === "status:ready") || READY_FILE.test(plain(body ?? ""));

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
  const values = sizeValues(issue.body ?? "");
  if (values.length > 1) return `${values.length} Size: lines. Keep one: \`Size: <estimate> lines · <files or modules>\`.`;
  if (!values.length) return "no Size: line. Write `Size: <estimate> lines · <files or modules>`.";
  const size = parse(values[0]);
  if (size.unreadable) return `can't read this estimate: "${size.unreadable}". Write one total, like \`Size: about 600 lines · <files or modules>\`.`;
  if (size.exception === "") return "the Size: exception has no reason. Write `Size: exception: <reason>`.";
  if (size.exception) return null;
  if (size.split) return splitProblem(issue, size.split, open);
  if (size.estimate === null) return "the Size: line has no estimate. Write `Size: <estimate> lines · <files or modules>`.";
  if (size.estimate >= LIMIT) {
    return `the estimate is ${comma(size.estimate)} lines, 1,000 or more. Split it into child issues, or write \`Size: exception: <reason>\`.`;
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
