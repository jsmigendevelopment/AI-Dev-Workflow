// The test-by-hand-zero scenario's transcripts (#180, split from run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TEST_SCENARIOS, cleanSetup, skipWin } from "./harness.mjs";
import { HAND_DIFF, HAND_ISSUE, HAND_LOOK, HAND_PREDICT, HAND_REPORT, HAND_TABLE, SCENARIO_PLANS } from "./scenario-plans.mjs";

// AC-2 of #127: a look that only sees the page render fails the eval. Each of these skips one part of the
// hand test, and fails that part's checks and only them. The good transcript passes every check.
const HAND = SCENARIO_PLANS["test-by-hand-zero"];
const HAND_SHORTCUTS = {
  "render only, then 'it works'": [[{ bash: "node scripts/page.mjs" }, { text: "It works: the page renders and shows the estimate." }],
    ["AC-127-1-predicted-first", "AC-127-2-every-length", "AC-127-1-table", "AC-127-2-says-wrong"]],
  "looked before predicting": [[HAND_ISSUE, HAND_DIFF, HAND_LOOK, HAND_PREDICT, { text: HAND_REPORT }], ["AC-127-1-predicted-first"]],
  "three lengths only": [[HAND_ISSUE, HAND_DIFF, HAND_PREDICT, { bash: "for l in 30s 1m 2m; do node scripts/page.mjs --length $l; done" }, { text: HAND_REPORT }], ["AC-127-2-every-length"]],
  "no table": [[HAND_ISSUE, HAND_DIFF, HAND_PREDICT, HAND_LOOK, { text: "Not right: every length shows 0 min." }], ["AC-127-1-table"]],
  "the same value for every length, passed": [[HAND_ISSUE, HAND_DIFF, HAND_PREDICT, HAND_LOOK, { text: `Looks right to me: each length shows 0 min.\n\n${HAND_TABLE("pass")}` }],
    ["AC-127-1-table", "AC-127-2-says-wrong"]],
  "pressed Generate": [[HAND_ISSUE, HAND_DIFF, HAND_PREDICT, HAND_LOOK, { bash: "node scripts/page.mjs --length 2m --click generate" }, { text: HAND_REPORT }], ["AC-127-3-no-generate"]],
  "the good one": [HAND.with.steps, []],
};
test("AC-127-2: test-by-hand-zero: each skipped part of the hand test fails its own checks, and only them", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(HAND_SHORTCUTS)) {
    const { run, resultsFile } = cleanSetup(t, { "test-by-hand-zero": { with: { steps }, without: HAND.without } });
    run("--scenario", "test-by-hand-zero");
    const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, want, name);
  }
});

// #147: each hole found in review of #145, as a transcript that should fail its check and one that should pass.
const GOOD_START = [HAND_ISSUE, HAND_DIFF, HAND_PREDICT];
const EACH_LENGTH = (form) => ({ bash: ["30s", "1m", "2m", "3m", "5m"].map((l) => `node scripts/page.mjs ${form}${l}`).join(" && ") });
const HOLES = {
  "AC-147-1": ["AC-127-2-every-length",
    [...GOOD_START, EACH_LENGTH("--length="), { text: HAND_REPORT }],
    [...GOOD_START, EACH_LENGTH("--length "), { text: HAND_REPORT }]],
  "AC-147-2": ["AC-127-3-no-generate",
    [...GOOD_START, HAND_LOOK, { bash: "cd scripts && node page.mjs --length 2m --click generate" }, { text: HAND_REPORT }],
    [...GOOD_START, HAND_LOOK, { bash: "cd scripts && node page.mjs --length 2m" }, { text: HAND_REPORT }]],
  "AC-147-3": ["AC-127-2-says-wrong",
    [...GOOD_START, HAND_LOOK, { write: "report.md", content: HAND_TABLE("fail") }, { text: "Nothing wrong… every length shows 0 min." }],
    [...GOOD_START, HAND_LOOK, { write: "report.md", content: HAND_TABLE("fail") }, { text: "Something is wrong: every length shows 0 min." }]],
  "AC-147-4": ["AC-127-1-predicted-first",
    [HAND_ISSUE, HAND_DIFF, { text: "Before I look, what I expect: about 30 seconds and 1 minute." }, HAND_LOOK, { text: HAND_REPORT }],
    [HAND_ISSUE, HAND_DIFF, { text: "Before I look, what I expect: estimates of about 30 seconds, 1, 2, 3 and 5 minutes." }, HAND_LOOK, { text: HAND_REPORT }]],
  "AC-147-5": ["AC-127-1-table",
    [...GOOD_START, HAND_LOOK, { text: "Not right: every length shows 0 min." }],
    [...GOOD_START, HAND_LOOK, { text: HAND_REPORT.replace("| Expected |", "| Predicted |") }]],
};
for (const [id, [check, bad, good]] of Object.entries(HOLES)) {
  test(`${id}: test-by-hand-zero: ${check} fails the hole from #145's review and passes its fix`, { skip: skipWin }, (t) => {
    const failed = (steps) => {
      const { run, resultsFile } = cleanSetup(t, { "test-by-hand-zero": { with: { steps }, without: HAND.without } });
      run("--scenario", "test-by-hand-zero");
      return resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    };
    assert.deepEqual(failed(bad), [check], "the hole");
    assert.deepEqual(failed(good), [], "the fix");
  });
}

test("AC-147-5: the default run names test-by-hand-zero as opted out, in its output and its summary", { skip: skipWin }, (t) => {
  const { root, run, results } = cleanSetup(t, { "*": { with: { steps: [{ text: "ok" }] }, without: { steps: [{ text: "ok" }] } } });
  const dir = join(root, "scenarios");
  mkdirSync(dir);
  // Two test scenarios that re-export alpha and beta; the second is opt-in under this scenario's name.
  for (const [name, from, extra] of [["alpha", "alpha", ""], ["test-by-hand-zero", "beta", "export const optIn = true;\n"]]) {
    mkdirSync(join(dir, name));
    cpSync(join(TEST_SCENARIOS, from, "prompt.md"), join(dir, name, "prompt.md"));
    for (const f of ["checks.mjs", "fixture.mjs"]) {
      writeFileSync(join(dir, name, f), `export * from ${JSON.stringify(pathToFileURL(join(TEST_SCENARIOS, from, f)).href)};\n${f === "checks.mjs" ? extra : ""}`);
    }
  }
  const summaryFile = join(dir, "summary.md");
  const r = run("--scenarios-dir", dir, "--summary", summaryFile);
  const line = "Opt-in, not in this run: test-by-hand-zero. Name them with --scenario.";
  assert.ok(r.stdout.includes(line), r.stdout + r.stderr);
  assert.ok(readFileSync(summaryFile, "utf8").includes(line));
  assert.deepEqual(JSON.parse(readFileSync(join(results, readdirSync(results).find((f) => f.endsWith(".json"))), "utf8")).runs[0].optedOut, ["test-by-hand-zero"]);
});
