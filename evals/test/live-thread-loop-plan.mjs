// The fake transcripts for the opt-in eval live-thread-loop (#280). scenarios.test.mjs runs the good and bad ones with
// every other scenario; live-thread-loop.test.mjs runs the shortcuts.

/** The loop's brief, as `coordinate`'s "Where this runs" writes it. */
export const LOOP_BRIEF = "You're the loop. Use the `coordinate` skill.\nAutomation level: - **Level:** full\nStanding decisions: none\nThe owner's words: \"Start the loop.\"";
/** The live thread starts the loop as a background sub-agent. */
export const START_LOOP = { tool: "Agent", input: { description: "The build loop", prompt: LOOP_BRIEF, run_in_background: true }, ok: true };
/** The loop's own step, under the sub-agent: it builds #1. It doesn't count against the live thread. */
export const LOOP_BUILDS = { tool: "Bash", input: { command: "git checkout -b feat/1-add-two-numbers" }, ok: true, parent: "toolu_1" };
export const LIVE_REPLY = { text: "The loop is running in the background. I'm free; tell me anything." };

export const LOOP_PLAN = {
  with: { steps: [START_LOOP, LOOP_BUILDS, LIVE_REPLY] },
  without: { steps: [{ bash: "git checkout -qb feat/1-add-two-numbers && printf 'export const add = (a, b) => a + b;\\n' > src/math.mjs && git commit -qam '#1 Add two numbers'" }, { text: "Built #1 on feat/1-add-two-numbers. Next: #2." }] },
};
