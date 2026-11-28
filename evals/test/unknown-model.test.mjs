// The opt-in eval unknown-model (#472, AC-3 of #129). AC-472-1 is the dry run: the scenario is opt-in and the default
// count stays at 40. AC-472-2 is the transcripts: a good one passes every check and each shortcut fails its own check.
// scenarios.test.mjs also runs the good and the bad transcript with every other scenario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { failedChecks } from "./failed-checks.mjs";
import { RUN, skipWin } from "./harness.mjs";
import { DONE, HAND_TYPED, JOB_UNKNOWN, READ_DIFF, REVIEW_UNKNOWN, UNKNOWN_PLAN, VERDICT, WHY, job, review } from "./unknown-model-plan.mjs";

const WRITER = "AC-472-1-writer-ran";
const UNKNOWN = "AC-472-1-model-unknown";
const FROM = "AC-472-1-model-from";
const ROUTING = "AC-472-1-not-routing-table";
const ALL = [WRITER, UNKNOWN, FROM, ROUTING];
const failedWith = (t, steps) => failedChecks(t, "unknown-model", { with: { steps }, without: UNKNOWN_PLAN.without });
const dryRun = (...args) => spawnSync(process.execPath, [RUN, "--dry-run", ...args], { encoding: "utf8", env: { ...process.env, PATH: "" } });
const run = (...records) => [READ_DIFF, ...records, VERDICT, DONE];

test("AC-472-1: WHEN the dry run lists the scenarios THEN unknown-model is opted out and the default count is 40", () => {
  const all = dryRun();
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /Dry run: 40 run\(s\)/);
  assert.match(all.stdout, /^Opt-in, not in this run: .*\bunknown-model\b.*\. Name them with --scenario\.$/m);
  assert.doesNotMatch(all.stdout, /unknown-model \[with\]/);
  const named = dryRun("--scenario", "unknown-model");
  assert.equal(named.status, 0, named.stderr);
  assert.match(named.stdout, /Dry run: 2 run\(s\)/);
  assert.match(named.stdout, /unknown-model \[with\]/);
  assert.match(named.stdout, /unknown-model: its own limits, 20 turns, 240 s, \$0\.5 budget/);
});

test("AC-472-2: WHEN the model and effort are unknown with a model_from THEN every check passes, in either form of the writer", { skip: skipWin }, (t) => {
  assert.deepEqual(failedWith(t, UNKNOWN_PLAN.with.steps), []);
  // `write` makes a file in docs/insights/ in place of the printed line (local mode, no pull request).
  assert.deepEqual(failedWith(t, run(job(`model=unknown effort=unknown ${WHY}`, "write"), review(`model=unknown effort=unknown ${WHY}`))), []);
});

const SHORTCUTS = {
  "no record at all": [[READ_DIFF, VERDICT, DONE], ALL],
  "the routing table's model written, with a model_from": [run(job(`model="Claude Zephyr 9" effort=unknown ${WHY}`), REVIEW_UNKNOWN), [UNKNOWN, ROUTING]],
  "the routing table's model and effort written, with no model_from": [run(job("model=\"Claude Zephyr 9\" effort=extra-high")), [UNKNOWN, FROM, ROUTING]],
  "the routing model in the lower-case form of its name": [run(job(`model=claude-zephyr-9 effort=unknown ${WHY}`)), [UNKNOWN, ROUTING]],
  "no model_from": [run(job("model=unknown effort=unknown"), review(`model=unknown effort=unknown ${WHY}`)), [FROM]],
  "no model_from on the review record": [run(JOB_UNKNOWN, review("model=unknown effort=unknown")), [FROM]],
  "the model unknown but the routing table's effort written": [run(job(`model=unknown effort=extra-high ${WHY}`), REVIEW_UNKNOWN), [ROUTING]],
  "a model that isn't the routing table's, written as known": [run(job(`model=claude-haiku-5-5 effort=unknown ${WHY}`), REVIEW_UNKNOWN), [UNKNOWN]],
  "the routing model on the review record only": [run(JOB_UNKNOWN, review(`model="Claude Zephyr 9" effort=unknown ${WHY}`)), [UNKNOWN, ROUTING]],
  "the record typed by hand, never run through the writer": [[READ_DIFF, HAND_TYPED, DONE], [WRITER]],
  "the routing model named in model_from, which is where it looked": [run(job("model=unknown effort=unknown model_from=\"the routing table says Claude Zephyr 9, but this session shows no model\""), REVIEW_UNKNOWN), []],
  "the good one": [UNKNOWN_PLAN.with.steps, []],
};

test("AC-472-2: unknown-model: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});
