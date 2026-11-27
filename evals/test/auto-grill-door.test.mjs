// The auto-grill-door eval's transcripts: #102's reviews, then #108's follow-ups, stricter door checks and fewer
// false failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AUTO_GRILL_PLAN, REVIEWS, REVIEWS_108, REVIEWS_189, reviewPlan } from "./auto-grill-reviews.mjs";
import { failedChecks } from "./failed-checks.mjs";
import { setup, skipWin } from "./harness.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

const cases = (prefix) => Object.entries(REVIEWS_108).filter(([name]) => name.startsWith(prefix));
const failedFor = (t, review) => failedChecks(t, "auto-grill-door", { with: reviewPlan(review), without: AUTO_GRILL_PLAN.without });

for (const [item, title] of [
  ["1", "the money door must come before the first '##' section"],
  ["2", "a blanket question or a float pick that only says cents fails"],
  ["3", "money on any line outside the door blocks fails, 'Look and feel' included"],
  ["4", "bold or listed fields, money later in the topic and 'amount' in a row all pass"],
]) {
  test(`#108 item ${item}: ${title}`, { skip: skipWin }, (t) => {
    const mine = cases(`${item}:`);
    const got = Object.fromEntries(mine.map(([name, { review }]) => [name, failedFor(t, review)]));
    assert.deepEqual(got, Object.fromEntries(mine.map(([name, { fails }]) => [name, fails])));
  });
}

test("#108 item 5: the grill-log template leaves every Source blank, and says what goes there on Full and below", () => {
  const template = read(".agents/skills/idea/templates/grill-log.md");
  const sources = template.match(/^\*\*Source:\*\*.*$/gm);
  assert.ok(sources?.length > 0, "the template has Source lines");
  for (const line of sources) assert.equal(line.trimEnd(), "**Source:**", "no default source");
  assert.match(template, /Below Full, the person's own answer is "person"\. On Full.*"person \(pitch\)".*"AI pick, not reviewed"/);
});

test("#189 AC-1 to AC-3: floating isn't money, whole-unit picks, blanket questions and the door's own table", { skip: skipWin }, (t) => {
  const got = Object.fromEntries(Object.entries(REVIEWS_189).map(([name, { review }]) => [name, failedFor(t, review)]));
  assert.deepEqual(got, Object.fromEntries(Object.entries(REVIEWS_189).map(([name, { fails }]) => [name, fails])));
});

test("#189 AC-4: the grill-log template and grill both list \"person (pitch)\" and \"AI pick, not reviewed\"", () => {
  for (const file of [".agents/skills/idea/templates/grill-log.md", ".agents/skills/grill/SKILL.md"]) {
    const text = read(file);
    assert.match(text, /person \(pitch\)/, file);
    assert.match(text, /AI pick, not reviewed/, file);
  }
});

// AC-6 of #102: the reviewers' transcripts. Each bad one fails exactly its listed checks; each good one passes.
test("auto-grill-door: buried or kept float picks fail, door-first reviews pass", { skip: skipWin }, () => {
  for (const [name, { review, fails }] of Object.entries(REVIEWS)) {
    const { run, resultsFile } = setup({ "auto-grill-door": { with: reviewPlan(review), without: { steps: [{ text: "x" }] } } });
    run("--scenario", "auto-grill-door");
    const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, fails, name);
  }
});
