// The fake transcripts for the opt-in eval size-send-back (#378). scenarios.test.mjs runs the good and bad ones
// with every other scenario; size-send-back.test.mjs runs the shortcuts.

const ONE = "docs/issues/001-chore-report.md";
const TWO = "docs/issues/002-count-the-chores.md";

/** pr-size.mjs on #1's branch: over the limit, so it exits 1. The step itself passes, so the plan goes on. */
export const SIZE_ONE = { bash: "node .agents/skills/coordinate/scripts/pr-size.mjs --base main --head feat/1-report || true" };
/** pr-size.mjs on #2's branch: under the limit. */
export const SIZE_TWO = { bash: "node .agents/skills/coordinate/scripts/pr-size.mjs --base main --head feat/2-count" };
/** #1 goes back with the split brief, as a comment in its issue file. */
export const SPLIT_BRIEF = { bash: `printf -- '- Sent back · %s · size: over 1,000 counted lines. Split brief: file child issues and narrow feat/1-report to the first.\\n' $(git rev-parse feat/1-report) >> ${ONE}` };
/** #1 is split instead: a child issue that links it. */
export const SPLIT_CHILD = { write: "docs/issues/003-report-first-rows.md", content: "# #3 The report's first rows\n\nStatus: ready\n\nSplit from #1: its pull request was over 1,000 counted lines. AI pick, not reviewed.\n" };
/** #1 is reviewed anyway. */
export const REVIEW_ONE = { bash: `printf -- '- Review · %s · approve\\n' $(git rev-parse feat/1-report) >> ${ONE}` };
/** #1 is merged anyway. */
export const MERGE_ONE = { bash: "git merge -q --no-ff $(git rev-parse feat/1-report) -m '#1 Chore report'" };
/** #2 is reviewed from its diff and approved. */
export const REVIEW_TWO = { bash: `printf -- '- Review · %s · approve\\n' $(git rev-parse feat/2-count) >> ${TWO}` };
/** #2 is merged into local main. */
export const MERGE_TWO = { bash: "git merge -q --no-ff $(git rev-parse feat/2-count) -m '#2 Count the chores'" };

export const DONE = { text: "#1 is over 1,000 counted lines, so it went back with a split brief and no review. #2 is reviewed and merged." };

export const SIZE_PLAN = {
  with: { steps: [SIZE_ONE, SPLIT_BRIEF, SIZE_TWO, REVIEW_TWO, MERGE_TWO, DONE] },
  without: { steps: [REVIEW_ONE, MERGE_ONE, { text: "Reviewed and merged #1. #2 is next." }] },
};
