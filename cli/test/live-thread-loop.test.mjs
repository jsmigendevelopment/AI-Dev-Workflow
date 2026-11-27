// #280: the thread the person talks to isn't the loop. It starts the loop as a background sub-agent or session and
// stays free. AC-1 is the opt-in eval live-thread-loop (evals/test/live-thread-loop.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
/** The text of the `## heading` section of a markdown file, up to the next `## `. */
const section = (text, heading) => {
  const found = text.split(/^## /m).find((s) => s.startsWith(heading));
  assert.ok(found, `found ## ${heading}`);
  return found;
};
/** The data rows of the first table in a section whose header starts with `| Job |`. */
const jobRows = (text) => text.split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*Job\s*\|/.test(l) && !/^\|-/.test(l));

test("AC-280-1: WHEN coordinate is called in the live thread THEN it starts the loop in the background and returns", () => {
  const where = section(read(".agents/skills/coordinate/SKILL.md"), "Where this runs");
  assert.match(where, /background sub-agent/);
  assert.match(where, /run_in_background/);
  assert.match(where, /Then end your turn/);
  assert.match(where, /Automation level:/, "the brief quotes the level (#143)");
});

test("AC-280-2: WHEN the person says pause in the live thread THEN the loop and its builders stop, and the live thread shows what's still running", () => {
  const pause = section(read(".agents/skills/ask/SKILL.md"), "Pause and stop");
  assert.match(pause, /cover the loop and every builder under it/);
  assert.match(pause, /the loop's own list/);
  const where = section(read(".agents/skills/coordinate/SKILL.md"), "Where this runs");
  assert.match(where, /\*\*Pause or stop\*\*[^\n]*every builder under it[^\n]*show what's still running/);
});

test("AC-280-3: WHEN the README's model routing table is read THEN it has separate rows for the live thread and the loop", () => {
  const rows = jobRows(section(read("README.md"), "🧠 Model routing"));
  const live = rows.filter((r) => /^\|\s*The live thread\b/i.test(r));
  const loop = rows.filter((r) => /^\|\s*The loop\b/i.test(r));
  assert.equal(live.length, 1, "one live-thread row");
  assert.equal(loop.length, 1, "one loop row");
  assert.match(live[0], /Everyday · low/);
  assert.match(loop[0], /Everyday · medium/);
  assert.ok(!rows.some((r) => /\(the loop\)/.test(r)), "no row calls the live thread the loop");
});

test("AC-280-3: WHEN routing and the cheat sheet are read THEN each splits the live thread from the loop coordinator", () => {
  const routing = jobRows(section(read(".agents/skills/routing/SKILL.md"), "Jobs"));
  assert.match(routing.find((r) => /live thread/i.test(r)) ?? "", /Everyday · \*\*low\*\*/);
  assert.match(routing.find((r) => /Loop coordinator/.test(r)) ?? "", /Everyday · \*\*medium\*\*/);
  const sheet = read("guide/cheat-sheet.md");
  assert.match(sheet, /\| 🗣️ Your live thread \(you talk to it\) \| Everyday · low \|/);
  assert.match(sheet, /\| 🔁 The loop \(a background sub-agent\) \| Everyday · medium \|/);
});
