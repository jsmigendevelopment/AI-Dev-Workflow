// AC-1 of #254, the opt-in eval back-on-full: each shortcut of the good transcript fails its own check, and only it.
// Its own file, like each scenario's transcript tests (decision 49, #180).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { failedChecks } from "./failed-checks.mjs";
import { BACK_ARM, BACK_ISSUE, BACK_ISSUE_UNQUEUED, BACK_PLAN, BACK_REPORT, BACK_STATE, backState } from "./back-on-full-plan.mjs";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

const failedWith = (t, steps) => failedChecks(t, "back-on-full", { with: { steps }, without: BACK_PLAN.without });
const ASK = { tool: "AskUserQuestion", input: { questions: [{ question: "Who else is working here?" }] } };
const BUILD_5 = { bash: "git checkout -qb feat/5-count-words && printf 'export const countWords = (s) => s.split(/\\\\s+/).filter(Boolean).length;\\n' >> src/text.mjs && git commit -qam '#5 Count words'" };

const SHORTCUTS = {
  "called an ask tool": [[BACK_ISSUE, BACK_STATE, BACK_ARM, ASK, BACK_REPORT], ["AC-254-1-no-ask-tool"]],
  "ended on the triage offer": [[BACK_ISSUE, BACK_STATE, BACK_ARM, { text: "Loop restarted. Want to try #3 first, or keep the loop going?" }], ["AC-254-1-no-question"]],
  "asked who else is working": [[BACK_ISSUE, BACK_STATE, BACK_ARM, { text: "Loop restarted. Is anyone else working on this repo right now?" }], ["AC-254-1-no-question"]],
  "didn't restart the loop": [[BACK_ISSUE, BACK_STATE, BACK_REPORT], ["AC-254-1-loop-started"]],
  "left the retro's issue for the person": [[BACK_ISSUE_UNQUEUED, BACK_STATE, BACK_ARM, BACK_REPORT], ["AC-254-1-retro-issue-ready"]],
  "filed no retro issue": [[BACK_STATE, BACK_ARM, BACK_REPORT], ["AC-254-1-retro-issue-ready"]],
  "parked the kit draft on the person": [[BACK_ISSUE, backState("\n- Kit draft for onRails: check:merge is missing.\n"), BACK_ARM, BACK_REPORT], ["AC-254-1-kit-lesson-not-waiting"]],
  "waited on a yes for the kit draft": [[BACK_ISSUE, BACK_STATE, BACK_ARM, { text: "Loop restarted. The kit draft is in docs/state.md and needs your yes before I file it." }], ["AC-254-1-kit-lesson-not-waiting"]],
  "the loop runs in the foreground on #5": [[BACK_ISSUE, BACK_STATE, BUILD_5, BACK_REPORT], []],
  "the good one": [BACK_PLAN.with.steps, []],
};

test("AC-254-1: back-on-full: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});

test("back-on-full is opt-in: the default dry run doesn't run it", () => {
  const r = spawnSync(process.execPath, [RUN, "--dry-run", "--results-dir", join(tmpdir(), "evals-never")], { encoding: "utf8", env: { ...process.env, PATH: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Opt-in, not in this run: .*\bback-on-full\b/m);
  assert.doesNotMatch(r.stdout, /back-on-full \[with\]/);
});
