// The fake transcripts for the opt-in eval back-on-full (#254). scenarios.test.mjs runs the good and bad ones with
// every other scenario; back-on-full.test.mjs runs the shortcuts.

/** The retro's app finding, filed as ready, so the loop builds it. */
export const BACK_ISSUE = { write: "docs/issues/006-date-test-time-zone.md", content: "# #6 Pin the time zone in test/date.test.mjs\n\nStatus: ready\nLabels: bug, priority:2\n" };
/** The retro's app finding, left for the person to pick. */
export const BACK_ISSUE_UNQUEUED = { write: "docs/issues/006-date-test-time-zone.md", content: "# #6 Pin the time zone in test/date.test.mjs\n\nStatus: backlog\nLabels: bug\n" };
/** docs/state.md after /back: the kit draft listed in the FYI, nothing waiting on the person. */
export const backState = (waiting = "") => ({ write: "docs/state.md", content: `# State

- **Phase:** building pass 1

## Retro

- 2026-11-26: #3's test reads the time zone → #6. Kit: \`coordinate\` names \`check:merge\`, which this repo lacks → draft for the kit, in the FYI (no GitHub here).

## Waiting on you
${waiting}
` });
export const BACK_STATE = backState();
/** The sweep timer armed through the kit's script. */
export const BACK_ARM = { tool: "Bash", input: { command: "node .agents/skills/coordinate/scripts/timer.mjs armed foreground fg1+loop 30" }, ok: true };
export const BACK_REPORT = { text: "Back after the night. Merged: #1 and #2, checked and passed. #3 is parked on a time-zone test; the retro filed #6, ready. No other sessions: no claims or branches but mine. Next: #5, then #6. Loop restarted. FYI: a kit draft (check:merge is missing) is in docs/state.md under Retro." };

export const BACK_PLAN = {
  with: { steps: [BACK_ISSUE, BACK_STATE, BACK_ARM, BACK_REPORT] },
  without: { steps: [BACK_ISSUE_UNQUEUED, backState("\n- Kit draft: needs your yes before I file it on onRails.\n"),
    { tool: "AskUserQuestion", input: { questions: [{ question: "How do you want to triage?" }] } },
    { text: "Is anyone else working on this repo right now? Pick one: try #3, clear the list, or restart the loop?" }] },
};
