// The test-by-hand-zero scenario's transcripts (#180, split from run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSetup, skipWin } from "./harness.mjs";
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
