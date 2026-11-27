// Tests for step sizing in the pyramid (#376): every step in the current pass has a line estimate under 1,000
// changed lines, or a stated exception, in the steps table's Lines column. The plan checker reads that cell with
// the issues skill's size reader (#375), so a step and the issue made from it pass or fail the same way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkPlan, readSteps } from "../../.agents/skills/pyramid/scripts/check-plan.mjs";
import { spawnSync } from "./child.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const SCRIPT = fileURLToPath(new URL("../../.agents/skills/pyramid/scripts/check-plan.mjs", import.meta.url));

const HEAD = `# Tracer-bullet pyramid

## Slices

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add and tick off items with a flatmate |
| Sign-in | support | Sign in and out |

## Outline: every pass

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | pass-1 | all | thin and working | building |

## Current pass: steps

`;
const TABLE = "| # | Step | Slice | Try it | Size | Lines | After |\n|---|---|---|---|---|---|---|\n";
// Each step's Lines cell, in order. The skeleton copies the stack pack's starter whole, so it is a stated exception.
const STEPS = [
  ["1", "The skeleton", "slice 0", "Open the test URL: the home page loads", "5 · sets up the app, CI and the test deploy", "", "exception: copies the stack pack's starter whole"],
  ["2", "Sign in", "Sign-in", "Click Sign in, use the test user: your name shows in the header", "3", "1", "about 250 lines"],
  ["3", "See the list", "Shared list", "Open /list: the seeded items show, newest first", "4", "1", "about 400 lines"],
  ["4", "Add an item", "Shared list", "Type \"milk\" and press Enter: it shows at the top", "3", "3", "300-450 lines"],
  ["5", "Tick an item off", "Shared list", "Click the box next to \"milk\": it is struck through", "2", "3", "~150 loc"],
  ["6", "Sign out", "Sign-in", "Click Sign out: /list sends you to the sign-in page", "2", "2", "about 120 lines"],
];
const row = ([id, name, slice, tryIt, size, after, lines]) => `| ${id} | ${name} | ${slice} | ${tryIt} | ${size} | ${lines} | ${after} |`;
const plan = (steps = STEPS, table = TABLE, render = row) => `${HEAD}${table}${steps.map(render).join("\n")}\n\n## Gate record\n`;
// The plan with one step's Lines cell changed.
const withLines = (n, lines) => plan(STEPS.map((s, i) => (i === n ? [...s.slice(0, 6), lines] : s)));
const errors = (text) => checkPlan(text).errors.join("\n");

test("AC-376-1: WHEN the pyramid cuts the current pass THEN every step has an estimate under 1,000 lines, or a stated exception, and the plan passes", () => {
  assert.deepEqual(checkPlan(plan()).errors, []);
  assert.deepEqual(readSteps(plan()).map((s) => s.lines), STEPS.map((s) => s[6]));
});

test("AC-376-1: WHEN a step's estimate is 1,000 lines or more THEN the checker fails it and says to cut it again", () => {
  for (const lines of ["about 1,000 lines", "1200 lines", "800-1,100 lines", "1.5k loc"]) {
    assert.match(errors(withLines(3, lines)), /step 4 .*the line estimate is [\d,]+ lines, 1,000 or more\. Cut it again before the issues are written/, lines);
  }
  assert.match(errors(withLines(3, "under 1,000 lines")), /step 4 .*1,000 or more.*Write your estimate, not the limit/);
  assert.equal(errors(withLines(3, "about 999 lines")), "");
});

test("AC-376-1: WHEN a step has no estimate, or one the checker can't read THEN the checker fails it", () => {
  assert.match(errors(withLines(2, "")), /step 3 .*has no line estimate/);
  assert.match(errors(withLines(2, "<!-- lines -->")), /step 3 .*has no line estimate/);
  assert.match(errors(withLines(2, "small")), /step 3 .*Lines/);
  assert.match(errors(withLines(2, "four hundred-ish, 2 files")), /step 3 .*Lines.*can't read this estimate/);
  assert.match(errors(withLines(2, "400 lines · 700 lines of tests")), /step 3 .*Lines.*second estimate/);
});

test("AC-376-1: WHEN a step is a stated exception THEN it passes only with a real reason, and a split is cut in the table instead", () => {
  assert.equal(errors(withLines(3, "exception: a mechanical rename across every module")), "");
  assert.match(errors(withLines(3, "exception: n/a")), /step 4 .*Lines.*exception has no reason/);
  assert.match(errors(withLines(3, "split into #12, #13")), /step 4 .*cut it into two or more steps in this table/);
});

test("AC-376-1: WHEN the steps table has no Lines column THEN the plan fails and asks for one", () => {
  const noColumn = plan(STEPS, "| # | Step | Slice | Try it | Size | After |\n|---|---|---|---|---|---|\n", (s) => `| ${s.slice(0, 6).join(" | ")} |`);
  assert.ok(readSteps(noColumn), "the steps table is still found");
  assert.match(errors(noColumn), /plan: the steps table has no Lines column/);
});

test("AC-376-1: WHEN the checker runs as a command THEN a step at 1,000 or more exits 1 and names the step", () => {
  const dir = tmp("onrails-plan-lines-");
  put(dir, "docs/pyramid.md", withLines(1, "about 1,400 lines"));
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /error: step 2 .*the line estimate is 1,400 lines/);
});

test("AC-376-1: WHEN the pyramid writes the plan THEN the template, the skill and slicing.md ask for a line estimate per step", () => {
  const template = read(".agents/skills/idea/templates/pyramid.md");
  assert.match(template, /^\| # \| Step \| Slice \| Try it \| Size \| Lines \| After \|$/m);
  assert.deepEqual(checkPlan(template, { perSlice: 1 }).errors, ["plan: no slices. List the slices in the Slices table, with a Slice and a Role column"]);
  const skill = read(".agents/skills/pyramid/SKILL.md");
  assert.match(skill, /under 1,000 changed lines/);
  assert.match(skill, /1,000 or more is cut again before the issues are written/);
  assert.match(read(".agents/skills/pyramid/references/slicing.md"), /line estimate/);
});
