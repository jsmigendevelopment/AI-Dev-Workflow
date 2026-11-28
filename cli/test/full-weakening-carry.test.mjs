// #491: full.md's weakening-review steps say what `agent-files.mjs gate` does since #478. A writer's pass carries across
// clean merges of main (at most 20, each one proved), and any other new commit needs a new pass. The reading must
// stay as narrow as the gate, so the test pins the limits too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FULL = fileURLToPath(new URL("../../.agents/skills/automation/references/full.md", import.meta.url));

test("AC-491-1: WHEN full.md's weakening-review steps are read THEN a clean merge of main carries the pass and any other new commit needs a new pass", () => {
  const steps = readFileSync(FULL, "utf8").split("## The weakening review")[1].split("\n**Accepted risk")[0];
  const step = steps.split("\n").find((line) => line.startsWith("4. ")) ?? "";
  assert.doesNotMatch(steps, /A new commit needs a new pass\./, "the blanket line is gone");
  assert.match(step, /A new commit of the branch's own needs a new pass/);
  assert.match(step, /chain of clean merges of `origin\/main`/);
  assert.match(step, /with a writer's pass.*the guard carries that pass to the head/);
  assert.match(step, /at most 20/);
  assert.match(step, /first parent is the commit the pass is on/);
  assert.match(step, /second parent is on `origin\/main`/);
  assert.match(step, /conflict fix/);
  assert.match(step, /Any other new commit needs a new pass/);
  assert.match(step, /A writer's fail at any commit of the chain refuses/);
});
