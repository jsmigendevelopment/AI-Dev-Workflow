// #108, follow-ups to the auto-grill-door eval: stricter door checks and fewer false failures. Its own file,
// so run.test.mjs, already past 500 lines, doesn't grow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AUTO_GRILL_PLAN, REVIEWS_108, reviewPlan } from "./auto-grill-reviews.mjs";
import { failedChecks } from "./failed-checks.mjs";

const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;
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
