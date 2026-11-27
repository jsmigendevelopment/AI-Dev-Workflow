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
  assert.match(consistency, /gh issue list --milestone "<name>" --state open --limit 200 --json number,title,body \| node \.agents\/skills\/issues\/scripts\/check-issue-size\.mjs/);
  assert.match(consistency, /node \.agents\/skills\/issues\/scripts\/check-issue-size\.mjs docs\/issues\/\*\.md/);
  assert.match(consistency, /Report each issue it names/);
});

test("AC-375-2: WHEN a decimal k sits next to loc or lines THEN it reads as thousands with its decimal", () => {
  assert.equal(readSize(body("about 1.5kLOC · cli/src")).estimate, 1500);
  assert.equal(readSize(body("~1.2kloc")).estimate, 1200);
  assert.equal(readSize(body("1.25k lines")).estimate, 1250);
  assert.equal(readSize(body("1,5k lines")).estimate, 1500);
  for (const size of ["about 1.5kLOC · cli/src", "~1.2kloc"]) {
    assert.equal(checkSizes([issue(12, size, "Big step")]).length, 1, size);
  }
});

test("AC-375-2: WHEN thousands are split by a space THEN 1 200 lines reads as 1,200, never 200", () => {
  assert.equal(readSize(body("1 200 lines · cli/src")).estimate, 1200);
  assert.equal(readSize(body("about 2 400 lines")).estimate, 2400);
  assert.equal(checkSizes([issue(12, "1 200 lines · cli/src", "Big step")]).length, 1);
});

test("AC-375-2: WHEN numbers sit in the file list next to the estimate THEN only the estimate counts", () => {
  assert.equal(readSize(body("about 300 lines, split from #1024")).estimate, 300);
  assert.equal(readSize(body("about 300 lines (src/routes/1200-x.ts)")).estimate, 300);
  assert.equal(readSize(body("about 1,200 changed lines in src/routes/12-x.ts")).estimate, 1200);
  assert.deepEqual(checkSizes([issue(7, "about 300 lines, split from #1024"), issue(8, "about 300 lines (src/routes/1200-x.ts)")]), []);
});

test("AC-375-2: WHEN an issue has more than one Size line THEN the check fails and names it", () => {
  const two = { number: 9, title: "Two sizes", body: `${body("200 lines · cli/src")}\n\nSize: 1,500 lines · cli/src\n` };
  assert.deepEqual(checkSizes([two]),
    ["#9 Two sizes: 2 Size: lines. Keep one: `Size: <estimate> lines · <files or modules>`."]);
});

test("AC-375-2: WHEN a Size line sits in a fenced block or an HTML comment THEN it doesn't count", () => {
  for (const fence of ["```", "~~~"]) {
    const fenced = `## Goal\n\n${fence}text\nSize: 200 lines\n${fence}\n\n<!--\nSize: 300 lines\n-->\nComplexity: 2\n`;
    assert.deepEqual(checkSizes([{ number: 4, title: "Fenced", body: fenced }]),
      ["#4 Fenced: no Size: line. Write `Size: <estimate> lines · <files or modules>`."], fence);
    const real = { number: 5, title: "Big step", body: `${fenced}\nSize: 1,500 lines · cli/src\n` };
    assert.match(checkSizes([real])[0], /^#5 Big step: the estimate is 1,500 lines, 1,000 or more\./, fence);
  }
});

test("AC-375-1: WHEN an issue is split THEN the parent's Size line names its children and the check passes it", () => {
  assert.match(skill, /The parent's Size line becomes `Size: split into #<child>, #<child>`/);
  assert.match(skill, /The parent never gets `status:ready` and is never built/);
  assert.match(template, /The parent of a split: "Size: split into #<child>, #<child>"/);
  assert.deepEqual(readSize(body("split into #12, #13")), { estimate: null, exception: null, split: [12, 13] });
  assert.deepEqual(readSize(body("about 2,400 lines · split into #12 and #13")), { estimate: 2400, exception: null, split: [12, 13] });
  assert.deepEqual(checkSizes([issue(10, "split into #12, #13"), issue(11, "about 2,400 lines · split into #12 and #13")]), []);
  assert.deepEqual(checkSizes([issue(14, "about 2,400 lines · split into two", "Not split yet")]),
    ["#14 Not split yet: the estimate is 2,400 lines, 1,000 or more. Split it into child issues, or write `Size: exception: <reason>`."]);
});

test("AC-375-2: WHEN the list is empty THEN the script exits 2 and never says every line passes", () => {
  const r = run([], "[]");
  assert.equal(r.status, 2, r.stdout);
  assert.doesNotMatch(r.stdout + r.stderr, /Every Size: line/);
  assert.match(r.stderr, /no issues to check/);
});

test("AC-375-2: WHEN an issue's body is null, as the REST API sends an empty one, THEN the script reads it as no Size line", () => {
  const r = run([], JSON.stringify([{ number: 6, title: "Empty", body: null }]));
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^#6 Empty: no Size: line\./m);
});

test("AC-375-2: WHEN an issue file says Status: done THEN the script skips it", () => {
  const dir = tmp();
  put(dir, "docs/issues/003-old-step.md", "# Old step\n\nStatus: done\n\nWritten before sizes.\n");
  put(dir, "docs/issues/013-small-step.md", `# Small step\n\nStatus: ready\n\n${body("200 lines · cli/src")}`);
  const r = run(["docs/issues/003-old-step.md", "docs/issues/013-small-step.md"], "", dir);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /#3/);
  assert.match(r.stdout, /1 issue read, 1 done skipped\./);
});

test("AC-375-2: the consistency check reads up to 200 issues and its advice fits each gap", () => {
  assert.match(consistency, /gh issue list --milestone "<name>" --state open --limit 200 --json number,title,body,labels`/);
  assert.match(consistency, /only this pass's open files/);
  assert.match(consistency, /Fix each by adding the missing line, estimate or reason, or by splitting it into child issues/);
});
