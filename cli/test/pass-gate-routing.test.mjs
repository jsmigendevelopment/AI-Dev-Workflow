// #453: the pass gate's audit and re-plan point to `routing`, not to a tier, so a profile override (`cto = ...`)
// applies to the re-plan and the Jobs table decides the audit. Also two nice-to-haves from the round 2 review
// of #452: the ban in cto-writes-issues.test.mjs must catch every shape of the Jobs table, and `idea` step 9
// must not wait on a yes that is never asked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const GATE = ".agents/skills/pyramid/references/pass-gate.md";
const step = (text, n) => (new RegExp(`^${n}\\. \\*\\*[\\s\\S]*?(?=^${n + 1}\\. |^\\*\\*On Full)`, "m").exec(text) ?? [""])[0];

// Any way of naming a tier, a model or an effort for a job. The gate leaves all of it to `routing`.
const TIER_WORDS = [/\b(strongest|everyday|cheaper|fast)\b/i, /\b(Fable|Opus|Sonnet|Haiku)\b/, /\b(low|medium|high|extra-high) effort\b/i,
  /\b(Strongest|Everyday|Fast) · /];

test("AC-453-1: WHEN pass-gate.md is read THEN it names no model tier, model or effort", () => {
  const text = read(GATE);
  for (const re of TIER_WORDS) assert.doesNotMatch(text, re, `pass-gate.md names a tier: ${re}`);
});

test("AC-453-1: WHEN the re-plan (step 4) is read THEN it points to routing's CTO role and its command, and keeps the ask", () => {
  const replan = step(read(GATE), 4);
  assert.match(replan, /^4\. \*\*Re-plan\.\*\*/, "found step 4");
  assert.match(replan, /`routing`'s CTO role/);
  assert.match(replan, /node \.agents\/skills\/routing\/scripts\/roles\.mjs cto/);
  assert.match(replan, /the profile wins/);
  assert.match(replan, /Below Full, ask first \(see `routing`\)/);
});

test("AC-453-1: WHEN the audit (step 1) is read THEN it points to the Pass-gate audit row of routing's Jobs table", () => {
  const audit = step(read(GATE), 1);
  assert.match(audit, /^1\. \*\*A fresh audit\.\*\*/, "found step 1");
  assert.match(audit, /"Pass-gate audit" row in `routing`'s Jobs table/);
  assert.match(audit, /Read `\.agents\/skills\/pyramid\/references\/pass-gate\.md` and audit pass <N>\./, "the auditor's prompt is kept");
});

test("AC-453-1: WHEN the audit row is looked up THEN routing's Jobs table has it, so the pointer is not dangling", () => {
  assert.match(read(".agents/skills/routing/SKILL.md"), /^\| Pass-gate audit \(read-only, fresh\) \| .+ \|$/m);
});

test("AC-453-3: WHEN idea step 9 is read THEN the plan does not wait on a yes when no ask is needed", () => {
  const idea = read(".agents/skills/idea/SKILL.md");
  const plan = (/^9\. \*\*Plan the build\.\*\*[\s\S]*?(?=^10\. )/m.exec(idea) ?? [""])[0];
  assert.match(plan, /After a yes, or when no ask is needed, plan on it/);
  assert.doesNotMatch(plan, /After a yes, plan on it/);
});
