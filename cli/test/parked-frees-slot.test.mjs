// #205: on Full, work parked on the person never holds an in-flight slot, so the loop keeps starting ready issues.
// When every open issue is parked, the person gets one 🛑 that lists them all. Below Full, parked work still counts.
// These rules are text the agents read, so the tests read the shipped skill text, as full-never-parks.test.mjs does.
// AC-205-5 is an agent check: a reviewer reads step 2 and step 10 together.
// Review round 1 of #218: an issue that waits on a parked one counts as parked, step 5 no longer stops a Full loop,
// a parked claim still holds its modules, and a cleared item takes the next free slot ahead of new ready issues.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const COPIES = [".agents/skills", ".claude/skills", "plugin/cli/kit/files/core/.agents/skills"];

/** coordinate's loop step 2, "Pick work", with its bullets, up to step 3. */
const step2 = () => {
  const text = read(".agents/skills/coordinate/SKILL.md");
  const start = text.indexOf("2. **Pick work.**");
  assert.ok(start > 0, "coordinate step 2 is there");
  const end = text.indexOf("\n3. **Claim it.**", start);
  assert.ok(end > start, "coordinate step 3 follows it");
  return text.slice(start, end);
};
/** The sentences of `text`, split after a full stop, a question mark or an exclamation mark. */
const sentences = (text) => text.split(/(?<=[.?!])\s+/);
/** The sentences of `text` that start with "On Full". */
const onFull = (text) => sentences(text).filter((s) => /^(?:[-*] )?(?:\*\*)?On Full\b/.test(s));
/** The "In flight at once" paragraph of automation/SKILL.md. */
const inFlightParagraph = () => {
  const text = read(".agents/skills/automation/SKILL.md");
  const para = text.split("\n\n").find((p) => p.startsWith("**In flight at once**"));
  assert.ok(para, "automation has its In flight at once paragraph");
  return para;
};

test("AC-205-1: WHEN the test reads coordinate step 2 THEN an On Full sentence says a claimed issue labelled needs-human and a pull request waiting on the person don't count toward In flight at once", () => {
  const step = step2();
  assert.match(step, /"In flight at once" in `docs\/stack\.md`/, "step 2 names the limit");
  const full = onFull(step).find((s) => /in flight/i.test(s) && /`needs-human`/.test(s));
  assert.ok(full, "an On Full sentence about what counts as in flight");
  assert.match(full, /in flight means claimed, not merged and moving/i);
  assert.match(full, /a claimed issue labelled `needs-human` and a pull request waiting on the person don't count/);
  // Below Full keeps today's rule: parked work counts.
  const below = sentences(step).find((s) => /^Below Full, claimed work parked on the person counts too\b/.test(s));
  assert.ok(below, "a Below Full sentence keeps parked work in the count");
  assert.match(step, /A `needs-human` issue nobody has claimed doesn't count\./, "unclaimed parked issues still don't count");
  // A parked claim keeps its modules, so a ready issue never starts on its files.
  assert.match(step, /Parked work still holds its modules, so no ready issue starts on the same modules as a parked claim\./);
  // A cleared item goes first when a slot frees up.
  const cleared = onFull(step).find((s) => /\bclears\b/.test(s));
  assert.ok(cleared, "an On Full sentence for a parked item that clears");
  assert.match(cleared, /takes the next free slot, ahead of new ready issues/);
});

test("AC-205-2: WHEN the test reads coordinate step 2 THEN start nothing new no longer applies on Full, and an On Full sentence says to send one 🛑 that lists every parked item and what it unblocks", () => {
  const step = step2();
  for (const s of sentences(step).filter((x) => x.includes("start nothing new"))) {
    assert.match(s, /^Below Full\b/, `"start nothing new" is scoped below Full: ${s}`);
  }
  const parked = step.split("\n").find((l) => l.startsWith("   - **Every open issue parked**"));
  assert.ok(parked, "a bullet for every open issue parked");
  // An issue that waits on a parked one, through `Depends on:` or a shared module, counts as parked here.
  assert.match(
    parked,
    /\(on Full: nothing can start or move, because every open issue is parked on the person or waits on one that is, through its `Depends on:` line or a module it shares\)/,
  );
  assert.doesNotMatch(parked, /none ready, none moving/, "the old condition, false whenever a dependent is open, is gone");
  const send = onFull(parked).find((s) => s.includes("🛑"));
  assert.ok(send, "an On Full sentence sends a 🛑");
  assert.match(send, /send one 🛑 through `ask` that lists each parked item, what the person does, and which issues it unblocks/);
  assert.equal(parked.split("🛑").length - 1, 1, "one 🛑, not one per item");
  assert.match(parked, /Keep the sweep timer armed \(step 10 counts parked issues as work left\)\./);
  assert.match(parked, /When one clears, pick it up on the next sweep\./);
  assert.match(parked, /Send the list again only when it changes\./);
  assert.doesNotMatch(parked, /start nothing new/, "the parked bullet never says start nothing new");
  // Step 10 still counts parked issues as work left, so the timer stays armed while everything is parked.
  assert.match(read(".agents/skills/coordinate/SKILL.md"), /Work left means ready, in-flight, parked or gate issues, or a reply still awaited\./);
});

test("AC-205-2: WHEN the test reads coordinate step 5 THEN nothing else that can move stops the loop only below Full, and on Full the loop keeps sweeping", () => {
  const stuck = read(".agents/skills/coordinate/SKILL.md")
    .split("\n")
    .find((l) => l.startsWith("   - **Stuck isn't stopped.**"));
  assert.ok(stuck, "step 5 has its Stuck isn't stopped bullet");
  for (const s of sentences(stuck).filter((x) => /stops the loop/.test(x))) {
    assert.match(s, /^Below Full\b/, `a sentence that stops the loop is scoped below Full: ${s}`);
  }
  const full = onFull(stuck).find((s) => /stops only new work/.test(s));
  assert.ok(full, "an On Full sentence: the always-stop list and nothing else that can move stop only new work");
  assert.match(full, /On Full, either stops only new work on that item: the loop keeps sweeping while any issue is open/);
  assert.match(full, /\(step 10, and step 2's "Every open issue parked"\)/);
});

test("AC-205-3: WHEN the test reads automation's In flight at once paragraph THEN it says parked work doesn't count on Full, and still counts below Full", () => {
  const para = inFlightParagraph();
  const below = sentences(para).find((s) => /^Below Full\b/.test(s));
  assert.ok(below, "a Below Full sentence");
  assert.match(below, /counts claimed work parked on the person: a pull request waiting for their merge, or a claimed issue labelled `needs-human`/);
  const full = onFull(para);
  assert.equal(full.length, 1, "one On Full sentence");
  assert.match(full[0], /parked work doesn't count/);
  assert.match(full[0], /`coordinate` step 2/, "it points to coordinate step 2");
  assert.doesNotMatch(para, /^\*\*In flight at once\*\* is how many issues may be claimed and not yet merged, counting claimed work parked/, "the old unconditional count is gone");
});

test("AC-205-4: WHEN the test reads the three synced copies THEN coordinate and automation match in each", () => {
  const marks = { coordinate: "**Every open issue parked**", automation: "parked work doesn't count" };
  for (const [skill, mark] of Object.entries(marks)) {
    const [source, ...copies] = COPIES.map((dir) => read(`${dir}/${skill}/SKILL.md`));
    copies.forEach((copy, i) => assert.equal(copy, source, `${COPIES[i + 1]}/${skill}/SKILL.md matches .agents/skills`));
    assert.ok(source.includes(mark), `${skill} has the #205 text`);
  }
});
