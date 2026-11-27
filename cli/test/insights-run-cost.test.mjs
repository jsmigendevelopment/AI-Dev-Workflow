// What each run cost (#380, part of #374): the job record's usage and send-back fields, and the skills that fill them.
// AC-380-1: WHEN a builder or reviewer run ends THEN its record has the model, effort, usage before and after (or
// unknown), the outcome and any send-back reason. The skill commands are copied out of the skill text and run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { parseLine, validate } from "../src/insights-record.mjs";
import { recordProblem } from "../../.agents/skills/coordinate/scripts/insights-land.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const WRITER = join(REPO, ".agents/skills/coordinate/scripts/insights.mjs");
const skill = (name) => readFileSync(join(REPO, ".agents/skills", name, "SKILL.md"), "utf8");
const REASONS = ["size", "review-must", "checks", "infra", "process"];
const COST = ["model", "effort", "usage_before", "usage_after", "usage_from", "outcome"];
const FAKE = {
  n: "40", issue: "12", pr: "40", sha: "c".repeat(40), model: "opus", effort: "low", tool: "codex",
  "usage-before": "41%", "usage-after": "44%", "usage-from": "status-line",
};

function repo() {
  const dir = tmp("insights-cost-");
  const r = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(join(dir, "README.md"), "x\n");
  return dir;
}

function run(dir, args) {
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [WRITER, ...args], { cwd: dir, encoding: "utf8", env });
}

/** The record a write or line run made. */
function recordOf(r) {
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.startsWith("<!--") ? parseLine(r.stdout) : JSON.parse(readFileSync(r.stdout.trim(), "utf8"));
}

const fill = (cmd) => cmd.replace(/<([^>]+)>/g, (_, p) => (p.includes("|") ? p.split("|")[0] : FAKE[p] ?? assert.fail(`no fake for <${p}>`)));

/** The backticked insights.mjs commands in a skill that `keep` picks, with <name> filled and <a|b> as its first choice. */
function commands(text, keep) {
  return [...text.matchAll(/`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs ([^`]+)`/g)].map((m) => m[1]).filter(keep).map(fill);
}

/** The command each skill gives for the end of a run. */
const lineJob = (c) => c.startsWith("line job ");
const ends = () => ({
  build: commands(skill("build"), (c) => c.startsWith("write job ") && !c.includes("outcome=started"))[0],
  "pr-review": commands(skill("pr-review"), lineJob)[0],
  qa: commands(skill("qa"), lineJob)[0],
  "pr-security": commands(skill("pr-security"), lineJob)[0],
});

test("AC-380-1: WHEN a job record has usage before and after, where it was read and a send-back reason THEN the writer keeps them and it validates", () => {
  const dir = repo();
  const args = ["job", "job=review-code", "pr=40", "outcome=fail", "model=opus", "effort=low",
    "usage_before=41%", "usage_after=44%", "usage_from=the status line", "send_back=review-must"];
  for (const cmd of ["write", "line"]) {
    const record = recordOf(run(dir, [cmd, ...args]));
    assert.deepEqual(validate(record), []);
    assert.equal(record.usage_before, "41%");
    assert.equal(record.usage_after, "44%");
    assert.equal(record.usage_from, "the status line");
    assert.equal(record.send_back, "review-must");
  }
  for (const reason of REASONS) {
    assert.equal(run(dir, ["line", "job", "outcome=fail", `send_back=${reason}`]).status, 0, reason);
  }
  const unknown = recordOf(run(dir, ["line", "job", "outcome=stopped", "usage_before=unknown", "usage_after=unknown",
    "usage_from=get_session shows no usage reading", "send_back=infra"]));
  assert.equal(unknown.usage_before, "unknown");
  assert.equal(unknown.usage_after, "unknown");
});

test("AC-380-1: WHEN send_back isn't one of the five reasons, or comes on a run that passed or finished THEN exit 2 names send_back", () => {
  const dir = repo();
  for (const [args, why] of [
    [["outcome=fail", "send_back=tired"], /\bsend_back: must be one of size, review-must, checks, infra, process/],
    [["outcome=pass", "send_back=size"], /\bsend_back: only on a run that/],
    [["outcome=finished", "send_back=infra"], /\bsend_back: only on a run that/],
  ]) {
    const r = run(dir, ["write", "job", ...args]);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, why);
  }
  assert.deepEqual(readdirSync(dir), [".git", "README.md"]);
});

test("AC-380-1: WHEN a usage reading is given without usage_from, where it was read or looked for THEN exit 2 names usage_from", () => {
  const dir = repo();
  for (const field of ["usage_before=41%", "usage_after=unknown"]) {
    const r = run(dir, ["line", "job", "outcome=finished", field]);
    assert.equal(r.status, 2, field);
    assert.match(r.stderr, /\busage_from:/);
  }
});

test("AC-380-1: WHEN a record from before #380 has none of the new fields THEN it still validates in the writer's exact bytes", () => {
  const old = `{\n  "v": 1,\n  "kind": "job",\n  "at": "2026-11-27T21:40:13.072Z",\n  "issue": 378,\n  "pr": 412,\n  "sha": "${"2".repeat(40)}",\n  "job": "build",\n  "tool": "claude-code",\n  "model": "claude-opus-5-5",\n  "effort": "high",\n  "outcome": "finished"\n}\n`;
  assert.equal(recordProblem("docs/insights/2026-11-27/2140-job-412-a1b2c3.json", Buffer.from(old)), null);
  // Every record already in this repo, written before and after #380.
  const root = join(REPO, "docs/insights");
  for (const day of readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    for (const name of readdirSync(join(root, day)).filter((n) => n.endsWith(".json"))) {
      assert.equal(recordProblem(`docs/insights/${day}/${name}`, readFileSync(join(root, day, name))), null, name);
    }
  }
});

test("AC-380-1: WHEN a builder or reviewer run ends THEN its skill's command records the model, effort, usage before and after, where it was read and the outcome", () => {
  for (const [name, cmd] of Object.entries(ends())) {
    assert.ok(cmd, `${name}: no end-of-run job command`);
    for (const field of COST) assert.match(cmd, new RegExp(`(^| )${field}=`), `${name}: ${cmd}`);
    const record = recordOf(run(repo(), cmd.split(" ")));
    assert.deepEqual(validate(record), [], `${name}: ${cmd}`);
    assert.deepEqual([record.usage_before, record.usage_after, record.usage_from], ["41%", "44%", "status-line"], name);
  }
  assert.match(skill("build"), /never estimate/i);
});

test("AC-380-1: WHEN a run sends work back THEN its skill names the reason, and that record validates", () => {
  const cases = [["build", "write", "stopped", ["infra", "process"]], ["pr-review", "line", "fail", ["review-must"]],
    ["qa", "line", "fail", ["checks", "infra"]], ["pr-security", "line", "fail", ["review-must"]]];
  const end = ends();
  for (const [name, cmd, outcome, reasons] of cases) {
    const text = skill(name);
    for (const reason of reasons) {
      assert.match(text, new RegExp(`\`send_back=${reason}\``), `${name}: send_back=${reason}`);
      const args = end[name].replace(/outcome=\S+/, `outcome=${outcome}`).split(" ");
      assert.equal(args[0], cmd);
      const record = recordOf(run(repo(), [...args, `send_back=${reason}`]));
      assert.equal(record.send_back, reason, name);
    }
  }
  const size = commands(skill("coordinate"), (c) => c.includes("send_back=size"))[0];
  assert.ok(size, "coordinate's size send-back writes a record");
  const record = recordOf(run(repo(), size.split(" ")));
  assert.deepEqual([record.kind, record.outcome, record.send_back, record.sha], ["job", "fail", "size", FAKE.sha]);
});
