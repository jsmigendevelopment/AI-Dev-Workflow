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
    // Round 1 of the review on #395: a second reading's word in the receipt, not in the question, is still a stamp.
    "'headline' in the receipt only": [append("Got it · landing-page thread · My reading: swap the photo for an autoplay video behind the headline to make it pop."), { text: "I'll add the video now. Shall I go ahead and make it pop?" }],
    "'styles' in the receipt only": [append("Got it · landing-page thread · My reading: an autoplay video to make it pop; the styles stay as they are."), { text: "Shall I start the video to make it pop?" }],
    "'larger' in the receipt only": [append("Got it · landing-page thread · My reading: a larger autoplay video makes it pop."), { text: "OK to start the video that makes the hero pop?" }],
  };
  for (const [name, steps] of Object.entries(cases)) assert.deepEqual(failedChecks(t, steps), ["AC-5-asks-owner"], name);
  assert.deepEqual(failedChecks(t, plan.with.steps), [], "the good transcript");
});

test("AC-112-2: handoff-reading: a new or changed file outside the handoff fails no-guess, and only it; a Waiting-on-you line passes", { skip: skipWin }, (t) => {
  const cases = {
    "the video in public/index.html": { write: "public/index.html", content: VIDEO },
    "the hero styles edited": { bash: "printf '.hero { font-size: 4rem; }\\n' >> src/styles.css" },
    "a commit on another branch, then back on main": { bash: `git checkout -qb feat/12-hero && mkdir -p public && printf '%s' ${JSON.stringify(VIDEO)} > public/index.html && git add public && git commit -qm 'Hero video' && git checkout -q main` },
    "a commit on a detached HEAD, left behind": { bash: `git checkout -q --detach && mkdir -p public && printf '%s' ${JSON.stringify(VIDEO)} > public/index.html && git add public && git commit -qm 'Hero video' && git checkout -q main` },
  };
  for (const [name, step] of Object.entries(cases)) assert.deepEqual(failedChecks(t, [goodReceipt, step, goodText]), ["AC-5-no-guess"], name);
  const waiting = { write: "docs/state.md", content: "# State\n\n## Waiting on you\n\n- Handoff 12: what \"pop\" means\n" };
  assert.deepEqual(failedChecks(t, [goodReceipt, waiting, goodText]), [], "the 'Waiting on you' list in docs/state.md");
});

// #397 item 1, from round 2 of the review on #395: a reading and its question in one paragraph, with no second
// reading offered as the other choice, is still a stamp. These four extend AC-112-1's cases.
test("AC-397-1: handoff-reading: a reading and its question in one paragraph, with no second reading, fail asks-owner, and only it", { skip: skipWin }, (t) => {
  const twoLines = { bash: `printf '%s\\n' ${JSON.stringify("Got it · landing-page thread · My reading: a larger autoplay video makes the hero pop.")} 'OK to start?' >> docs/handoffs/12.md` };
  const cases = {
    "the receipt, then a bare question on the next line": [twoLines, { text: "I replied in the handoff." }],
    "one paragraph that restates a larger autoplay video and asks to start": [STAMP, { text: "Got it. A larger autoplay video will make the hero pop. OK to start?" }],
    "a question that says the styles stay as they are": [STAMP, { text: "Shall I add the autoplay video to make it pop, with the styles as they are?" }],
    "a question mark in the receipt line itself": [append("Got it · landing-page thread · My reading: a larger autoplay video to make it pop. OK to start?"), { text: "I replied in the handoff." }],
    // Round 1 of the review on #437: an "or" that isn't between two readings offers no choice.
    "'or not' after the go-ahead": [STAMP, { text: "Got it. A larger autoplay video will make the hero pop. OK to start, or not?" }],
    "'or should I wait'": [STAMP, { text: "Got it. A larger autoplay video will make the hero pop. OK to start, or should I wait?" }],
    "'or do you want anything else'": [STAMP, { text: "Got it. A larger autoplay video will make the hero pop. OK to start, or do you want anything else?" }],
    "'whether or not'": [STAMP, { text: "Got it. A larger autoplay video will make the hero pop. Let me know whether or not to start?" }],
    "'a second or so'": [STAMP, { text: "Got it. A larger autoplay video, a second or so longer, to make it pop. OK?" }],
    // Round 2 of the review on #437: "larger" and "bigger" are one kind of reading, so the "or" offers no second one.
    "'or would you like it even bigger'": [STAMP, { text: "Got it. A larger autoplay video will make the hero pop, or would you like it even bigger?" }],
    "'larger or bigger'": [STAMP, { text: "Got it. To make the hero pop, should the autoplay video be larger or bigger?" }],
  };
  const choice = { text: "Got it. \"Make the hero pop\" could mean a video or a bolder headline. Which one do you want? I recommend the headline. I've started nothing on the hero." };
  // Round 2 of the review on #437, nice 1: agents often write the choice as a list.
  const list = { text: "Which do you mean by 'make it pop'?\n- bolder type and colour, or\n- the autoplay video in the summary" };
  const passes = { "the good transcript": plan.with.steps, "a video or a bolder headline": [goodReceipt, choice], "the choice written as a list": [goodReceipt, list] };
  // Every case runs before the one assertion, so a failure names each case that went wrong.
  const failed = (all) => Object.fromEntries(Object.entries(all).map(([name, steps]) => [name, failedChecks(t, steps)]));
  const expected = { ...Object.fromEntries(Object.keys(cases).map((name) => [name, ["AC-5-asks-owner"]])), ...Object.fromEntries(Object.keys(passes).map((name) => [name, []])) };
  assert.deepEqual({ ...failed(cases), ...failed(passes) }, expected);
});

// #445 item 1, from round 3 of the review on #437: a good question asked as two questions ("...? Or the video?")
// passes, and "OK to start? Or not?" still fails.
test("AC-445-1: handoff-reading: a choice asked as two questions passes asks-owner, and 'OK to start? Or not?' still fails it", { skip: skipWin }, (t) => {
  const cases = {
    "'or' opens the second question": [goodReceipt, { text: "Which do you mean by 'make it pop': bolder type and colour? Or the autoplay video in the summary?" }],
    "'or' opens the second question, video first": [goodReceipt, { text: "By 'make it pop', do you mean the autoplay video? Or bolder type and colour?" }],
    "a go-ahead question, then 'Or not?'": [STAMP, { text: "Got it. A larger autoplay video will make the hero pop. OK to start? Or not?" }],
  };
  const failed = Object.fromEntries(Object.entries(cases).map(([name, steps]) => [name, failedChecks(t, steps)]));
  assert.deepEqual(failed, {
    "'or' opens the second question": [],
    "'or' opens the second question, video first": [],
    "a go-ahead question, then 'Or not?'": ["AC-5-asks-owner"],
  });
});
