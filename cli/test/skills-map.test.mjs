// #711: docs/skills-map.md labels every skill in .agents/skills/ `core`, `app-only` or `mixed` (step 1 of #86, the
// core and apps split). This test keeps the table in step with the folders. Nothing moves because of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const MAP = "docs/skills-map.md";
const LABELS = ["core", "app-only", "mixed"];
const ROW = /^\| `([^`]+)` \| `([^`]+)` \| (.*) \|$/;
const HEADER = /^\| Skill \| Label \| Reason \|$/;
const DIVIDER = /^\|[-| ]+\|$/;

const read = (path) => readFileSync(join(REPO, path), "utf8");
const skillFolders = () => readdirSync(join(REPO, ".agents/skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

/** The table rows of the map as { skill, label, reason, line }, plus a problem for every table line that isn't a row. */
function rowsOf(text) {
  const rows = [];
  const problems = [];
  for (const line of text.split("\n").filter((l) => l.startsWith("|"))) {
    if (HEADER.test(line) || DIVIDER.test(line)) continue;
    const m = ROW.exec(line);
    if (m) rows.push({ skill: m[1], label: m[2], reason: m[3].trim() });
    else problems.push(`A table line is not \`| \`skill\` | \`label\` | reason |\`: ${line.slice(0, 80)}`);
  }
  return { rows, problems };
}

/** What is wrong with this map for these skill folders, as messages; empty when the map is in step. */
export function mapProblems(folders, text) {
  const { rows, problems } = rowsOf(text);
  const seen = new Map();
  for (const { skill, label, reason } of rows) {
    seen.set(skill, (seen.get(skill) ?? 0) + 1);
    if (!folders.includes(skill)) problems.push(`${MAP} has a row for ${skill}, which is not a folder in .agents/skills/.`);
    if (!LABELS.includes(label)) problems.push(`${skill}: the label is \`${label}\`, and must be exactly core, app-only or mixed.`);
    if (!reason) problems.push(`${skill}: the reason is empty.`);
    else if (label === "mixed" && !/moves to apps:\s*\S/i.test(reason)) problems.push(`${skill}: a mixed skill's reason must say "Moves to apps:" and name the part.`);
  }
  for (const folder of folders) if (!seen.has(folder)) problems.push(`.agents/skills/${folder} has no row in ${MAP}.`);
  for (const [skill, count] of seen) if (count > 1) problems.push(`${skill} has ${count} rows in ${MAP}, and must have one.`);
  return problems;
}

const GOOD = "| Skill | Label | Reason |\n|---|---|---|\n| `a` | `core` | The method. |\n| `b` | `app-only` | Builds the app. |\n| `c` | `mixed` | Method. Moves to apps: the stack step. |";

test("AC-711-1: WHEN the map is read against .agents/skills/ THEN every skill has exactly one row and every row names a skill", () => {
  assert.ok(existsSync(join(REPO, MAP)), `${MAP} exists`);
  assert.ok(skillFolders().length > 0, "found skill folders");
  assert.deepEqual(mapProblems(skillFolders(), read(MAP)), []);
});

test("AC-711-1: WHEN a skill folder has no row, a row names no skill, or a skill has two rows THEN the check fails and names it", () => {
  assert.deepEqual(mapProblems(["a", "b", "c"], GOOD), [], "the good map passes");
  const none = mapProblems(["a", "b", "c", "d"], GOOD);
  assert.deepEqual(none, [`.agents/skills/d has no row in ${MAP}.`]);
  const ghost = mapProblems(["a", "b"], GOOD);
  assert.deepEqual(ghost, [`${MAP} has a row for c, which is not a folder in .agents/skills/.`]);
  const twice = mapProblems(["a", "b", "c"], `${GOOD}\n| \`a\` | \`core\` | Again. |`);
  assert.deepEqual(twice, [`a has 2 rows in ${MAP}, and must have one.`]);
});

test("AC-711-2: WHEN a row is read THEN its label is exactly core, app-only or mixed, its reason is not empty, and a mixed reason names what moves", () => {
  const swap = (from, to) => GOOD.replace(from, to);
  assert.match(mapProblems(["a", "b", "c"], swap("| `a` | `core` |", "| `a` | `Core` |")).join("\n"), /a: the label is `Core`/);
  assert.match(mapProblems(["a", "b", "c"], swap("| `a` | `core` |", "| `a` | `app` |")).join("\n"), /a: the label is `app`/);
  assert.match(mapProblems(["a", "b", "c"], swap("The method.", " ")).join("\n"), /a: the reason is empty/);
  assert.match(mapProblems(["a", "b", "c"], swap("Moves to apps: the stack step.", "Method and app steps.")).join("\n"), /c: a mixed skill's reason must say "Moves to apps:"/);
  assert.match(mapProblems(["a", "b", "c"], swap("Moves to apps: the stack step.", "Moves to apps:")).join("\n"), /c: a mixed skill's reason/);
  assert.match(mapProblems(["a", "b", "c"], `${GOOD}\n| a | core |`).join("\n"), /A table line is not/);
});

test("AC-711-2: WHEN the real map is read THEN it uses all three labels", () => {
  const labels = new Set(rowsOf(read(MAP)).rows.map((r) => r.label));
  assert.deepEqual([...labels].sort(), [...LABELS].sort());
});

test("AC-711-4: WHEN the decision for the map is read THEN it is an AI pick, not reviewed, and says no file moves until a later issue", () => {
  // The table in docs/decisions.md is frozen at row 118 (decision 165-1), so the decision is its own file.
  const text = read("docs/decisions/711-1.md");
  assert.match(text, /^# Decision 711-1\n/);
  assert.match(text, /\*\*Originator:\*\* AI pick, not reviewed/);
  assert.match(text, /No file moves/);
  assert.match(text, /later issue/);
  assert.match(text, /docs\/skills-map\.md/);
});
