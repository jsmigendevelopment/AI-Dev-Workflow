// #394: the docs people and agents read for a pull request's size say what pr-size.mjs does (#377).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const DOCS = [
  ".agents/skills/pr-review/SKILL.md",
  ".claude/skills/pr-review/SKILL.md",
  "guide/code-style.md",
  ".agents/skills/build/references/code-style.md",
  ".claude/skills/build/references/code-style.md",
  "README.md",
  "cli/README.md",
];

test("AC-394-1: WHEN an agent reads pr-review, the code-style guide or the README THEN none names large-pr or a 400-line rule, and each names the 1,000 limit and size-exception", () => {
  for (const path of DOCS) {
    const text = read(path);
    assert.doesNotMatch(text, /large-pr/, `${path} names the old label`);
    assert.doesNotMatch(text, /\b400 (?:changed )?lines|about 400\b/, `${path} names a 400-line rule`);
    assert.match(text, /under 1,000 changed lines/, `${path} names the 1,000 limit`);
    assert.match(text, /lockfiles, generated files and test fixtures/, `${path} names what isn't counted`);
    assert.match(text, /the `size-exception` label and a `Size exception: <reason>` line/, `${path} names the exception`);
  }
});

// #416: issues step 3 (the fallback for a plan with no steps table) splits where step 6 does,
// and the size docs name the command that gives the real count.
const step3 = (text) => text.match(/^3\. \*\*One issue per step:\*\*.*$/m)?.[0] ?? "";
const sizeLine = (text) => text.match(/^.*\*\*Size of the change:\*\*.*$/m)?.[0] ?? "";
const rule13 = (text) => text.match(/^### 13\. Small pull requests\n\n(.*)$/m)?.[1] ?? "";

test("AC-416-1: WHEN issues step 3 is read THEN it names the 1,000 split line and no 400-line split rule", () => {
  for (const path of [".agents/skills/issues/SKILL.md", ".claude/skills/issues/SKILL.md"]) {
    const step = step3(read(path));
    assert.ok(step, `${path} has no step 3`);
    assert.match(step, /split at 1,000 or more/, `${path} step 3 names the 1,000 split line`);
    assert.doesNotMatch(step, /split[^.?]*\b400\b/i, `${path} step 3 splits at 400`);
  }
});

test("AC-416-2: WHEN pr-review's size line or rule 13 is read THEN it names the pr-size.mjs command", () => {
  const command = "check with `node .agents/skills/coordinate/scripts/pr-size.mjs --base origin/main`";
  const lines = [
    [".agents/skills/pr-review/SKILL.md", sizeLine],
    [".claude/skills/pr-review/SKILL.md", sizeLine],
    ["guide/code-style.md", rule13],
    [".agents/skills/build/references/code-style.md", rule13],
    [".claude/skills/build/references/code-style.md", rule13],
  ];
  for (const [path, pick] of lines) {
    const line = pick(read(path));
    assert.ok(line, `${path} has no size line`);
    assert.ok(line.includes(command), `${path} names the pr-size command`);
  }
});
