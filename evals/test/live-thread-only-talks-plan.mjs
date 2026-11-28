// The fake transcripts for the opt-in eval live-thread-only-talks (#390). scenarios.test.mjs runs the good and bad
// ones with every other scenario; live-thread-only-talks.test.mjs runs the shortcuts. Each plan's `followUps` holds
// the steps of the turn that answers each follow-up message.

/** The live thread hands the merge to a background sub-agent. */
export const HAND_DOWN = { tool: "Agent", input: { description: "Merge #3", prompt: "Merge #3: its head is reviewed and checked. The owner's words: \"Merge #3.\"", run_in_background: true }, ok: true };
/** The sub-agent's own step: it merges. It doesn't count against the live thread. */
export const AGENT_MERGES = { tool: "Bash", input: { command: "git merge --no-ff feat/3-add-two-numbers" }, ok: true, parent: "toolu_1" };
export const HANDED = { text: "A sub-agent is merging #3 in the background. I'm free; ask me anything." };
export const ANSWER = { text: "#4 is \"Shout a word\": make shout in src/text.mjs upper-case a word and add \"!\"." };

export const TALK_PLAN = {
  with: { steps: [HAND_DOWN, AGENT_MERGES, HANDED], followUps: [{ steps: [ANSWER] }] },
  without: {
    steps: [{ tool: "Bash", input: { command: "git merge feat/3-add-two-numbers" }, ok: true }, { bash: "sleep 0" }, { text: "Merged #3." }],
    followUps: [{ steps: [{ tool: "TaskOutput", input: { task_id: "merge", block: true }, ok: true }, { text: "Still busy; I'll answer when that's done." }] }],
  },
};
