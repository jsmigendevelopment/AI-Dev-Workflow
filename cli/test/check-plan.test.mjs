// Tests for the pyramid skill's plan checker: a thin plan passes; an empty plan, a plan cut by layer,
// a step nobody can try, a step that is too big, and a plan that only lists slices all fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildingPass, checkPlan, readSlices, readSteps } from "../../.agents/skills/pyramid/scripts/check-plan.mjs";
import { put, tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/pyramid/scripts/check-plan.mjs", import.meta.url));
const TEMPLATE = fileURLToPath(new URL("../../.agents/skills/idea/templates/pyramid.md", import.meta.url));

const HEAD = `# Tracer-bullet pyramid

## Slices

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add and tick off items with a flatmate |
| Sign-in | support | Sign in and out |
| Cost split | support | See who owes what |

## Outline: every pass

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | pass-1 | all | thin and working | building |
| 2 Real | pass-2 | core + supports | the core deep | outline |

## Current pass: steps

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
`;

const THIN = [
  "| 1 | The skeleton | slice 0 | Open the test URL: the home page loads | 5 · sets up the app, CI and the test deploy | |",
  "| 2 | Sign in | Sign-in | Click Sign in, use the test user: your name shows in the header | 3 | 1 |",
  "| 3 | See the list | Shared list | Open /list: the seeded items show, newest first | 4 | 1 |",
  "| 4 | Add an item | Shared list | Type \"milk\" and press Enter: it shows at the top | 3 | 3 |",
  "| 5 | Tick an item off | Shared list | Click the box next to \"milk\": it is struck through | 2 | 3 |",
  "| 6 | Sign out | Sign-in | Click Sign out: /list sends you to the sign-in page | 2 | 2 |",
  "| 7 | Enter a spend | Cost split | Open /split, type 12.50 and save: it shows in the month's list | 4 | 2 |",
  "| 8 | See who owes what | Cost split | Open /split with two spends: each flatmate's share shows | 3 | 7 |",
];
const plan = (rows = THIN) => `${HEAD}${rows.join("\n")}\n\n## Gate record\n`;
const errors = (rows, opts) => checkPlan(plan(rows), opts).errors.join("\n");
const swap = (n, row) => THIN.map((r, i) => (i === n ? row : r));

test("a thin plan passes, and the numbers describe it", () => {
  const r = checkPlan(plan());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.stats, { steps: 8, slices: 3, perSlice: 2.3, medianSize: 3, maxSize: 5, aboveThin: 0, longestChain: 4, canStartNow: 1 }); // the chain 1, 2, 7, 8
});

test("the parts are read from the tables", () => {
  const steps = readSteps(plan());
  assert.equal(steps.length, 8);
  assert.deepEqual({ id: steps[0].id, size: steps[0].size, reason: steps[0].reason }, { id: "1", size: 5, reason: "sets up the app, CI and the test deploy" });
  assert.deepEqual(steps[3].after, ["3"]);
  assert.deepEqual(readSlices(plan()), ["Shared list", "Sign-in", "Cost split"]);
  assert.equal(buildingPass(plan()), 1);
  assert.equal(readSteps("# Plan\n\nPhase 1: database. Phase 2: API.\n"), null);
});

test("a plan with no steps table fails", () => {
  assert.match(checkPlan("# Plan\n\n1. Build the backend\n2. Build the frontend\n").errors.join("\n"), /no steps table/);
});

test("a plan cut by layer fails on every layer step", () => {
  const layers = [
    "| 1 | Set up the database schema | Shared list | The migration runs | 5 | |",
    "| 2 | Build the API endpoints | Shared list | curl /api/v1/items returns 200 | 5 | 1 |",
    "| 3 | Build the UI | Shared list | Open /list and see the items you added | 5 | 2 |",
  ];
  const e = errors(layers);
  assert.match(e, /step 1 .*"Set up the database schema" is a layer, not a step/);
  assert.match(e, /step 2 .*"Build the API endpoints" is a layer/);
  assert.match(e, /step 3 .*"Build the UI" is a layer/);
  assert.match(e, /step 1 .*developer's check \("The migration runs"\)/);
  assert.match(e, /step 2 .*developer's check/);
  assert.match(e, /size 5 is above 4 with no reason/);
});

test("step names that only sound like layers are left alone", () => {
  for (const name of ["Add an item", "Create a table of scores", "See the list page", "Sign in", "Seed data you can browse", "Share a route with a friend"]) {
    assert.doesNotMatch(errors(swap(3, `| 4 | ${name} | Shared list | Type "milk" and press Enter: it shows at the top | 3 | 3 |`)), /is a layer/, name);
  }
  for (const name of ["Database", "Create the tables", "API and services", "Backend setup", "Frontend components", "Wire up the data layer"]) {
    assert.match(errors(swap(3, `| 4 | ${name} | Shared list | Type "milk" and press Enter: it shows at the top | 3 | 3 |`)), /is a layer/, name);
  }
});

test("a layer word anywhere in a step name fails; a user's step that shares a word passes", () => {
  for (const name of ["Notes API", "Sharing backend", "Set up the database", "UI-only list", "Items endpoint", "Data model for items", "List repository", "Frontend for the list"]) {
    assert.match(errors(swap(3, `| 4 | ${name} | Shared list | Type "milk" and press Enter: it shows at the top | 3 | 3 |`)), /is a layer/, name);
  }
  for (const name of ["Share the list", "Copy your API key", "Book a service", "Pick a car model", "Restore a deleted item", "Back up the list"]) {
    assert.doesNotMatch(errors(swap(3, `| 4 | ${name} | Shared list | Type "milk" and press Enter: it shows at the top | 3 | 3 |`)), /is a layer/, name);
  }
});

test("a try line that is a developer's action fails; a person's action passes", () => {
  for (const tryIt of ["Call the endpoint and get the notes back", "Run a query: the new row is there", "Check the logs: no errors show up", "Hit the items API and see the new item", "Open Postman and send the request"]) {
    assert.match(errors(swap(4, `| 5 | Tick an item off | Shared list | ${tryIt} | 2 | 3 |`)), /step 5 .*developer's check/, tryIt);
  }
  for (const tryIt of ["Share the list with a flatmate: they see it on their phone", "Open the activity page: your last change shows first"]) {
    assert.doesNotMatch(errors(swap(4, `| 5 | Tick an item off | Shared list | ${tryIt} | 2 | 3 |`)), /developer's check/, tryIt);
  }
});

test("a step nobody can try fails", () => {
  assert.match(errors(swap(4, "| 5 | Tick an item off | Shared list | | 2 | 3 |")), /step 5 .*has no try line/);
  assert.match(errors(swap(4, "| 5 | Tick an item off | Shared list | n/a | 2 | 3 |")), /step 5 .*has no try line/);
  assert.match(errors(swap(4, "| 5 | Tick an item off | Shared list | All the unit tests pass in CI | 2 | 3 |")), /step 5 .*developer's check/);
  assert.match(errors(swap(4, "| 5 | Tick an item off | Shared list | Nothing visible yet, the row is in the database | 2 | 3 |")), /step 5 .*developer's check/);
});

test("size: above 4 needs a reason, above 7 is split, and at most one step in three is big", () => {
  assert.match(errors(swap(2, "| 3 | See the list | Shared list | Open /list: the seeded items show | 6 | 1 |")), /step 3 .*size 6 is above 4 with no reason/);
  assert.equal(errors(swap(2, "| 3 | See the list | Shared list | Open /list: the seeded items show | 6 · the first table, its service and its screen | 1 |")), "");
  assert.match(errors(swap(2, "| 3 | See the list | Shared list | Open /list: the seeded items show | 8 · a lot | 1 |")), /step 3 .*size 8 is above 7: split it/);
  assert.match(errors(swap(2, "| 3 | See the list | Shared list | Open /list: the seeded items show | big | 1 |")), /step 3 .*Size must be a number/);
  const big = THIN.map((r, i) => (i >= 1 && i < 4 ? r.replace(/\| \d( · [^|]*)? \| (\d*) \|$/, "| 5 · can't be cut | $2 |") : r));
  assert.match(errors(big), /3 of 7 steps after slice 0 are above size 4/);
});

test("slice 0 counts toward neither the step count nor the big share, and a big step always needs a reason", () => {
  const rows = [...THIN.slice(0, 7), "| 9 | Undo a tick | Shared list | Click Undo after a tick: the item is back | 2 | 5 |", THIN[7]]
    .map((r, i) => (i === 0 ? r.replace("| 5 · sets up the app, CI and the test deploy |", "| 2 |") : r))
    .map((r, i) => ([2, 3, 6].includes(i) ? r.replace(/\| \d \| (\d*) \|$/, "| 6 · can't be cut | $1 |") : r));
  assert.match(errors(rows), /3 of 8 steps after slice 0 are above size 4/);
  assert.match(errors(swap(0, "| 1 | The skeleton | slice 0 | Open the test URL: the home page loads | 6 | |")), /step 1 .*size 6 is above 4 with no reason/);
});

test("an empty plan fails: no slices, or no steps in the current pass", () => {
  assert.match(errors([]), /the current pass has no steps/);
  const noSlices = plan().replace(/## Slices[\s\S]*?## Outline/, "## Outline");
  assert.match(checkPlan(noSlices).errors.join("\n"), /no slices/);
});

test("any pass needs a step for every slice it covers, not only pass 1", () => {
  const pass2 = (slices) => plan(THIN.slice(0, 6)).replace("| thin and working | building |", "| thin and working | done |")
    .replace("| core + supports | the core deep | outline |", `| ${slices} | the core deep | building |`);
  assert.match(checkPlan(pass2("core + Cost split")).errors.join("\n"), /pass 2 has no step for the slice "Cost split"/);
  assert.match(checkPlan(pass2("all")).errors.join("\n"), /pass 2 has no step for the slice "Cost split"/);
  assert.deepEqual(checkPlan(pass2("core + key supports")).errors, []);
});

test("an \"and\" in a step name is a warning, not an error", () => {
  const r = checkPlan(plan(swap(3, "| 4 | Add and delete an item | Shared list | Type \"milk\" and press Enter: it shows at the top | 3 | 3 |")));
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join("\n"), /step 4 .*"Add and delete an item" has an "and" in its name/);
  assert.deepEqual(checkPlan(plan()).warnings, []);
});

test("too few steps for the slices fails, and --per-slice moves the bar", () => {
  const coarse = [THIN[0], THIN[1], THIN[2], THIN[6]];
  assert.match(errors(coarse), /3 steps for 3 slices\. That lists slices, not steps: aim for 2 or more per slice \(6 here\)/);
  assert.equal(errors(coarse, { perSlice: 1 }), "");
  assert.match(errors(THIN, { perSlice: 3 }), /7 steps for 3 slices/);
});

test("pass 1 needs a step through every slice; a later pass doesn't", () => {
  const noSplit = THIN.slice(0, 6).concat(["| 7 | Rename an item | Shared list | Click an item's name, type a new one: it is saved | 2 | 3 |"]);
  assert.match(errors(noSplit), /pass 1 has no step for the slice "Cost split"/);
  const pass2 = plan(noSplit).replace("| thin and working | building |", "| thin and working | done |").replace("| the core deep | outline |", "| the core deep | building |");
  assert.deepEqual(checkPlan(pass2).errors, []);
});

test("the order: no step waits for a later one, a missing one or itself, and numbers are used once", () => {
  assert.match(errors(swap(1, "| 2 | Sign in | Sign-in | Click Sign in: your name shows in the header | 3 | 6 |")), /step 2 .*comes after step 6, which is listed later/);
  assert.match(errors(swap(1, "| 2 | Sign in | Sign-in | Click Sign in: your name shows in the header | 3 | 12 |")), /step 2 .*comes after step 12, which isn't in the table/);
  assert.match(errors(swap(1, "| 2 | Sign in | Sign-in | Click Sign in: your name shows in the header | 3 | 2 |")), /step 2 .*comes after itself/);
  assert.match(errors(swap(1, "| 1 | Sign in | Sign-in | Click Sign in: your name shows in the header | 3 | |")), /the number 1 is used twice/);
});

test("a plan where every step waits for the one before it gets a warning, not an error", () => {
  const chain = THIN.map((r, i) => r.replace(/\| [\d]* \|$/, `| ${i || ""} |`));
  const r = checkPlan(plan(chain));
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join("\n"), /only one builder can work at a time/);
});

test("the template's own example row passes; the blank template fails only for its empty Slices table", () => {
  const steps = readSteps(readFileSync(TEMPLATE, "utf8"));
  assert.ok(steps, "templates/pyramid.md has no steps table");
  assert.deepEqual(checkPlan(readFileSync(TEMPLATE, "utf8"), { perSlice: 1 }).errors, ["plan: no slices. List the slices in the Slices table, with a Slice and a Role column"]);
});

test("the command: exit 0 on a thin plan, 1 on a coarse one, 2 with no file, and --json prints the numbers", () => {
  const dir = tmp("onrails-plan-");
  put(dir, "docs/pyramid.md", plan());
  put(dir, "coarse.md", plan([THIN[0], THIN[2]]));
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /plan: 8 steps, 3 slices \(2\.3 per slice\), median size 3, biggest 5, 1 can start now, longest chain 4/);
  const bad = run("coarse.md");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /error: plan: 1 steps for 1 slices/);
  assert.equal(run("missing.md").status, 2);
  const json = JSON.parse(run(join("docs", "pyramid.md"), "--json").stdout);
  assert.equal(json.stats.steps, 8);
  assert.deepEqual(json.errors, []);
});
