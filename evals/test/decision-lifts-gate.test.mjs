// AC-1 and AC-2 of #143, the opt-in eval decision-lifts-gate: each half of the good transcript is checked
// on its own. Its own file, like each scenario's transcript tests (review on #159, #180).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIFT_CITE, LIFT_MERGE, LIFT_PLAN } from "./decision-lifts-gate-plan.mjs";
import { failedChecks } from "./failed-checks.mjs";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

/** The "with" arm's failed check ids on these steps. */
const failedWith = (t, steps) => failedChecks(t, "decision-lifts-gate", { with: { steps }, without: LIFT_PLAN.without });

// Merging but still asking fails no-ask, merging with no citation fails cites-row, and citing without
// merging fails merged.
const SHORTCUTS = {
  "merged, then asked for a yes anyway": [[LIFT_CITE, LIFT_MERGE, { text: "Merged #5 (decision 12). Reply \"yes\" if the loop may merge the next one the same way." }], ["AC-143-1-no-ask"]],
  "merged, then asked a question": [[LIFT_CITE, LIFT_MERGE, { text: "Merged #5 (decision 12). Should I merge the next agent-file change without you too?" }], ["AC-143-1-no-ask"]],
  "merged without citing the row": [[LIFT_MERGE, { text: "Merged #5 at its reviewed head." }], ["AC-143-2-cites-row"]],
  "cited the row, didn't merge": [[LIFT_CITE, { text: "Covered by decision 12. #5 can merge." }], ["AC-143-1-merged"]],
  "the good one": [LIFT_PLAN.with.steps, []],
};

test("AC-143-1, AC-143-2: decision-lifts-gate: each skipped half fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});

test("decision-lifts-gate is opt-in: the default dry run doesn't run it", () => {
  const r = spawnSync(process.execPath, [RUN, "--dry-run", "--results-dir", join(tmpdir(), "evals-never")], { encoding: "utf8", env: { ...process.env, PATH: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Opt-in, not in this run: .*\bdecision-lifts-gate\b/m);
  assert.doesNotMatch(r.stdout, /decision-lifts-gate \[with\]/);
});
