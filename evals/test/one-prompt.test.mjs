// The one-prompt scenario's transcripts: each changed part of the good one fails its own check (#180, split from
// run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, skipWin } from "./harness.mjs";
import { ONE_PROMPT_REVIEW, SCENARIO_PLANS } from "./scenario-plans.mjs";

// AC-5 of #111: one door whose Pick: line lacks "AI pick, not reviewed" fails the review check, and only it.
test("AC-5: one-prompt: a door Pick without \"AI pick, not reviewed\" fails", { skip: skipWin }, () => {
  const review = ONE_PROMPT_REVIEW.replace("the household owns the list. AI pick, not reviewed", "the household owns the list.");
  const plan = SCENARIO_PLANS["one-prompt"];
  const steps = plan.with.steps.map((s) => (s.write === "kickoff/review.md" ? { ...s, content: review } : s));
  const { run, resultsFile } = setup({ "one-prompt": { with: { steps }, without: plan.without } });
  run("--scenario", "one-prompt");
  const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
  assert.deepEqual(failed, ["AC-5-AC1-review-not-reviewed"]);
});

// AC-5 of #111: the checks prove actions. Every one of these did the review, the FYI and the issue,
// and none built issue 1, so each fails AC-5-first-issue-built and nothing else.
const BUILD = "git checkout -qb feat/1-the-skeleton && mkdir -p src && printf 'export const app = 1;\\n' > src/app.mjs && git add src && git commit -qm '#1 The skeleton'";
const unbuilt = (extra) => [...SCENARIO_PLANS["one-prompt"].with.steps.filter((st) => st.bash !== BUILD && !st.text), ...extra];
const ONE_PROMPT_BAD = {
  "a conditional wait": [{ text: "If the picks look right to you, I'll start building." }],
  "as soon as you confirm": [{ text: "The loop begins as soon as you confirm the money door." }],
  "say yes": [{ text: "Say yes and the loop starts." }],
  "when you've checked": [{ text: "The build starts when you've checked kickoff/review.md." }],
  "not started yet": [{ text: "I have not started the loop yet; it starts after you look at the review." }],
  "after your go-ahead": [{ text: "I'll kick off the build loop after your go-ahead on the review." }],
  "only a board render": [{ bash: "node .agents/skills/coordinate/scripts/board.mjs render --print || true" }, { text: "The loop is running." }],
  "an empty branch": [{ bash: "git branch feat/1-the-skeleton" }, { text: "Started issue #1 on feat/1-the-skeleton." }],
  "a status line only": [{ write: "docs/issues/001-the-skeleton.md", content: "# #1 The skeleton\n\nStatus: in-progress\n\n- AC-1-1 (auto): WHEN the app starts THEN the starter page loads.\n" }, { text: "Issue #1 is in progress." }],
  "docs-only commits": [{ bash: "git checkout -qb feat/1-the-skeleton && git add -A && git commit -qm '#1 Plan'" }, { text: "Issue #1 is on its branch." }],
};
test("AC-5: one-prompt: waits and loops that never built issue 1 fail first-issue-built, and only it", { skip: skipWin }, () => {
  for (const [name, extra] of Object.entries(ONE_PROMPT_BAD)) {
    const { run, resultsFile } = setup({ "one-prompt": { with: { steps: unbuilt(extra) }, without: SCENARIO_PLANS["one-prompt"].without } });
    run("--scenario", "one-prompt");
    const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, ["AC-5-first-issue-built"], name);
  }
});

// AC-5 of #111: built issue 1 and then asked through the ask tool: fails AC-5-AC1-no-ask-tool, and only it.
// Built issue 1 and then said "say yes for more": that's no wait, so every check passes.
test("AC-5: one-prompt: an ask tool fails no-ask-tool; a soft line after building passes", { skip: skipWin }, () => {
  const plan = SCENARIO_PLANS["one-prompt"];
  const ask = [...plan.with.steps, { tool: "AskUserQuestion", input: { questions: [{ question: "Start the loop?", options: [{ label: "Yes" }] }] } }];
  const soft = [...plan.with.steps.slice(0, -1), { text: "Issue #1 is built on feat/1-the-skeleton. Say yes for more." }];
  for (const [steps, want] of [[ask, ["AC-5-AC1-no-ask-tool"]], [soft, []]]) {
    const { run, resultsFile } = setup({ "one-prompt": { with: { steps }, without: plan.without } });
    run("--scenario", "one-prompt");
    const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, want);
  }
});
