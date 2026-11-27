// #147: README.md and the npm README name how many standing rules AGENTS.md has. They said 13 after #130 added the 14th.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("AC-147-6: README.md and cli/README.md give the number of standing rules AGENTS.md has", () => {
  const section = read("AGENTS.md").split("## Standing rules")[1].split("\n## ")[0];
  const rules = section.match(/^\d+\. /gm).length;
  assert.ok(rules >= 14);
  for (const readme of ["README.md", "cli/README.md"]) {
    assert.match(read(readme), new RegExp(`\\| ${rules} standing rules,`), `${readme} should say ${rules} standing rules`);
  }
});

test("AC-147-5: the hand-testing skill fails a 0 only when the prediction didn't expect it", () => {
  const skill = read(".agents/skills/test-by-hand-as-the-user/SKILL.md");
  assert.match(skill, /always a fail:\*\* a 0 the prediction didn't expect,/);
});
