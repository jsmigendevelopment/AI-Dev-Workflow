// Tests for issue sizing (#375): every issue the issues skill writes carries a Size: line under 1,000 changed lines,
// or a stated exception, and the read-only consistency check fails an issue at 1,000 or over and names it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";
import { checkSizes, readSize } from "../../.agents/skills/issues/scripts/check-issue-size.mjs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const SCRIPT = fileURLToPath(new URL("../../.agents/skills/issues/scripts/check-issue-size.mjs", import.meta.url));
const skill = read(".agents/skills/issues/SKILL.md");
const consistency = read(".agents/skills/issues/references/consistency.md");
const template = read(".agents/skills/issues/templates/slice.md");

// An issue body written from the template, with its Size line filled in.
const body = (size) => template.replace(/^\*\*Size:\*\*.*$/m, `**Size:** ${size}`);
const issue = (number, size, title = `Issue ${number}`) => ({ number, title, body: body(size) });
const run = (args, input, cwd = tmp()) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, input, encoding: "utf8", env: safeEnv() });

test("AC-375-1: WHEN issues writes an issue THEN the template asks for a Size line with the estimate and the files", () => {
  assert.match(template, /^\*\*Size:\*\* <!--.*changed lines.*not counting generated files, lockfiles and test fixtures.*files or modules/m);
  assert.match(template, /1,000 or more: split it\..*Size: exception: <reason>/);
  assert.equal(read(".github/ISSUE_TEMPLATE/slice.md"), template);
});

test("AC-375-1: WHEN issues writes an issue THEN the skill splits an estimate of 1,000 or more before it is ready", () => {
  assert.match(skill, /Write `Size: <estimate> lines · <files or modules>`/);
  assert.match(skill, /not counting generated files, lockfiles and test fixtures/);
  assert.match(skill, /An estimate of 1,000 or more is split into child issues before it's ready/);
  assert.match(skill, /`Size: exception: <reason>`/);
  assert.match(skill, /`status:ready` once nothing blocks it: no `\[NEEDS CLARIFICATION\]` left, complexity 7 or under, a size under 1,000 or an exception/);
});

test("AC-375-1: WHEN an issue has an estimate under 1,000 or a stated exception THEN the check passes it", () => {
  assert.deepEqual(readSize(body("about 150 lines · .agents/skills/issues, cli/test")), { estimate: 150, exception: null });
  assert.deepEqual(readSize(body("999 lines · features/lists")), { estimate: 999, exception: null });
  assert.deepEqual(readSize("Complexity: 2 · Size: about 150 lines · Skills: issues"), { estimate: 150, exception: null });
  const rename = readSize(body("about 2,400 lines · exception: a mechanical rename across every module"));
  assert.deepEqual(rename, { estimate: 2400, exception: "a mechanical rename across every module" });
  assert.deepEqual(checkSizes([issue(1, "about 150 lines · cli/src"), issue(2, "exception: a mechanical rename")]), []);
});

test("AC-375-1: WHEN the template's Size line is left blank THEN the check says it has no estimate", () => {
  assert.deepEqual(checkSizes([{ number: 3, title: "Blank", body: template }]),
    ["#3 Blank: the Size: line has no estimate. Write `Size: <estimate> lines · <files or modules>`."]);
});

test("AC-375-2: WHEN an issue's estimate is 1,000 or more with no exception THEN the check fails and names it", () => {
  for (const size of ["1,000 lines · cli/src", "1000 lines", "about 1.2k lines", "800–1,200 lines · cli/src", "2,400 lines"]) {
    const problems = checkSizes([issue(7, "about 150 lines"), issue(12, size, "Big step")]);
    assert.equal(problems.length, 1, size);
    assert.match(problems[0], /^#12 Big step: the estimate is [\d,]+ lines, 1,000 or more\. Split it into child issues, or write `Size: exception: <reason>`\.$/, size);
  }
});

test("AC-375-2: WHEN an issue has no Size line, or an exception with no reason, THEN the check fails and names it", () => {
  assert.deepEqual(checkSizes([{ number: 4, title: "No size", body: "## Goal\n\nComplexity: 2 · one file\n" }]),
    ["#4 No size: no Size: line. Write `Size: <estimate> lines · <files or modules>`."]);
  assert.deepEqual(checkSizes([issue(5, "1,500 lines · exception:", "Empty reason")]),
    ["#5 Empty reason: the Size: exception has no reason. Write `Size: exception: <reason>`."]);
});

test("AC-375-2: WHEN the consistency check pipes the pass's issues in THEN the script exits 1 and names each oversized one", () => {
  const issues = [issue(7, "about 150 lines · cli/src"), issue(12, "1,400 lines · cli/src", "Big step")];
  const r = run([], JSON.stringify(issues));
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^#12 Big step: the estimate is 1,400 lines, 1,000 or more\./m);
  assert.doesNotMatch(r.stdout, /#7/);
  const clean = run([], JSON.stringify([issues[0]]));
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /1 issue read\. Every Size: line is under 1,000 lines or a stated exception\./);
});

test("AC-375-2: WHEN there is no GitHub yet THEN the script reads docs/issues files and names them by number and title", () => {
  const dir = tmp();
  put(dir, "docs/issues/012-big-step.md", `# Big step\n\nStatus: ready\n\n${body("1,100 lines · cli/src")}`);
  put(dir, "docs/issues/013-small-step.md", `# Small step\n\nStatus: ready\n\n${body("200 lines · cli/src")}`);
  const r = run(["docs/issues/012-big-step.md", "docs/issues/013-small-step.md"], "", dir);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout.trim().split("\n")[0], "#12 Big step: the estimate is 1,100 lines, 1,000 or more. Split it into child issues, or write `Size: exception: <reason>`.");
  assert.doesNotMatch(r.stdout, /#13/);
});

test("AC-375-2: WHEN the input isn't a list of issues THEN the script exits 2 and reads nothing as clean", () => {
  const r = run([], "not json");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /expected a JSON list of issues/);
});

test("AC-375-2: the read-only consistency check runs the size script and reports each issue it names", () => {
  assert.match(consistency, /gh issue list --milestone "<name>" --state open --json number,title,body \| node \.agents\/skills\/issues\/scripts\/check-issue-size\.mjs/);
  assert.match(consistency, /node \.agents\/skills\/issues\/scripts\/check-issue-size\.mjs docs\/issues\/\*\.md/);
  assert.match(consistency, /Report each issue it names/);
});
