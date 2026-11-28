// The insights record format and its writer (#329): AC-329-1 to AC-329-8.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { fileName, parseLine, validate } from "../src/insights-record.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const WRITER = join(REPO, ".agents/skills/coordinate/scripts/insights.mjs");
const SHA = "a".repeat(40);
const NOW = "2026-11-27T14:32:00Z";
const DAY = join("docs", "insights", "2026-11-27");

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function repo() {
  const dir = tmp("insights-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "x\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "init");
  return dir;
}

function run(cwd, ...args) {
  const env = safeEnv({ ONRAILS_NOW: NOW });
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [WRITER, ...args], { cwd, encoding: "utf8", env });
}

const files = (dir) => (existsSync(join(dir, DAY)) ? readdirSync(join(dir, DAY)) : []);

test("AC-329-1: WHEN write job runs at 14:32 THEN one file 1432-job-12-<6 hex>.json exists and validates", () => {
  const dir = repo();
  const r = run(dir, "write", "job", "job=build", "issue=12", `sha=${SHA}`, "outcome=started");
  assert.equal(r.status, 0, r.stderr);
  const names = files(dir);
  assert.equal(names.length, 1);
  assert.match(names[0], /^1432-job-12-[0-9a-f]{6}\.json$/);
  assert.equal(r.stdout.trim(), join(dir, DAY, names[0]));
  const record = JSON.parse(readFileSync(join(dir, DAY, names[0]), "utf8"));
  assert.deepEqual(validate(record), []);
  assert.equal(record.at, "2026-11-27T14:32:00.000Z");
  assert.equal(record.issue, 12);
});

test("AC-329-2: WHEN the kind is unknown, a required field is missing or sha isn't 40 hex THEN exit 2, the field named, nothing written", () => {
  const dir = repo();
  for (const [args, field] of [
    [["write", "nope", "issue=1"], "kind"],
    [["write", "job", "issue=1"], "outcome"],
    [["write", "job", "issue=1", "outcome=started", "sha=abc123"], "sha"],
    [["write", "review", "pr=4", "round=1", "verdict=pass", "must=0"], "nice"],
  ]) {
    const r = run(dir, ...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, new RegExp(`\\b${field}:`));
  }
  assert.deepEqual(files(dir), []);
});

test("AC-329-3: WHEN model or effort isn't passed THEN the record says unknown", () => {
  const dir = repo();
  assert.equal(run(dir, "write", "fix-round", "pr=4", "round=2", "fixed=1", "model=opus").status, 0);
  const record = JSON.parse(readFileSync(join(dir, DAY, files(dir)[0]), "utf8"));
  assert.equal(record.model, "opus");
  assert.equal(record.effort, "unknown");
  const line = parseLine(run(dir, "line", "fix-round", "pr=4", "round=2", "fixed=1").stdout);
  assert.equal(line.model, "unknown");
  assert.equal(line.effort, "unknown");
});

test("AC-329-4: WHEN two branches each write three same-kind same-number records THEN both merge into main cleanly with all six", () => {
  const dir = repo();
  for (const branch of ["a", "b"]) {
    git(dir, "checkout", "-q", "-b", branch, "main");
    for (let i = 0; i < 3; i++) assert.equal(run(dir, "write", "job", "issue=7", "outcome=started").status, 0);
    git(dir, "add", ".");
    git(dir, "commit", "-qm", branch);
  }
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--no-edit", "a");
  git(dir, "merge", "-q", "--no-edit", "b");
  assert.equal(files(dir).length, 6);
});

test("AC-329-5: WHEN line review runs THEN it prints one comment line and parseLine returns that record", () => {
  const r = run(repo(), "line", "review", "pr=40", "round=1", "verdict=pass", "must=0", "nice=2");
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.trim();
  assert.equal(out.split("\n").length, 1);
  assert.match(out, /^<!-- onrails-insights \{.*\} -->$/);
  const record = parseLine(`**Verdict: pass**\n\nLooks good.\n\n${out}\n`);
  assert.deepEqual(record, JSON.parse(out.slice("<!-- onrails-insights ".length, -" -->".length)));
  assert.equal(record.pr, 40);
  assert.equal(record.nice, 2);
  assert.equal(parseLine("no record here"), null);
});

test("AC-329-6: the copies next to the writer and in cli/src match the master", () => {
  const master = readFileSync(join(REPO, "scripts/insights-record.mjs"), "utf8");
  for (const copy of [".agents/skills/coordinate/scripts/insights-record.mjs", "cli/src/insights-record.mjs"]) {
    assert.equal(readFileSync(join(REPO, copy), "utf8"), master, copy);
  }
  const r = spawnSync(process.execPath, [join(REPO, "scripts/sync-skills.mjs"), "--check"], { cwd: REPO, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("AC-329-7: settings.json and the codex rules allow only the writer's write and line", () => {
  const allow = JSON.parse(readFileSync(join(REPO, ".claude/settings.json"), "utf8")).permissions.allow;
  const mine = allow.filter((rule) => rule.includes("insights.mjs"));
  assert.deepEqual(mine.sort(), [
    "Bash(node .agents/skills/coordinate/scripts/insights.mjs line:*)",
    "Bash(node .agents/skills/coordinate/scripts/insights.mjs write:*)",
  ]);
  const rules = readFileSync(join(REPO, ".codex/rules/git-safety.rules"), "utf8");
  const patterns = rules.split("\n").filter((l) => l.includes("insights.mjs") && l.trim().startsWith("pattern"));
  assert.deepEqual(patterns.map((l) => l.trim()), ['pattern = ["node", ".agents/skills/coordinate/scripts/insights.mjs", ["write", "line"]],']);
});

test("AC-329-8: outcome done and a non-board went-wrong note with no links exit 2; a board review with no round is written", () => {
  const dir = repo();
  const done = run(dir, "write", "job", "issue=1", "outcome=done");
  assert.equal(done.status, 2);
  assert.match(done.stderr, /outcome:/);
  const note = run(dir, "write", "note", "issue=1", "kind_of=went-wrong", "belongs=kit", "text=slow");
  assert.equal(note.status, 2);
  assert.match(note.stderr, /links:/);
  assert.deepEqual(files(dir), []);
  assert.equal(run(dir, "write", "review", "pr=9", "source=board").status, 0);
  assert.equal(files(dir).length, 1);
});

test("fileName uses the PR, else the issue, else 0, and text over 200 characters is refused", () => {
  // NOW as the writer writes it: since #411, at must be exactly what toISOString gives.
  const base = { v: 1, kind: "touch", at: "2026-11-27T14:32:00.000Z", issue: 3, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown", what: "yes", minutes: 1 };
  assert.equal(fileName(base, "abcdef"), "1432-touch-3-abcdef.json");
  assert.equal(fileName({ ...base, pr: 8 }, "abcdef"), "1432-touch-8-abcdef.json");
  assert.equal(fileName({ ...base, issue: null }, "abcdef"), "1432-touch-0-abcdef.json");
  assert.deepEqual(validate(base), []);
  assert.match(validate({ ...base, kind: "rollback", what: undefined, minutes: undefined, why: "x".repeat(201), place: "test" }).join(), /why:/);
});
