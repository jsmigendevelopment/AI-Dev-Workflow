// #210: the review cap in `ask` and the cheat sheet, coordinate step 5's stuck line and the follow-ups from the
// #209 and #218 reviews say what Full does. These rules are text the agents read, so the tests read the shipped text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unconditionalAsks, read } from "./approval-scan.mjs";

const COPIES = [".agents/skills", ".claude/skills", "plugin/cli/kit/files/core/.agents/skills"];
const lineWith = (text, needle) => text.split("\n").find((l) => l.includes(needle)) ?? "";
const stuck = (root) => lineWith(read(`${root}/coordinate/SKILL.md`), "**Stuck isn't stopped.**");

test("AC-210-1: WHEN the scan reads ask, the cheat sheet and coordinate THEN the three lines aren't flagged and each has a below-Full or On Full condition", () => {
  for (const root of COPIES) {
    const cap = lineWith(read(`${root}/ask/SKILL.md`), "| ⏳ **Decision** |");
    assert.match(cap, /Below Full, the review cap was hit \(on Full, follow `coordinate`'s review cap: nothing parks\)/, root);
    assert.deepEqual(unconditionalAsks(cap), [], root);
    const s = stuck(root);
    assert.match(s, /Below Full, park that issue/, root);
    assert.deepEqual(unconditionalAsks(s), [], root);
  }
  const sheet = lineWith(read("guide/cheat-sheet.md"), "| ⏳ **Decision** |");
  assert.match(sheet, /review cap hit below Full \(on Full, `coordinate`'s review cap: nothing parks\)/);
  assert.deepEqual(unconditionalAsks(sheet), []);
});

test("AC-210-2: WHEN coordinate step 5 is read THEN its On Full line points to the stuck-builder rule and says nothing parks", () => {
  for (const root of COPIES) {
    const onFull = stuck(root).slice(stuck(root).indexOf("On Full,"));
    assert.match(onFull, /^On Full, nothing parks: follow `afk`'s stuck-builder rule \(a stuck builder counts as one failed round toward the review cap, and a strongest-tier job is never stopped on your own call\)\./, root);
    assert.doesNotMatch(onFull, /either stops/, root);
    assert.match(read(`${root}/afk/SKILL.md`), /any builder with no new commit in 20 minutes is stuck/, root);
  }
});

test("#210 comments: a parked claim isn't stale, the migration fix is a fix round, diagnose stays on its tier, afk matches step 7", () => {
  for (const root of COPIES) {
    const c = read(`${root}/coordinate/SKILL.md`);
    assert.match(c, /A claim labelled `needs-human` is parked, not stale/, root);
    assert.match(c, /forward fix instead of a revert, as a fix round with a fresh builder: .* If the forward fix fails too, follow the no-merge-to-blame path below\./, root);
    assert.match(c, /Run another fresh `diagnose` round on the same tier as the last one/, root);
    assert.match(read(`${root}/afk/SKILL.md`), /A 🛑 only for a cause on `AGENTS.md`'s always-stop list or the person's own login\./, root);
  }
});
