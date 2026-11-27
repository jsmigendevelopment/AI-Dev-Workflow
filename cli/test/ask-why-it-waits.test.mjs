// #207: every ask names the rule that made the loop wait, and what lifts it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const skill = readFileSync(new URL(".agents/skills/ask/SKILL.md", root), "utf8");
const section = skill.split("## The message")[1].split("\n## ")[0];

test("AC-207-1: the template has a Why it waits: line between the title and the first question", () => {
  const template = section.split("```text")[1].split("```")[0];
  const lines = template.trim().split("\n");
  assert.match(lines[0], /^Needs you · /);
  const why = lines.findIndex((l) => l.startsWith("Why it waits:"));
  const firstQuestion = lines.findIndex((l) => /^1\. /.test(l));
  assert.equal(why, 1);
  assert.ok(why < firstQuestion);
});

test("AC-207-2: the section has the three forms", () => {
  assert.match(section, /Why it waits: the always-stop list in AGENTS\.md \(<the item>\)\. Only your own go-ahead lifts it, each time \(rule 16\)\./);
  assert.match(section, /Why it waits: <the switch in docs\/stack\.md, or the risk dial>\. To stop this kind of ask, say: "<one sentence>"\./);
  assert.match(section, /Why it waits: only you can pay or sign in\./);
});

test("AC-207-3: the line is required for 🛑 and ⏳, never for ℹ️", () => {
  assert.match(section, /`Why it waits:` is required for every 🛑 and ⏳, and never for an ℹ️/);
});

test("AC-207-5 guard: the always-stop form never says a decision row lifts it", () => {
  const form = section.split("\n").find((l) => l.includes("the always-stop list in AGENTS.md"));
  assert.doesNotMatch(form, /decision row/);
});
