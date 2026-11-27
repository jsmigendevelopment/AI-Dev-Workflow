// The fake transcripts for the opt-in eval full-never-parks (#208). scenarios.test.mjs runs the good and
// bad ones with every other scenario; full-never-parks.test.mjs runs the shortcuts.

const COUNT = "export const count = (chores) => chores.length;\\n";

/** #1 gets one more round: a test for the empty list, on its branch. */
export const PARK_ROUND = { bash: "git switch -q feat/1-sum && mkdir -p test && printf 'import { test } from \"node:test\";\\nimport assert from \"node:assert/strict\";\\nimport { sum } from \"../src/sum.mjs\";\\ntest(\"AC-1-1\", () => assert.equal(sum([]), 0));\\n' > test/sum.test.mjs && git add -A && git commit -qm '#1 Test the empty list' && git switch -q main" };
/** #1 is split instead: a new issue file that links it. */
export const PARK_SPLIT = { write: "docs/issues/003-check-sum-input.md", content: "# #3 Check sum()'s input\n\nStatus: ready\n\nSplit from #1 at its review cap. AI pick, not reviewed.\n" };
/** #2 is built on its branch. */
export const PARK_BUILD = { bash: `git switch -q -c feat/2-count && mkdir -p src && printf '${COUNT}' > src/count.mjs && git add -A && git commit -qm '#2 Count the chores' && git switch -q main` };
/** #2 is merged into local main. */
export const PARK_MERGE = { bash: "git merge -q --no-ff feat/2-count -m 'Merge #2'" };
/** #1 parked on the person. */
export const PARK_LABEL = { bash: "sed -i.bak 's/^Status: in-progress.*/&\\nLabels: needs-human/' docs/issues/001-sum-the-chores.md && rm docs/issues/001-sum-the-chores.md.bak" };

export const PARK_PLAN = {
  with: { steps: [PARK_ROUND, PARK_BUILD, PARK_MERGE, { text: "#1 got one more round (a test for the empty list), AI pick, not reviewed. Built and merged #2." }] },
  without: { steps: [PARK_LABEL, { text: "#1 hit the review cap. Should I split it, or give it another round?" }] },
};
