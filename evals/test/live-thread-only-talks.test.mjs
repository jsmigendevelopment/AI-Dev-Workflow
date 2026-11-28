// #390, the opt-in eval live-thread-only-talks: each shortcut of the good transcript fails its own check, and only it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { failedChecks } from "./failed-checks.mjs";
import { RUN } from "./harness.mjs";
import { AGENT_MERGES, ANSWER, HANDED, HAND_DOWN, TALK_PLAN } from "./live-thread-only-talks-plan.mjs";

const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;
const failedWith = (t, steps, next = [ANSWER]) => failedChecks(t, "live-thread-only-talks", { with: { steps, followUps: [{ steps: next }] }, without: TALK_PLAN.without });
const handWith = (input) => ({ ...HAND_DOWN, input: { ...HAND_DOWN.input, ...input } });

const SHORTCUTS = {
  "merged in the live thread": [[{ ...AGENT_MERGES, parent: undefined }, HANDED], undefined, ["AC-390-1-handed-down", "AC-390-1-no-work-of-its-own"]],
  "handed it down in the foreground": [[handWith({ run_in_background: false }), HANDED], undefined, ["AC-390-1-handed-down", "AC-390-1-turn-ends"]],
  "the brief doesn't name #3": [[handWith({ prompt: "Merge the ready branch." }), HANDED], undefined, ["AC-390-1-handed-down"]],
  "waited on the sub-agent": [[HAND_DOWN, { tool: "TaskOutput", input: { task_id: "toolu_1", block: true }, ok: true }, HANDED], undefined, ["AC-390-1-turn-ends"]],
  "ran the checks itself": [[HAND_DOWN, { tool: "Bash", input: { command: "npm test" }, ok: true }, HANDED], undefined, ["AC-390-1-no-work-of-its-own"]],
  "the next turn waited first": [[HAND_DOWN, HANDED], [{ tool: "TaskOutput", input: { task_id: "toolu_1", block: true }, ok: true }, ANSWER], ["AC-390-2-answered-next-turn"]],
  "the next turn didn't answer": [[HAND_DOWN, HANDED], [{ text: "The merge is still running." }], ["AC-390-2-answered-next-turn"]],
  "wrote a note under docs": [[HAND_DOWN, { write: "docs/state.md", content: "# State\n\n- #3: merging in a sub-agent.\n" }, HANDED], undefined, []],
  "the good one": [TALK_PLAN.with.steps, undefined, []],
};

test("AC-390-1, AC-390-2: live-thread-only-talks: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, next, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps, next), want, name);
});

test("AC-390-2: the dry run names the follow-up, and only this scenario reads stream-json", () => {
  const r = spawnSync(process.execPath, [RUN, "--dry-run", "--scenario", "live-thread-only-talks"], { encoding: "utf8", env: { ...process.env, PATH: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /live-thread-only-talks: 1 follow-up message\(s\), each once a turn ends \(--input-format stream-json\)/);
  assert.doesNotMatch(r.stdout, /^Command .*--input-format/m, "the shared command keeps text input");
});

test("AC-390-2: a first turn that never ends gets no follow-up, and fails both turn checks", { skip: skipWin }, (t) => {
  const never = failedChecks(t, "live-thread-only-talks", { with: { steps: [HAND_DOWN, HANDED], noResult: true, followUps: [{ steps: [ANSWER] }] }, without: TALK_PLAN.without });
  assert.deepEqual(never, ["AC-390-1-turn-ends", "AC-390-2-answered-next-turn"]);
});
