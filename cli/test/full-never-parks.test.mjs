// #204: on Full, the review cap, a red main and an issue that keeps failing never park the loop and never wait
// on the person. Below Full, nothing changes. These rules are text the agents read, so the tests read the
// shipped skill text, as standing-decisions.test.mjs does. AC-6 is an agent check against decision row 43.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const COPIES = [".agents/skills", ".claude/skills", "plugin/cli/kit/files/core/.agents/skills"];
// The On Full lines may say what they don't do. Only this exact wording is allowed to name ⏳ or needs-human.
const NO_GATE = "No ⏳ decision and no `needs-human`.";

/** coordinate's step 6 paragraph after 6.5: the review cap, with its bullets, up to step 7. */
const reviewCap = () => {
  const text = read(".agents/skills/coordinate/SKILL.md");
  const start = text.indexOf("   A failure sends the findings back to a fresh builder.");
  assert.ok(start > 0, "the review-cap paragraph is there");
  return text.slice(start, text.indexOf("\n7. **Merge through one queue,**", start));
};
/** The line of `text` that starts with `prefix` after the indent, or "". */
const line = (text, indent, prefix) => text.split("\n").find((l) => l.startsWith(`${indent}${prefix}`)) ?? "";
/** coordinate's step 7 bullet on a red main: one line. */
const redMain = () => line(read(".agents/skills/coordinate/SKILL.md"), "   - ", "**If `check` fails on main (step 8), stop merging.**");
/** The line right after the first line of `text` that starts with `indent + prefix`. */
const nextLine = (text, indent, prefix) => {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${indent}${prefix}`));
  assert.ok(at >= 0, `found ${prefix}`);
  return lines[at + 1] ?? "";
};

test("AC-204-1: WHEN the test reads coordinate step 6's review-cap paragraph THEN its On Full sentence names one more round on the next tier up, then a split through issues, and no ⏳ decision or needs-human", () => {
  const onFull = line(reviewCap(), "   - ", "**On Full,**");
  assert.ok(onFull, "an On Full bullet in the review-cap paragraph");
  assert.match(onFull, /one more round with a fresh builder on the next tier up/);
  assert.match(onFull, /`routing`'s "escalate one step after a verified failure"/);
  assert.match(onFull, /the profile's own limits win/);
  assert.match(onFull, /Still rejected\? Split it\./);
  assert.match(onFull, /close the pull request with a comment that keeps its branch/i);
  assert.match(onFull, /send the issue to `issues` to cut into smaller issues \(each 4 or under\)/);
  assert.match(onFull, /link the old branch and every open finding from each new issue/);
  assert.match(onFull, /The old issue closes as split\./);
  assert.match(onFull, /"AI pick, not reviewed".*a `failed` board event.*the next batched ℹ️ FYI/);
  assert.ok(onFull.indexOf("next tier up") < onFull.indexOf("Split it."), "the escalation round comes before the split");
  assert.ok(onFull.includes(NO_GATE), "it says there's no ⏳ decision and no needs-human");
  const rest = onFull.replace(NO_GATE, "");
  assert.doesNotMatch(rest, /⏳|needs-human|`ask`/, "the On Full bullet asks nothing");
  assert.doesNotMatch(rest, /\bpark/i, "the On Full bullet parks nothing");
});

test("AC-204-2: WHEN the test reads the same paragraph THEN the below-Full ⏳ decision is still there, with Below Full before it", () => {
  const cap = reviewCap();
  const below = line(cap, "   - ", "**Below Full,**");
  assert.ok(below, "a Below Full bullet in the review-cap paragraph");
  assert.match(below, /^ {3}- \*\*Below Full,\*\* the cap is a ⏳ decision: use `ask`, add a `failed` board event, stop work on it, and pick the next ready issue\.$/);
  assert.match(cap, /\*\*After two rejected rounds on one issue \(three at complexity 6–7\)/, "the cap itself is unchanged");
  assert.match(cap, /A verdict stands until the commit changes\. Never re-run a reviewer to get a different answer\./);
  assert.ok(cap.indexOf("**Below Full,**") < cap.indexOf("**On Full,**"), "Below Full comes first, as in step 6.5");
});

test("AC-204-3: WHEN the test reads coordinate step 7's red-main bullet THEN On Full names diagnose on the next tier up before the person hears of it, and a 🛑 only when that fails too and nothing else can move", () => {
  const bullet = redMain();
  assert.ok(bullet, "the red-main bullet");
  const at = bullet.indexOf("On Full,");
  assert.ok(at > 0, "an On Full sentence");
  const below = bullet.slice(0, at);
  const onFull = bullet.slice(at);
  assert.match(below, /Below Full, if it's still red after one fix round and nothing else can merge, it's a 🛑 blocker\./, "below Full is unchanged");
  assert.match(onFull, /^On Full, after one fix round a fresh agent runs `diagnose` on the next tier up before the person hears of it\./);
  assert.match(onFull, /Merges stay stopped until main is green, and builders keep building on their branches\./);
  assert.match(onFull, /It's a 🛑 blocker only when that `diagnose` round also fails and nothing else can move \(rule 11\)\./);
  assert.equal(onFull.split("🛑").length - 1, 1, "one 🛑, the last resort");
  assert.ok(onFull.indexOf("`diagnose`") < onFull.indexOf("🛑"), "diagnose comes before the 🛑");
  assert.doesNotMatch(onFull, /⏳|needs-human|\bpark/i);
});

test("AC-204-4: WHEN the test reads afk's unattended rules and its watchdog THEN a red main, an issue that fails twice and the stuck builder each have an On Full line, and none says park", () => {
  const afk = read(".agents/skills/afk/SKILL.md");
  const rules = afk.slice(afk.indexOf("## Unattended rules"), afk.indexOf("## Watchdog and hard stop"));
  const watchdog = afk.slice(afk.indexOf("## Watchdog and hard stop"), afk.indexOf("## Checking usage"));
  const lines = {
    "Main goes red": nextLine(rules, "- ", "**Main goes red:**"),
    "An issue fails twice": nextLine(rules, "- ", "**An issue fails twice**"),
    "the stuck builder": nextLine(watchdog, "  - ", "any builder with no new commit in 20 minutes is stuck"),
  };
  for (const [name, text] of Object.entries(lines)) {
    assert.match(text, /^ +- \*\*On Full:\*\* /, `${name}: an On Full line`);
    assert.doesNotMatch(text, /park/i, `${name}: the On Full line parks nothing`);
    assert.doesNotMatch(text, /⏳|needs-human/, `${name}: the On Full line asks nothing`);
  }
  assert.match(lines["Main goes red"], /`coordinate` step 7/);
  assert.match(lines["Main goes red"], /`diagnose` on the next tier up/);
  assert.match(lines["An issue fails twice"], /`coordinate`'s review cap/);
  assert.match(lines["An issue fails twice"], /next tier up.*split through `issues`/);
  assert.match(lines["the stuck builder"], /`coordinate`'s review cap/);
  assert.match(lines["the stuck builder"], /never stopped \(`ask`, "A running job"\)/, "a strongest-tier builder is never stopped");
  // Below Full keeps parking, as before.
  assert.match(rules, /^- \*\*An issue fails twice\*\* \(a builder that dies or a rejected check, counted together\): below Full, park it\.$/m);
  assert.match(watchdog, /^ {2}- any builder with no new commit in 20 minutes is stuck: below Full, park its issue \(don't blindly restart it\);$/m);
});

test("AC-204-5: WHEN the test reads the three copies THEN coordinate and afk match in each, with the On Full lines", () => {
  const marks = { coordinate: "Still rejected? Split it.", afk: "- **On Full:** " };
  for (const [skill, mark] of Object.entries(marks)) {
    const [source, ...copies] = COPIES.map((dir) => read(`${dir}/${skill}/SKILL.md`));
    copies.forEach((copy, i) => assert.equal(copy, source, `${COPIES[i + 1]}/${skill}/SKILL.md matches .agents/skills`));
    assert.ok(source.includes(mark), `${skill} has its On Full lines`);
  }
});
