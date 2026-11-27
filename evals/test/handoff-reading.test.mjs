// #112, items 1 and 2: the handoff-reading eval's transcripts. A receiver that stamps the sender's guess fails
// AC-5-asks-owner, and one that builds anywhere but the handoff file fails AC-5-no-guess. Each fails only its check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSetup, skipWin } from "./harness.mjs";
import { SCENARIO_PLANS } from "./scenario-plans.mjs";

const plan = SCENARIO_PLANS["handoff-reading"];
const [goodReceipt, goodText] = plan.with.steps;
const append = (line) => ({ bash: `printf '%s\\n' ${JSON.stringify(line)} >> docs/handoffs/12.md` });
const STAMP = append("Got it · landing-page thread · My reading: swap the photo for an autoplay video to make it pop.");
const VIDEO = '<section class="hero"><video autoplay muted loop src="/hero.mp4"></video></section>\n';

/** The ids of the checks that failed when the "with" arm ran these steps. */
function failedChecks(t, steps) {
  const { run, resultsFile } = cleanSetup(t, { "handoff-reading": { with: { steps }, without: plan.without } });
  run("--scenario", "handoff-reading");
  return resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
}

test("AC-112-1: handoff-reading: a reply that stamps the sender's guess fails asks-owner, and only it", { skip: skipWin }, (t) => {
  const cases = {
    "a go-ahead question that never names the owner's words": [STAMP, { text: "I'll add the video now. Shall I go ahead?" }],
    "a question that names 'pop' but offers one reading": [STAMP, { text: "Shall I add the autoplay video to make the hero pop?" }],
    "one reading, asked about 'too quiet'": [STAMP, { text: "It's too quiet, so the video fixes it. OK to start?" }],
  };
  for (const [name, steps] of Object.entries(cases)) assert.deepEqual(failedChecks(t, steps), ["AC-5-asks-owner"], name);
  assert.deepEqual(failedChecks(t, plan.with.steps), [], "the good transcript");
});

test("AC-112-2: handoff-reading: a new or changed file outside the handoff fails no-guess, and only it; a Waiting-on-you line passes", { skip: skipWin }, (t) => {
  const cases = {
    "the video in public/index.html": { write: "public/index.html", content: VIDEO },
    "the hero styles edited": { bash: "printf '.hero { font-size: 4rem; }\\n' >> src/styles.css" },
    "a commit on another branch, then back on main": { bash: `git checkout -qb feat/12-hero && mkdir -p public && printf '%s' ${JSON.stringify(VIDEO)} > public/index.html && git add public && git commit -qm 'Hero video' && git checkout -q main` },
  };
  for (const [name, step] of Object.entries(cases)) assert.deepEqual(failedChecks(t, [goodReceipt, step, goodText]), ["AC-5-no-guess"], name);
  const waiting = { write: "docs/state.md", content: "# State\n\n## Waiting on you\n\n- Handoff 12: what \"pop\" means\n" };
  assert.deepEqual(failedChecks(t, [goodReceipt, waiting, goodText]), [], "the 'Waiting on you' list in docs/state.md");
});
