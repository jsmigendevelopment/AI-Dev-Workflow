// AC-1 and AC-2 of #143, the opt-in eval decision-lifts-gate: each half of the good transcript is checked
// on its own. Its own file, so run.test.mjs, already past 500 lines, doesn't grow (review on #159).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIFT_CITE, LIFT_MERGE, LIFT_PLAN } from "./decision-lifts-gate-plan.mjs";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const FAKE = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));
const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

/** Runs the scenario with the fake claude on these steps; returns the "with" arm's failed check ids. */
function failedWith(t, steps) {
  const root = mkdtempSync(join(tmpdir(), "evals-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  copyFileSync(FAKE, join(bin, "claude"));
  chmodSync(join(bin, "claude"), 0o755);
  writeFileSync(join(bin, "plan.json"), JSON.stringify({ "decision-lifts-gate": { with: { steps }, without: LIFT_PLAN.without } }));
  const results = join(root, "results");
  // A fake key, so even a real claude found by mistake would fail to sign in rather than spend.
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, ANTHROPIC_API_KEY: "sk-ant-fake-for-tests" };
  spawnSync(process.execPath, [RUN, "--results-dir", results, "--scenario", "decision-lifts-gate"], { encoding: "utf8", env, timeout: 120_000 });
  const file = readdirSync(results).find((f) => f.endsWith(".json"));
  return JSON.parse(readFileSync(join(results, file), "utf8")).runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
}

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
