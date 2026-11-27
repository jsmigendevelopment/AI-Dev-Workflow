// The Go API platform dossier (#340): the research checker counts it, and its decision file links it as an AI pick.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkResearch } from "../../scripts/check-research.mjs";

const at = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

test("AC-340-4: WHEN the research checker runs on research/ THEN it passes with the Go API platform dossier counted", () => {
  const result = checkResearch(at("research"));
  assert.deepEqual(result.errors, []);
  assert.ok(existsSync(at("research/go-api-platform.md")), "research/go-api-platform.md exists");
  assert.ok(existsSync(at("research/go-api-platform/fact-check.csv")), "the fact-check file exists");
  assert.match(readFileSync(at("research/README.md"), "utf8"), /^\| \[[^\]]+\]\(go-api-platform\.md\) \|/m);
});

test("AC-340-5: WHEN decision 340-1 is read THEN it has every field, Originator AI pick, not reviewed, and links the dossier", () => {
  const text = readFileSync(at("docs/decisions/340-1.md"), "utf8");
  assert.match(text, /^# Decision 340-1\n/);
  for (const field of ["Date", "Decision", "Options considered", "Why", "Originator"]) {
    assert.match(text, new RegExp(`^- \\*\\*${field}:\\*\\* \\S`, "m"), `has ${field}`);
  }
  assert.match(text, /^- \*\*Originator:\*\* AI pick, not reviewed$/m);
  assert.match(text, /\]\(\.\.\/\.\.\/research\/go-api-platform\.md\)/);
});
