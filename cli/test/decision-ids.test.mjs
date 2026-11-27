// #165: decision ids that parallel pull requests can't clash on. Rows 1 to 115 stay in the table in
// docs/decisions.md with their numbers. Every later decision is its own file, docs/decisions/<issue>-<n>.md, so two
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
// The table's last row. A row after it would bring back the clash, so the table is frozen.
const LAST_TABLE_ROW = 115;
const FILE_ID = /^(\d+|kickoff)-\d+$/;

const read = (path) => readFileSync(join(REPO, path), "utf8");
const tableIds = () => [...read(TABLE).matchAll(/^\| (\S+) \| \d{4}-\d\d-\d\d \|/gm)].map((m) => m[1]);
const fileIds = () => (existsSync(join(REPO, DIR)) ? readdirSync(join(REPO, DIR)) : []).map((f) => f.replace(/\.md$/, ""));

// "decision 43", "decision row 43", "Decision rows 77 and 78", "docs/decisions.md row 69", "decision 165-1".
const ID = String.raw`(?:\d+|kickoff)(?:-\d+)?`;
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

test("AC-165-1: the table is frozen and every id is unique", () => {
  const rows = tableIds();
  assert.deepEqual(rows, Array.from({ length: LAST_TABLE_ROW }, (_, i) => String(i + 1)), "rows 1 to 115, in order, none added");
  for (const id of fileIds()) {
    assert.match(id, FILE_ID, `${DIR}/${id}.md is named <issue>-<n>.md`);
    assert.match(read(`${DIR}/${id}.md`), new RegExp(`^# Decision ${id}\\n`), `${id}.md starts with "# Decision ${id}"`);
  }
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
