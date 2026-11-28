// #712: check 5 of the consistency check accepts the row Full writes, `Wireframes: AI pick, not reviewed: <date>, <hash>`,
// beside `Wireframes approved: <date>, <hash>`, and nothing looser. The check is words an agent reads, so these tests
// pin the words: both row forms, the hash rule for both, Full only for the AI pick row, and everything check 5 asked
// for before. Loosening any of them fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = ".agents/skills/issues/references/consistency.md";
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const check5 = (md) => md.split("\n").find((l) => l.startsWith("5. ")) ?? "";
const HASH = "`git hash-object docs/wireframes/index.html`";
const APPROVED = "`Wireframes approved: <date>, <hash>`";
const AI_PICK = "`Wireframes: AI pick, not reviewed: <date>, <hash>`";

test("AC-712-1: WHEN check 5 is read THEN it names the approved row and, only on Full, the AI pick row, each with a date and hash", () => {
  const md = read(FILE);
  const line = check5(md);
  assert.ok(line, "check 5 exists");
  assert.ok(line.includes(APPROVED), "names the approved row form");
  assert.ok(line.includes(AI_PICK), "names the AI pick row form");
  assert.match(line, /only on Full \(the automation level in `docs\/stack\.md`\), `Wireframes: AI pick/, "the AI pick row counts only on Full");
  assert.match(md, /^- .*`docs\/stack\.md`.*`docs\/wireframes\/index\.html`;$/m, "docs/stack.md is on the Read list");
});

test("AC-712-1: WHEN check 5 is read THEN both rows need a hash that matches the prototype, and nothing else counts", () => {
  const line = check5(read(FILE));
  assert.ok(line.includes(`matches ${HASH}`), "the hash must match the prototype");
  assert.match(line, /Both forms need the same matching hash\./);
  assert.match(line, /Any other row doesn't count: a Wireframes row with another name or no hash, or an AI pick row below Full\./);
  // Every mention of an AI pick is the exact form: a looser `Wireframes: AI pick` row never appears.
  const picks = line.match(/AI pick[^`]*/g) ?? [];
  assert.ok(picks.length >= 1);
  for (const p of picks.filter((x) => x.startsWith("AI pick,"))) assert.match(p, /^AI pick, not reviewed: <date>, <hash>$/);
  assert.equal((line.match(/`Wireframes[^`]*`/g) ?? []).length, 2, "only the two row forms are written out");
});

test("AC-712-1: WHEN check 5 is read THEN it still asks for everything it asked for before", () => {
  const line = check5(read(FILE));
  for (const part of ["**Every MVP screen has an approved stage-2 wireframe:**", "it's detailed in `design.md` \"Screens\" and in the prototype",
    "(a grey-box stage-1 layout doesn't count)", "the latest accepted row in `decisions.md`"]) assert.ok(line.includes(part), part);
});
