// #402: writing the issues is the CTO role's job (#379). `issues` and `pyramid` point to `routing`'s CTO role
// instead of naming a tier, so a profile override (`cto = ...`) applies, and one yes covers every CTO job.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const SKILLS = [".agents/skills/issues/SKILL.md", ".agents/skills/pyramid/SKILL.md"];
const description = (text) => (/^description: (.*)$/m.exec(text) ?? [])[1] ?? "";

test("AC-402-1: WHEN issues and pyramid are read THEN neither puts writing the issues on the everyday or a cheaper model", () => {
  for (const file of SKILLS) {
    const text = read(file);
    assert.doesNotMatch(text, /\b(everyday|cheaper|fast|strongest) (model|tier)\b/i, `${file}: names a tier`);
    assert.doesNotMatch(text, /\b(Fable|Opus|Sonnet)\b/, `${file}: names a model`);
  }
});

test("AC-402-1: WHEN issues and pyramid are read THEN both point to routing's CTO role, so the profile wins", () => {
  for (const file of SKILLS) {
    const text = read(file);
    assert.match(text, /`routing`'s CTO role/, `${file}: points to the CTO role`);
    assert.match(text, /node \.agents\/skills\/routing\/scripts\/roles\.mjs cto/, `${file}: reads the role's model and effort`);
  }
  const issues = read(SKILLS[0]);
  assert.match(description(issues), /CTO role/, "issues: the description says who writes them");
  const pyramid = read(SKILLS[1]);
  assert.match(pyramid, /It doesn't write issues; `issues` does that next[^.]*CTO role/, "pyramid: issues are the CTO role's too");
});

test("AC-402-1: WHEN issues and pyramid are read THEN one yes to the strongest-tier question covers every CTO job", () => {
  const [issues, pyramid] = SKILLS.map(read);
  assert.match(pyramid, /Below Full, ask first, once per session, unless the profile says not to/, "pyramid keeps the ask");
  assert.match(issues, /`ask_before_strongest = false`/, "issues names the profile key");
  for (const text of [issues, pyramid]) assert.match(text, /yes covers every CTO job in the session/);
});
