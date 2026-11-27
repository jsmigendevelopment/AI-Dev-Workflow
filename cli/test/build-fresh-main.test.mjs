import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const build = read(".agents/skills/build/SKILL.md");
const review = read(".agents/skills/pr-review/SKILL.md");

test("AC-361-1: build branches from a fresh origin/main and merges main before the push", () => {
  assert.match(build, /Run `git fetch origin main` and branch from `origin\/main`/);
  assert.match(build, /Before you push, `git fetch origin main` again and merge main into your branch\./);
});

test("AC-361-2: build reads every comment and builds or splits the scope a comment adds", () => {
  assert.match(build, /Read the issue in full, and every comment on it/);
  assert.match(build, /Build that scope, or move it to a new issue with a link and say so in the pull request\./);
});

test("AC-361-3: pr-review diffs the head against current main and flags what it removes", () => {
  assert.match(review, /diff the head against current main as well as the merge base/);
  assert.match(review, /Flag anything main has that the head removes/);
});
