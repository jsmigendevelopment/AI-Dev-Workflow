// The real scenarios: a well-behaved transcript passes every check and a bad one fails, so
// each scenario's checks can tell the two apart. The plans are in scenario-plans.mjs (#180, split from run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, skipWin } from "./harness.mjs";
import { SCENARIO_PLANS } from "./scenario-plans.mjs";

test("every real scenario passes a good transcript and fails a bad one", { skip: skipWin }, () => {
  const { run, resultsFile } = setup(SCENARIO_PLANS);
  const r = run();
  // The opt-in scenarios aren't in the default run: run them by name.
  const ran = resultsFile().runs[0].scenarios.map((s) => s.name);
  const rest = Object.keys(SCENARIO_PLANS).filter((n) => !ran.includes(n));
  if (rest.length) {
    const optIn = run("--scenario", rest.join(","));
    assert.equal(optIn.status, 0, optIn.stdout + optIn.stderr);
  }
  const scenarios = resultsFile().runs.flatMap((x) => x.scenarios);
  assert.deepEqual(scenarios.map((s) => s.name).sort(), Object.keys(SCENARIO_PLANS).sort(), "a scenario has no plan in this test");
  for (const s of scenarios) {
    const failed = s.arms.with.checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.detail}`);
    assert.deepEqual(failed, [], `${s.name} "with" failed`);
    const without = s.arms.without.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(without, s.arms.without.checks.map((c) => c.id), `${s.name} "without" should fail every check`);
    assert.equal(s.verdict, "pass", s.name);
  }
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
