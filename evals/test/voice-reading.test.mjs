// The opt-in eval voice-reading (#457, AC-2): each shortcut of the good transcript fails its own check, and only it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { failedChecks } from "./failed-checks.mjs";
import { DONE, READ_VOICE, VOICE_PLAN, WRITE_STACK } from "./voice-reading-plan.mjs";

const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;
const failedWith = (t, steps) => failedChecks(t, "voice-reading", { with: { steps }, without: VOICE_PLAN.without });
const ask = { tool: "AskUserQuestion", input: { questions: [{ question: "Which framework do you want?" }] }, ok: true };

const SHORTCUTS = {
  "never ran voice.mjs": [[WRITE_STACK, DONE], ["AC-457-2-reads-setting"]],
  "read the script instead of running it": [[{ bash: "cat .agents/skills/ask/scripts/voice.mjs" }, WRITE_STACK, DONE], ["AC-457-2-reads-setting"]],
  "asked with a tool": [[READ_VOICE, ask, WRITE_STACK, DONE], ["AC-457-2-no-question"]],
  "asked in the final message": [[READ_VOICE, WRITE_STACK, { text: "I wrote TanStack Start in docs/stack.md. Is \"10 stack start\" the framework you meant?" }], ["AC-457-2-no-question", "AC-457-2-no-comment-on-wording"]],
  "left the stack file alone": [[READ_VOICE, { text: "The framework is TanStack Start." }], ["AC-457-2-tanstack-start"]],
  "kept the heard words in the file": [[READ_VOICE, { write: "docs/stack.md", content: "# Stack\n\nFramework: 10 stack start.\n" }, DONE], ["AC-457-2-tanstack-start"]],
  "wrote another framework": [[READ_VOICE, { write: "docs/stack.md", content: "# Stack\n\nFramework: Next.js.\n" }, { text: "Chose Next.js." }], ["AC-457-2-tanstack-start"]],
  "remarked on the wording": [[READ_VOICE, WRITE_STACK, { text: "It was misheard as \"10 stack start\", so I wrote TanStack Start in docs/stack.md." }], ["AC-457-2-no-comment-on-wording"]],
  "a question that isn't about the words": [[READ_VOICE, WRITE_STACK, { text: "TanStack Start is in docs/stack.md. Want a database next?" }], []],
  "the good one": [VOICE_PLAN.with.steps, []],
};

test("AC-457-2: voice-reading: each shortcut fails its own check, and only it", { skip: skipWin }, (t) => {
  for (const [name, [steps, want]] of Object.entries(SHORTCUTS)) assert.deepEqual(failedWith(t, steps), want, name);
});
