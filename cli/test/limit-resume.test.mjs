// #363: after a usage-limit reset the loop resumes its own stopped helpers before new work, and the note it wrote at the
// limit says where things stand. Text tests on coordinate's Rules, in the master and in each synced copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const COPIES = [".agents/skills", ".claude/skills", "plugin/cli/kit/files/core/.agents/skills"];
const sentences = (s) => s.split(/(?<=[.:?!])\s+(?=[A-Z`*])/);

/** The two rules about a usage limit, from coordinate's Rules section. */
function rules(base) {
  const text = read(`${base}/coordinate/SKILL.md`);
  const section = text.slice(text.indexOf("\n## Rules"), text.indexOf("\n## References"));
  const lines = section.split("\n");
  return {
    limit: lines.find((l) => l.startsWith("- **An account at its usage limit:**")),
    reset: lines.find((l) => l.startsWith("- **After a usage-limit reset:**")),
  };
}

for (const base of COPIES) {
  test(`AC-363-3: WHEN coordinate's rules are read in ${base} THEN after a reset the loop lists its child sessions and resumes each failed one before new work (AC-363-1)`, () => {
    const { reset } = rules(base);
    assert.ok(reset, "the after-the-reset rule");
    assert.match(reset, /list this session's child sessions/);
    assert.match(reset, /whose last turn failed/);
    assert.match(reset, /send it a message to carry on its brief/);
    assert.match(reset, /start a fresh one if it can't resume/);
    assert.match(reset, /before (?:you )?pick(?:ing)? (?:any )?new work/);
    assert.doesNotMatch(reset, /another account/, "never a way to move work to another account");
  });

  test(`AC-363-3: WHEN coordinate's rules are read in ${base} THEN stopping at a limit writes a one-line resume note with what is in flight (AC-363-2)`, () => {
    const { limit } = rules(base);
    assert.ok(limit, "the usage-limit rule");
    const note = sentences(limit).find((s) => /resume note/.test(s));
    assert.ok(note, "a sentence writes the resume note");
    assert.match(note, /one-line resume note/);
    assert.match(note, /`docs\/state\.md`/);
    assert.match(note, /live thread/);
    assert.match(note, /what is in flight/);
    assert.match(note, /restart message/);
  });
}
