#!/usr/bin/env node
// Checks each issue's Size: line (the issues skill, #375): an estimate under 1,000 changed lines, or a stated
// exception. Read only: it writes nothing. The consistency check runs it. No dependencies.
// Usage:  gh issue list --json number,title,body | node check-issue-size.mjs    issues as JSON on stdin
//         node check-issue-size.mjs docs/issues/*.md                            issue files, before GitHub
// Exit 0: every issue passes. Exit 1: one line per issue with a gap. Exit 2: the input can't be read.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LIMIT = 1000; // changed lines; at this or over, the issue is split

// "Size:" at the start of a line (after a list dash or bold) or after a "·" separator, as in
// "Complexity: 2 · Size: about 150 lines · Skills: issues".
const SIZE_LINE = /(?:^[\s>*-]*|·\s*)\**Size:\**[ \t]*(.*)$/m;
const EXCEPTION = /\bexception:\s*(.*)$/i;
// A number of lines: "1,200", "1200" or "1.2k".
const NUMBER = /(\d+(?:[.,]\d+)*)\s*(k\b)?/gi;

const plain = (text) => text.replace(/<!--[\s\S]*?-->/g, "");
const count = ([, digits, k]) => (k ? Math.round(Number(digits.replaceAll(",", "")) * 1000) : Number(digits.replace(/[.,]/g, "")));
const comma = (n) => n.toLocaleString("en-US");

/** The issue's Size line as { estimate, exception }, or null when it has none. HTML comments don't count. */
export function readSize(body) {
  const line = plain(body).match(SIZE_LINE);
  if (!line) return null;
  // The estimate comes before the first separator; the files after it may hold numbers too.
  const [estimatePart] = line[1].split(/\s[·|]\s|;/);
  const numbers = [...estimatePart.replace(EXCEPTION, "").matchAll(NUMBER)].map(count);
  const exception = line[1].match(EXCEPTION);
  return {
    estimate: numbers.length ? Math.max(...numbers) : null,
    exception: exception ? exception[1].replace(/\s*·.*$/, "").trim() : null,
  };
}

/** One message per issue with a gap: no Size line, no estimate, an empty exception, or 1,000 or more. */
export function checkSizes(issues) {
  const problems = [];
  for (const { number, title, body } of issues) {
    const name = `#${number} ${title}`;
    const size = readSize(body ?? "");
    if (!size) problems.push(`${name}: no Size: line. Write \`Size: <estimate> lines · <files or modules>\`.`);
    else if (size.exception === "") problems.push(`${name}: the Size: exception has no reason. Write \`Size: exception: <reason>\`.`);
    else if (size.exception) continue;
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
  return { number: Number.isNaN(number) ? basename(path) : number, title, body };
}

function fromStdin() {
  const issues = JSON.parse(readFileSync(0, "utf8"));
  if (!Array.isArray(issues) || !issues.every((i) => i && typeof i.body === "string")) throw new Error("not a list");
  return issues;
}

function main(args) {
  let issues;
  try {
    issues = args.length ? args.map(fromFile) : fromStdin();
  } catch (error) {
    console.error(`check-issue-size: expected a JSON list of issues with number, title and body on stdin, or issue files (${error.message}).`);
    return 2;
  }
  const problems = checkSizes(issues);
  for (const line of problems) console.log(line);
  const read = `${issues.length} issue${issues.length === 1 ? "" : "s"} read.`;
  console.log(problems.length ? `${read} ${problems.length} with a size gap.` : `${read} Every Size: line is under 1,000 lines or a stated exception.`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
