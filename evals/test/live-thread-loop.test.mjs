// AC-1 of #280, the opt-in eval live-thread-loop: each shortcut of the good transcript fails its own check, and only it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { failedChecks } from "./failed-checks.mjs";
import { LIVE_REPLY, LOOP_BRIEF, LOOP_BUILDS, LOOP_PLAN, START_LOOP } from "./live-thread-loop-plan.mjs";

const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;
const failedWith = (t, steps) => failedChecks(t, "live-thread-loop", { with: { steps }, without: LOOP_PLAN.without });
const startWith = (input) => ({ ...START_LOOP, input: { ...START_LOOP.input, ...input } });

const SHORTCUTS = {
  "started the loop in the foreground": [[startWith({ run_in_background: false }), LIVE_REPLY], ["AC-280-1-loop-in-background", "AC-280-1-brief-is-the-loop"]],
  "the brief doesn't quote the level": [[startWith({ prompt: "You're the loop. Use the `coordinate` skill." }), LIVE_REPLY], ["AC-280-1-brief-is-the-loop"]],
  "the live thread built #1 itself": [[START_LOOP, { ...LOOP_BUILDS, parent: undefined }, LIVE_REPLY], ["AC-280-1-live-thread-built-nothing"]],
  "the live thread wrote code": [[START_LOOP, { write: "src/math.mjs", content: "export const add = (a, b) => a + b;\n" }, LIVE_REPLY], ["AC-280-1-live-thread-built-nothing"]],
  "the live thread wrote the state note": [[START_LOOP, { write: "docs/state.md", content: "# State\n\n- Loop: a background sub-agent.\n" }, LIVE_REPLY], []],
  "the good one": [LOOP_PLAN.with.steps, []],
};

test("AC-280-1: live-thread-loop: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
  assert.match(LOOP_BRIEF, /^Automation level:/m);
});
