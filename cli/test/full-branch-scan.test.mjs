// #260: #254's scan ran over back, afk and coordinate only. These tests run it over every skill and every other file
// the loop reads. A step that asks, waits, offers or says "the person picks" has its own On Full branch, unless it is
// on the always-stop list and named in EXCEPTIONS with its reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCEPTIONS, NAMED, SCANNED, mdFiles, scan, unusedExceptions } from "./full-branch-scan.mjs";

const every = () => [...new Set([...SCANNED.flatMap(mdFiles), ...NAMED])];

test("AC-260-1: WHEN the scan reads every skill, AGENTS.md and the other files the loop reads THEN no step lacks an On Full branch, except the named exceptions", () => {
  assert.deepEqual(scan(every()), []);
  // Each named file is read by name, so a moved or renamed one throws here instead of dropping out of the scan.
  for (const f of NAMED) assert.doesNotThrow(() => scan([f]), f);
  // The skills are scanned as a whole folder, so a new skill is scanned the day it lands.
  assert.ok(every().includes(".agents/skills/stack-tanstack-start/SKILL.md"));
  assert.ok(every().includes(".agents/skills/secrets/providers/clerk.md"));
});

test("AC-260-1: WHEN a step is on the always-stop list THEN a named exception with its reason keeps it, and without the list the scan finds it", () => {
  for (const [file, words, reason] of EXCEPTIONS) {
    assert.ok(words.length > 20 && reason.length > 10, `${file}: "${words}" has words and a reason`);
    assert.ok(every().includes(file), `${file} is scanned`);
  }
  assert.ok(scan(every(), []).length >= EXCEPTIONS.length, "each exception hides at least one step");
});

test("AC-260-2: WHEN an exception names no step that still matches THEN the test fails", () => {
  assert.deepEqual(unusedExceptions(every()), []);
  const stale = [".agents/skills/back/SKILL.md", "a sentence no step of back holds", "made up for this test"];
  assert.deepEqual(unusedExceptions(every(), [...EXCEPTIONS, stale]), [stale]);
  // The words must sit in the exception's own file: the same words named for another file are stale.
  const [file, words, reason] = EXCEPTIONS[0];
  const other = [".agents/skills/back/SKILL.md", words, reason];
  assert.ok(file !== other[0]);
  assert.deepEqual(unusedExceptions(every(), [other]), [other]);
});
