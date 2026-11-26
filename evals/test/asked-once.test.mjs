// The asked-once scenario's transcripts (#180, split from run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSetup, skipWin } from "./harness.mjs";
import { SCENARIO_PLANS } from "./scenario-plans.mjs";

// AC-5 of #100, its second half: the tier asked a second time fails tier-not-asked-again, and nothing else.
// The good transcript, which asks nothing, passes every check.
const TIER_AGAIN = {
  "the strongest tier": "May I keep using the strongest tier for the next CTO job?",
  "a model by name": "Which model should plan the next pass, Fable or Opus?",
};
test("AC-100-5: asked-once: a repeated strongest-tier question fails tier-not-asked-again, and only it; asking nothing passes", { skip: skipWin }, (t) => {
  const plan = SCENARIO_PLANS["asked-once"];
  const [write, done] = plan.with.steps;
  const cases = [...Object.entries(TIER_AGAIN).map(([name, question]) => [name, [write, { text: `${done.text}\n${question}` }], ["AC-5-tier-not-asked-again"]]), ["asked nothing", plan.with.steps, []]];
  for (const [name, steps, want] of cases) {
    const { run, resultsFile } = cleanSetup(t, { "asked-once": { with: { steps }, without: plan.without } });
    run("--scenario", "asked-once");
    const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, want, name);
  }
});
