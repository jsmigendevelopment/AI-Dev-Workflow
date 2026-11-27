// The job and review records build and the reviewers write (#330): AC-330-1 to AC-330-4.
// AC-330-4 copies the commands out of the skill text and runs them, so a typo in a skill fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { parseLine, validate } from "../src/insights-record.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const WRITER = ".agents/skills/coordinate/scripts/insights.mjs";
const skill = (name) => readFileSync(join(REPO, ".agents/skills", name, "SKILL.md"), "utf8");
const FAKE = {
  n: "12", pr: "40", sha: "b".repeat(40), model: "opus", effort: "low", tool: "claude-code",
  round: "1", must: "0", nice: "2", categories: "tests,bugs",
};

/** Every backticked insights.mjs command in a skill. */
function commands(text) {
  return [...text.matchAll(new RegExp("`node \\.agents/skills/coordinate/scripts/insights\\.mjs ([^`]+)`", "g"))].map((m) => m[1]);
}

/** Fills <name> with a fake value and <a|b> with its first choice. */
function fill(cmd) {
  return cmd.replace(/<([^>]+)>/g, (_, p) => (p.includes("|") ? p.split("|")[0] : FAKE[p] ?? assert.fail(`no fake for <${p}>`)));
}

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
}

function repo() {
  const dir = tmp("insights-jobs-");
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "x\n");
  return dir;
}

function run(dir, cmd) {
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [join(REPO, WRITER), ...fill(cmd).split(" ")], { cwd: dir, encoding: "utf8", env });
}

const has = (cmd, ...fields) => fields.every((f) => new RegExp(`(^| )${f}=`).test(cmd));

test("AC-330-1: WHEN build/SKILL.md is read THEN its start and finish steps name insights.mjs write job with issue, outcome, model, effort and tool, and say unknown", () => {
  const text = skill("build");
  const jobs = commands(text).filter((c) => c.startsWith("write job "));
  const start = jobs.find((c) => c.includes("outcome=started"));
  const finish = jobs.find((c) => c.includes("outcome=<finished|handed-off|stopped>"));
  assert.ok(start && finish, "start and finish commands");
  for (const c of [start, finish]) assert.ok(has(c, "issue", "outcome", "model", "effort", "tool"), c);
  assert.ok(has(finish, "pr", "sha"), finish);
  assert.match(text, /else `unknown`/);
});

test("AC-330-2: WHEN pr-review/SKILL.md is read THEN its verdict step names line job and line review with round, verdict, must, nice and the sha", () => {
  const cmds = commands(skill("pr-review"));
  const job = cmds.find((c) => c.startsWith("line job "));
  const review = cmds.find((c) => c.startsWith("line review "));
  assert.ok(job && has(job, "job", "sha", "outcome"), String(job));
  assert.ok(review && has(review, "round", "verdict", "must", "nice", "sha"), String(review));
});

test("AC-330-3: WHEN qa/SKILL.md and pr-security/SKILL.md are read THEN each verdict step names line job with the sha", () => {
  for (const [name, job] of [["qa", "qa"], ["pr-security", "review-security"]]) {
    const c = commands(skill(name)).find((x) => x.startsWith("line job "));
    assert.ok(c && has(c, "sha", "outcome") && c.includes(`job=${job}`), `${name}: ${c}`);
  }
});

test("AC-330-4: WHEN the commands the skills print are run in a temp repo THEN each exits 0 and its record validates", () => {
  const all = ["build", "pr-review", "qa", "pr-security"].flatMap((s) => commands(skill(s)).map((c) => [s, c]));
  assert.equal(all.length, 6);
  for (const [name, cmd] of all) {
    const dir = repo();
    const r = run(dir, cmd);
    assert.equal(r.status, 0, `${name}: ${cmd}\n${r.stderr}`);
    if (cmd.startsWith("write ")) {
      const record = JSON.parse(readFileSync(r.stdout.trim(), "utf8"));
      assert.deepEqual(validate(record), [], `${name}: ${cmd}`);
      assert.notEqual(record.model, "unknown");
    } else {
      assert.ok(parseLine(r.stdout), `${name}: ${cmd}\n${r.stdout}`);
    }
  }
});
