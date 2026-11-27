// #165: decision ids that parallel pull requests can't clash on. The rows already in the table in
// docs/decisions.md stay with their numbers, above an end marker. Every later decision is its own file, docs/decisions/<issue>-<n>.md, so two
// branches that each record one add different files and merge with plain `git merge`, and every cite resolves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const TABLE = "docs/decisions.md";
const DIR = "docs/decisions";
// The table is frozen at LAST_TABLE_ROW: a new row would bring back the clash. Its ids must be exactly 1 to
// LAST_TABLE_ROW, so a row appended anywhere fails, and the failure says where the decision goes instead (decision 165-1).
// LAST_TABLE_ROW is main's last row when #165 merged. Never raise it to let a new row in.
const END = "<!-- decisions-table-end -->";
const LAST_TABLE_ROW = 118;
const MOVE = "No new table rows after #165: record it as `docs/decisions/<issue>-<n>.md` and cite it as `decision <issue>-<n>`.";
const FILE_ID = /^\d+-\d+$/;
const ROW = /^\| (\S+) \| \d{4}-\d\d-\d\d \|/gm;

const read = (path) => readFileSync(join(REPO, path), "utf8");
const idsIn = (text) => [...text.matchAll(ROW)].map((m) => m[1]);
const tableIds = () => idsIn(read(TABLE));
const fileIds = () => (existsSync(join(REPO, DIR)) ? readdirSync(join(REPO, DIR)) : []).map((f) => f.replace(/\.md$/, ""));

// "decision 43", "decision row 43", "Decision rows 77 and 78", "docs/decisions.md row 69", "decision 165-1".
const ID = String.raw`\d+(?:-\d+)?`;
const CITE = new RegExp(String.raw`\bdecisions?(?:\.md)?(?: rows?)? (${ID}(?:(?:, | and | or | to )${ID})*)\b`, "gi");
/** Every decision id cited in this text. */
export const citedIds = (text) => [...text.matchAll(CITE)].flatMap((m) => m[1].split(/, | and | or | to /));

// The kit's own text. Skipped: the idea templates and the eval fixtures and transcripts, whose "decision 12" is a
// made-up app's row, research notes, and the generated or synced copies of these files.
const ROOTS = [".agents/skills", "scripts", "cli/src", "cli/test", "docs", "CHANGELOG.md", "AGENTS.md", "CONTRIBUTING.md", "evals/README.md"];
const SKIP = /^(?:\.agents\/skills\/idea\/templates\/|docs\/decisions\.md$)/;
function* kitFiles(path) {
  const full = join(REPO, path);
  if (statSync(full).isFile()) {
    if (/\.(?:md|mjs|js|toml)$/.test(path) && !SKIP.test(path)) yield path;
    return;
  }
  for (const name of readdirSync(full)) if (name !== "node_modules") yield* kitFiles(relative(REPO, join(full, name)));
}

test("AC-165-1: two branches that each record a decision both merge with no change to docs/decisions.md", () => {
  const header = read(TABLE).split("\n| ")[0];
  assert.match(header, /`docs\/decisions\/<issue>-<n>\.md`/, "docs/decisions.md says where a new decision goes");
  const dir = tmp("decision-ids-");
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8", env: safeEnv() });
  git("init", "-q", "-b", "main");
  cpSync(join(REPO, "docs"), join(dir, "docs"), { recursive: true });
  git("add", ".");
  git("commit", "-q", "-m", "main");
  const before = readFileSync(join(dir, TABLE), "utf8");
  for (const issue of [170, 171]) {
    git("checkout", "-q", "-b", `feat/${issue}`, "main");
    writeFileSync(join(dir, DIR, `${issue}-1.md`), `# Decision ${issue}-1\n\n- **Date:** 2026-11-27\n`);
    git("add", ".");
    git("commit", "-q", "-m", `#${issue}`);
  }
  git("checkout", "-q", "main");
  for (const issue of [170, 171]) {
    const merge = git("merge", "--no-edit", "-q", `feat/${issue}`);
    assert.equal(merge.status, 0, `feat/${issue} merges cleanly: ${merge.stdout}${merge.stderr}`);
  }
  assert.equal(readFileSync(join(dir, TABLE), "utf8"), before, "docs/decisions.md is untouched");
  assert.ok(existsSync(join(dir, DIR, "170-1.md")) && existsSync(join(dir, DIR, "171-1.md")));
});

/** What is wrong with this decisions table, as messages; empty when it is frozen as it should be. */
function tableProblems(text) {
  const problems = [];
  if (text.trimEnd().split("\n").at(-1) !== END) problems.push(`${TABLE} must end with ${END}.`);
  const below = idsIn(text.slice(text.lastIndexOf(`\n${END}`) + 1));
  if (below.length) problems.push(`Row ${below.join(", ")} is below ${END}. ${MOVE}`);
  const ids = idsIn(text);
  const want = Array.from({ length: LAST_TABLE_ROW }, (_, i) => String(i + 1));
  if (ids.join() !== want.join()) {
    const missing = want.filter((id) => !ids.includes(id));
    if (missing.length) problems.push(`Rows ${missing.join(", ")} are missing: never delete or renumber a row.`);
    const extra = ids.filter((id, i) => i >= LAST_TABLE_ROW || id !== want[i]);
    if (extra.length) problems.push(`The table's ids must be exactly 1 to ${LAST_TABLE_ROW}, in order. Not allowed: ${extra.join(", ")}. ${MOVE}`);
  }
  return problems;
}

test("AC-165-1: the table is frozen and every id is unique", () => {
  assert.deepEqual(tableProblems(read(TABLE)), []);
  for (const id of fileIds()) {
    assert.match(id, FILE_ID, `${DIR}/${id}.md is named <issue>-<n>.md`);
    assert.match(read(`${DIR}/${id}.md`), new RegExp(`^# Decision ${id}\\n`), `${id}.md starts with "# Decision ${id}"`);
  }
});

test("AC-165-1: a row appended to the table fails and says to write a file instead", () => {
  const text = read(TABLE);
  const last = `| ${LAST_TABLE_ROW} | `;
  const lineEnd = text.indexOf("\n", text.indexOf(last));
  const row = `\n| ${LAST_TABLE_ROW + 1} | 2026-11-28 | A new decision. | a; b | Why. | AI pick, not reviewed |`;
  // Right after the last row, where an agent that "adds a row at the end" puts it.
  const appended = text.slice(0, lineEnd) + row + text.slice(lineEnd);
  assert.ok(appended.includes(`${row}\n\n${END}`), "the new row sits right after the last one, above the marker");
  assert.deepEqual(tableProblems(appended), [`The table's ids must be exactly 1 to ${LAST_TABLE_ROW}, in order. Not allowed: ${LAST_TABLE_ROW + 1}. ${MOVE}`]);
  // Below the marker, and a row that reuses a number, fail too.
  assert.match(tableProblems(`${text}${row.slice(1)}\n`).join(" "), /is below <!-- decisions-table-end -->\. No new table rows after #165: record it as `docs\/decisions\/<issue>-<n>\.md`/);
  assert.match(tableProblems(text.slice(0, lineEnd) + row.replace(`| ${LAST_TABLE_ROW + 1} |`, "| 5 |") + text.slice(lineEnd)).join(" "), /Not allowed: 5\. No new table rows/);
});

test("AC-165-2: every decision a skill, test, script or the changelog cites exists", () => {
  const known = new Set([...tableIds(), ...fileIds()]);
  const missing = [];
  for (const root of ROOTS) for (const path of kitFiles(root)) for (const id of citedIds(read(path))) if (!known.has(id)) missing.push(`${path}: decision ${id}`);
  assert.deepEqual(missing, []);
});

test("AC-165-2: the scan finds each form of cite", () => {
  const text = "decision 43; decision row 12; Decision rows 77 and 78; docs/decisions.md row 69; Covered by decision 165-1.";
  assert.deepEqual(citedIds(text), ["43", "12", "77", "78", "69", "165-1"]);
  assert.deepEqual(citedIds("Covered by decision <n>"), []);
});
