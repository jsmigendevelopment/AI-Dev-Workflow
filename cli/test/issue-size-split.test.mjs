// Tests for split parents and exceptions on the Size: line (#375, #400): a split parent names its open children and is
// never ready, and an exception gives a real reason. Moved from issue-size.test.mjs, which keeps the estimate reader.
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

test("AC-375-1: WHEN an issue is split THEN the parent's Size line names its children and the check passes it", () => {
  assert.match(skill, /The parent's Size line becomes `Size: split into #<child>, #<child>`/);
  assert.match(skill, /The parent never gets `status:ready` and is never built/);
  assert.match(template, /The parent of a split: "Size: split into #<child>, #<child>"/);
  assert.deepEqual(readSize(body("split into #12, #13")), { estimate: null, exception: null, split: [12, 13] });
  assert.deepEqual(readSize(body("about 2,400 lines · split into #12 and #13")), { estimate: 2400, exception: null, split: [12, 13] });
  const children = [issue(12, "about 600 lines · cli/src"), issue(13, "about 600 lines · cli/test")];
  assert.deepEqual(checkSizes([issue(10, "split into #12, #13"), issue(11, "about 2,400 lines · split into #12 and #13"), ...children]), []);
  assert.deepEqual(checkSizes([issue(14, "about 2,400 lines · split into two", "Not split yet")]),
    ["#14 Not split yet: the estimate is 2,400 lines, 1,000 or more. Split it into child issues, or write `Size: exception: <reason>`."]);
});

test("AC-375-2: WHEN exception: or split into sits inside the files THEN it doesn't count", () => {
  for (const size of ["1,500 lines · cli/src, no exception: really", "2,400 lines · cli/src, split into #12 and #13 later"]) {
    assert.match(checkSizes([issue(12, size, "Big step"), issue(13, "200 lines")])[0], /^#12 Big step: the estimate is [\d,]+ lines, 1,000 or more\./, size);
  }
});

test("AC-375-2: WHEN a split parent names no other issue in the list, or itself, THEN the check fails and names it", () => {
  assert.deepEqual(checkSizes([issue(10, "split into #9998, #9999", "Parent")]),
    ["#10 Parent: none of its children (#9998, #9999) is open in this list. Close it once its last child merges, or name its open children."]);
  assert.deepEqual(checkSizes([issue(10, "split into #10, #12", "Parent"), issue(12, "300 lines")]),
    ["#10 Parent: the split names itself. Name its child issues: `Size: split into #<child>, #<child>`."]);
  assert.deepEqual(checkSizes([issue(10, "split into #12, #9999", "Parent"), issue(12, "300 lines")]), []);
});

test("AC-375-2: WHEN a split parent is ready, by label or by its file's Status line, THEN the check fails", () => {
  const ready = "#10 Parent: a split parent is never ready. Remove `status:ready`, or in a file write `Status: blocked`, until its last child is done.";
  const parent = { ...issue(10, "split into #12, #13", "Parent"), labels: [{ name: "status:ready" }] };
  const r = run([], JSON.stringify([parent, issue(12, "300 lines"), issue(13, "300 lines")]));
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout.trim().split("\n")[0], ready);
  const dir = tmp();
  put(dir, "docs/issues/010-parent.md", `# Parent\n\nStatus: ready\n\n${body("split into #12")}`);
  put(dir, "docs/issues/012-child.md", `# Child\n\nStatus: ready\n\n${body("300 lines · cli/src")}`);
  const files = run(["docs/issues/010-parent.md", "docs/issues/012-child.md"], "", dir);
  assert.equal(files.status, 1, files.stderr);
  assert.equal(files.stdout.trim().split("\n")[0], ready);
  put(dir, "docs/issues/010-parent.md", `# Parent\n\nStatus: blocked\n\n${body("split into #12")}`);
  assert.equal(run(["docs/issues/010-parent.md", "docs/issues/012-child.md"], "", dir).status, 0);
  assert.match(skill, /In `docs\/issues\/`, the parent's file says `Status: blocked` until its last child is `done`/);
  assert.match(consistency, /a split parent that names no other open issue, names itself, or is ready/);
});

const noReason = (n, title) => `#${n} ${title}: the Size: exception has no reason. Write \`Size: exception: <reason>\`.`;
const neverReady = "#10 Parent: a split parent is never ready. Remove `status:ready`, or in a file write `Status: blocked`, until its last child is done.";

test("AC-375-2: WHEN an exception's reason is empty or a placeholder THEN the check fails it as no reason", () => {
  const reasons = ["none", "n/a", "-", "N/A.", "na", "no", "nil", "null", "TBD", "todo", "unknown", "?", "--", "<reason>", "reason", "(none)"];
  for (const reason of reasons) {
    assert.deepEqual(checkSizes([issue(5, `about 1,500 lines · exception: ${reason}`, "Empty reason")]), [noReason(5, "Empty reason")], reason);
    assert.deepEqual(checkSizes([issue(5, `exception: ${reason}`, "Empty reason")]), [noReason(5, "Empty reason")], reason);
  }
  assert.deepEqual(checkSizes([issue(5, "exception: no way to split a rename")]), []);
});

test("AC-375-2: WHEN a split parent's file has no status line or any status but blocked THEN the check fails it", () => {
  const dir = tmp();
  put(dir, "docs/issues/012-child.md", `# Child\n\nStatus: ready\n\n${body("300 lines · cli/src")}`);
  const files = ["docs/issues/010-parent.md", "docs/issues/012-child.md"];
  for (const status of ["", "**Status:** ready\n\n", "- Status: ready\n\n", "Status: in-progress\n\n", "status: Ready\n\n"]) {
    put(dir, "docs/issues/010-parent.md", `# Parent\n\n${status}${body("about 2,400 lines · split into #12, #13")}`);
    const r = run(files, "", dir);
    assert.equal(r.status, 1, status);
    assert.equal(r.stdout.trim().split("\n")[0], neverReady, status);
  }
  for (const status of ["**Status:** blocked", "- Status: blocked", "- **Status**: blocked"]) {
    put(dir, "docs/issues/010-parent.md", `# Parent\n\n${status}\n\n${body("split into #12")}`);
    assert.equal(run(files, "", dir).status, 0, status);
  }
  assert.match(consistency, /or in a file any status but `Status: blocked`/);
});

test("AC-375-2: WHEN one Size value states both an exception and a split THEN the check fails it", () => {
  const both = { ...issue(10, "about 2,400 lines · split into #12 · exception: big", "Parent"), labels: ["status:ready"] };
  assert.deepEqual(checkSizes([both, issue(12, "300 lines")]),
    ["#10 Parent: the Size: line states both an exception and a split. Keep one."]);
});

test("AC-375-2: WHEN labels aren't a list THEN the script exits 2, and a ready label matches in any case", () => {
  for (const labels of ["status:ready", { nodes: [{ name: "status:ready" }] }]) {
    const r = run([], JSON.stringify([{ ...issue(10, "300 lines"), labels }]));
    assert.equal(r.status, 2, JSON.stringify(labels));
    assert.match(r.stderr, /labels must be a list/);
    assert.doesNotMatch(r.stderr, /at .*\.mjs:\d+/);
  }
  const parent = { ...issue(10, "split into #12", "Parent"), labels: [{ name: "Status:Ready" }] };
  assert.deepEqual(checkSizes([parent, issue(12, "300 lines")]), [neverReady]);
});

