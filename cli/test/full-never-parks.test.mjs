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

test("AC-204-1: WHEN the test reads coordinate step 6's review-cap paragraph THEN its On Full sentence names one more round with an escalation step left (#406), then a split through issues, and no ⏳ decision or needs-human", () => {
  const onFull = line(reviewCap(), "   - ", "**On Full,**");
  assert.ok(onFull, "an On Full bullet in the review-cap paragraph");
  // #406: the extra round takes routing's next escalation step, if one is left, never the next tier.
  assert.match(onFull, /if the builder has an escalation step left under `routing`'s "Escalation"/);
  assert.match(onFull, /run one more round with a fresh builder that takes that step/);
  assert.match(onFull, /the profile's own limits win/);
  assert.match(onFull, /Still rejected\? Split it\./);
  assert.match(onFull, /close the pull request with a comment that keeps its branch/i);
  assert.match(onFull, /send the issue to `issues` to cut into smaller issues \(each 4 or under\)/);
  assert.match(onFull, /link the old branch and every open finding from each new issue/);
  assert.match(onFull, /The old issue closes as split\./);
  // #209 round 1, nice 2: an issue too small to split gets one new issue, not the same split again.
  // #406: no escalation step is left by then, so the last round's tier and effort, never a tier up.
  assert.match(onFull, /Can't be cut smaller\? Then `issues` files one new issue with every open finding as its checklist, and a fresh builder builds it on the same tier and effort as the last round, instead of a split at the same size\./);
  assert.ok(onFull.indexOf("Split it.") < onFull.indexOf("Can't be cut smaller?"), "the small-issue clause follows the split");
  assert.match(onFull, /"AI pick, not reviewed".*a `failed` board event.*the next batched ℹ️ FYI/);
  assert.ok(onFull.indexOf("escalation step left") < onFull.indexOf("Split it."), "the escalation round comes before the split");
  assert.doesNotMatch(onFull, /next tier up/, "#406: the cap never climbs a tier on its own");
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

test("AC-204-3: WHEN the test reads coordinate step 7's red-main bullet THEN On Full names diagnose with an escalation step only if one is left under routing (#469), then a revert of the merge to blame, and a 🛑 only for an always-stop cause", () => {
  const bullet = redMain();
  assert.ok(bullet, "the red-main bullet");
  const at = bullet.indexOf("On Full,");
  assert.ok(at > 0, "an On Full sentence");
  const below = bullet.slice(0, at);
  const onFull = bullet.slice(at);
  assert.match(below, /Below Full, if it's still red after one fix round and nothing else can merge, it's a 🛑 blocker\./, "below Full is unchanged");
  // #469: the diagnose round follows routing's Escalation, never the next tier, and never lands on the strongest tier on its own.
  assert.match(onFull, /^On Full, after one fix round a fresh agent runs `diagnose` before anyone pings the person: one escalation step up if it has one left under `routing`'s "Escalation" \(the profile's own limits win\), else on the same tier and effort\. Never move an agent to the strongest tier on your own\./);
  assert.doesNotMatch(onFull, /next tier up|tier above/, "#469: the diagnose round never climbs a tier on its own");
  assert.match(onFull, /Merges that don't fix main stay stopped until it is green, and builders keep building on their branches\./);
  // #209 round 1, must 1: a failed diagnose round never ends on the person. Revert the merge to blame, or keep going.
  // #209 round 2, nice 1 and 2: the revert gets its lane's usual step 6, and the closed issue is reopened.
  assert.match(onFull, /Still red after that round\? Revert the merge that turned main red through a revert pull request \(the usual step 6 for its lane; never a push to main\), then reopen its issue \(or file a new one that links it\) and send it to a fresh builder for a fix round\./);
  assert.match(onFull, /A merge that added a database migration gets a forward fix instead of a revert, as a fix round with a fresh builder: migrations only go forward\./);
  // #209 round 2, must 1: the fixes that turn main green can merge, not only the revert.
  assert.match(onFull, /While main is red, only a pull request that fixes it merges: a fix round's, a `diagnose` round's, or this revert\./);
  assert.doesNotMatch(onFull, /one merge allowed|one code review/, "no line that stops the fix rounds from merging, and no lane-blind review");
  assert.match(onFull, /No merge to blame\? Run another fresh `diagnose` round on the same tier as the last one, or split the fix through `issues`\./);
  // #209 round 2, nice 3: point to the whole always-stop list, never a partial one.
  assert.match(onFull, /It's a 🛑 blocker only for a cause on `AGENTS\.md`'s always-stop list or the person's own login, never because the rounds keep failing\./);
  assert.doesNotMatch(onFull, /\(production, real data, secrets, paying\)/, "no partial always-stop list");
  assert.doesNotMatch(onFull, /nothing else can (?:move|merge)/, "a full queue never turns a red main into a 🛑 on Full");
  assert.equal(onFull.split("🛑").length - 1, 1, "one 🛑, for an always-stop cause only");
  const order = ["`diagnose`", "Revert the merge", "No merge to blame?", "🛑"].map((m) => onFull.indexOf(m));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "diagnose, then the revert, then no merge to blame, then the 🛑");
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
  // #469: the same rule as coordinate step 7: an escalation step only if one is left under routing, never the strongest tier on its own.
  assert.match(lines["Main goes red"], /after one fix round, a fresh agent runs `diagnose` before anyone pings the person, taking an escalation step only if it has one left under `routing`, else on the same tier and effort\. Never the strongest tier on its own\./);
  assert.doesNotMatch(lines["Main goes red"], /next tier up|tier above/, "#469: no climb by tier");
  // #209 round 2, nice 1: the merge closed the issue, so it's reopened; a migration only goes forward.
  assert.match(lines["Main goes red"], /revert the merge that turned main red through a pull request and reopen its issue for a fix round \(a merge that added a migration gets a forward fix instead\)/i);
  assert.match(lines["Main goes red"], /another `diagnose` round or a split through `issues`/);
  assert.match(lines["Main goes red"], /A 🛑 only for a cause on `AGENTS.md`'s always-stop list or the person's own login\./);
  assert.doesNotMatch(lines["Main goes red"], /nothing else can (?:move|merge)/);
  assert.match(lines["An issue fails twice"], /`coordinate`'s review cap/);
  assert.match(lines["An issue fails twice"], /escalation step left under `routing`.*split through `issues`/);
  // #209 round 1, must 2: a stuck builder is one failed round toward the cap, not a step up a tier (`routing`).
  assert.match(lines["the stuck builder"], /stop the stuck builder and count it as one failed round toward the review cap: before the cap, a fresh builder on the same tier; at the cap, follow `coordinate`'s review cap\./);
  assert.doesNotMatch(lines["the stuck builder"], /next tier up/, "being stuck alone never moves the issue up a tier");
  assert.match(lines["the stuck builder"], /A strongest-tier builder is never stopped on your own call \(the always-stop list; `ask`, "A running job"\)/, "a strongest-tier builder is never stopped");
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

test("#209 round 1, must 3: WHEN the test reads the README's line on what each pull request goes through THEN it says what the review cap does below Full and on Full", () => {
  for (const file of ["README.md", "cli/README.md"]) {
    const text = read(file);
    assert.doesNotMatch(text, /After two rejected rounds, the issue is parked and you're asked\./, `${file}: the old line, wrong on Full`);
    // #406: the extra round is routing's next escalation step, so it runs only while one is left.
    assert.match(text, /After two rejected rounds \(three for a complex issue\), below Full the issue is parked and you're asked\. On Full, nothing waits: one more round one step up if the builder has an escalation step left, then the issue is split into smaller ones, with an FYI\./, file);
    assert.doesNotMatch(text, /one more round on a stronger model/, `${file}: the old line, which could climb past the escalation steps`);
  }
});
