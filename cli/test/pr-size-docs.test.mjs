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
