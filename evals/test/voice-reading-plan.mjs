// The fake transcripts for the opt-in eval voice-reading (#457). scenarios.test.mjs runs the good and bad ones with
// every other scenario; voice-reading.test.mjs runs the shortcuts.

/** The once-per-session read of the input setting and the glossary. */
export const READ_VOICE = { bash: "node .agents/skills/ask/scripts/voice.mjs" };
/** The stack file, with the heard words read by sound. */
export const WRITE_STACK = { write: "docs/stack.md", content: "# Stack\n\nFramework: TanStack Start.\n" };
export const DONE = { text: "The framework is TanStack Start, written in docs/stack.md." };

export const VOICE_PLAN = {
  with: { steps: [READ_VOICE, WRITE_STACK, DONE] },
  without: { steps: [{ text: "Did you mean TanStack Start? \"10 stack start\" isn't a framework I know. Which one do you want?" }] },
};
