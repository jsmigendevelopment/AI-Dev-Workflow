// The "tests" rule of the Size: line (#375, #400, #433): a later part that gives the tests a number is a second estimate.
// A name that starts with a number, or a count of files, is not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSizes } from "../../.agents/skills/issues/scripts/check-issue-size.mjs";

const check = (second) => checkSizes([{ number: 12, title: "Big step", body: `Size: about 700 lines · cli/src · ${second}\n` }]);
const asked = (second) => [`#12 Big step: a second estimate after the "·": "${second}". Write one total, like \`Size: about 600 lines · <files or modules>\`.`];

test("AC-433-1: WHEN tests name a feature that starts with a number, or count files, THEN the check passes it", () => {
  for (const second of ["tests - 2fa flow", "test files — 3d viewer", "test files: 2", "tests – 2 new files"]) {
    assert.deepEqual(check(second), [], second);
  }
});

test("AC-433-1: WHEN tests sit next to a number by another separator or a count THEN the result stays as it was", () => {
  for (const second of ["tests, 600", "tests; 600", "tests/600", "tests: about ~600", "tests add ~600", "test lines: 600"]) {
    assert.deepEqual(check(second), [], second);
  }
  for (const second of ["tests: 1k", "tests 0.6k", "tests: 600 lines", "tests - 600", "test files: 600", "tests – 600"]) {
    assert.deepEqual(check(second), asked(second), second);
  }
});
