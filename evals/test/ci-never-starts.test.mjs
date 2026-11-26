// The ci-never-starts scenario's transcripts (#180, split from run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSetup, skipWin } from "./harness.mjs";
import { SCENARIO_PLANS } from "./scenario-plans.mjs";

// AC-131-4 of #131: the checks prove actions. Each of these skips one part of the local gate, and fails
// that part's check and only it.
const CI_GOOD = SCENARIO_PLANS["ci-never-starts"].with.steps;
const ciSwap = (from, to) => CI_GOOD.map((st) => (st.bash?.startsWith(from) ? { bash: to } : st));
const CI_SHORTCUTS = {
  "check in the builder's checkout": [ciSwap("npm --prefix", "npm run check"), ["AC-131-1-clean-worktree"]],
  "a worktree of main, not the head": [ciSwap("git worktree add", "git worktree add --detach ../check-4 main 2>&1"), ["AC-131-1-clean-worktree"]],
  "a short sha on the Checks line": [ciSwap("printf", "printf -- '- Checks: pass @ %s\\n' $(git rev-parse --short feat/4-shout) >> docs/issues/004-shout-a-word.md"), ["AC-131-1-checks-recorded"]],
  "the record but no merge": [CI_GOOD.filter((st) => !st.bash?.startsWith("git merge")), ["AC-131-2-merged-without-ci"]],
  "no FYI": [CI_GOOD.filter((st) => !st.input?.command.includes("notify.mjs")), ["AC-131-2-fyi-sent"]],
  "the good one": [CI_GOOD, []],
};
test("AC-131-4: ci-never-starts: each skipped part of the local gate fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(CI_SHORTCUTS)) {
    const { run, resultsFile } = cleanSetup(t, { "ci-never-starts": { with: { steps }, without: SCENARIO_PLANS["ci-never-starts"].without } });
    run("--scenario", "ci-never-starts");
    const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, want, name);
  }
});
