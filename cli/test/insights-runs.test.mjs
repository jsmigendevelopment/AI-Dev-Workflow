// Which model did which job (#129), on the insights records of #329: the run line on pull requests and verdicts, the
// reason a model or effort is unknown, and `onrails runs`, which prints a pull request's chain or one day's runs.
// AC-129-6 (two branches' records never conflict) is AC-329-4 in insights-record.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { dayFolder, fileName, parseLine, validate } from "../src/insights-record.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPTS = join(REPO, ".agents/skills/coordinate/scripts");
const WRITER = join(SCRIPTS, "insights.mjs");
const RUNS = join(SCRIPTS, "insights-runs.mjs");
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const skill = (name) => readFileSync(join(REPO, ".agents/skills", name, "SKILL.md"), "utf8");
const SHA = "b".repeat(40);
// The run started 12 minutes before the writer's clock.
const STARTED = "2026-11-27T14:20:00Z";
const NOW = "2026-11-27T14:32:00Z";
const FAKE = {
  n: "12", pr: "40", sha: SHA, model: "opus", effort: "low", tool: "claude-code", started: STARTED,
  "usage-before": "unknown", "usage-after": "unknown", "usage-from": "get_session",
};

function repo() {
  const dir = tmp("insights-runs-");
  const r = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  return dir;
}

function node(cwd, script, args) {
  const env = safeEnv({ ONRAILS_NOW: NOW });
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env });
}

/** The backticked insights.mjs commands in a skill that start with `prefix`, with <name> filled and <a|b> as its first choice. */
function commands(text, prefix) {
  const fill = (cmd) => cmd.replace(/<([^>]+)>/g, (_, p) => (p.includes("|") ? p.split("|")[0] : FAKE[p] ?? assert.fail(`no fake for <${p}>`)));
  return [...text.matchAll(/`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs ([^`]+)`/g)].map((m) => m[1]).filter((c) => c.startsWith(prefix)).map(fill);
}

const lastLine = (out) => out.trimEnd().split("\n").at(-1);

test("AC-129-1: WHEN a builder opens a pull request THEN the body's last line, from its skill's command, is the run line: job, model ID, effort, duration", () => {
  const text = skill("build");
  const cmd = commands(text, "line job ").find((c) => c.includes("job=build"));
  assert.ok(cmd && /outcome=pr-opened/.test(cmd) && /started=/.test(cmd), `build: no line job for the pull request body: ${cmd}`);
  assert.match(text, /\*\*End the body\*\* with the output of/);
  const r = node(repo(), WRITER, cmd.split(" "));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lastLine(r.stdout), "Run: build · opus · low · 12 min · issue #12");
  assert.equal(parseLine(r.stdout).outcome, "pr-opened");
  assert.match(text, /`Agent-Model: <model>`/);
  assert.match(text, /`Agent-Effort: <effort>`/);
});

test("AC-129-2: WHEN a review, security review or QA verdict is posted THEN its job line ends with the model, effort, duration and the commit judged", () => {
  for (const [name, job] of [["pr-review", "review-code"], ["pr-security", "review-security"], ["qa", "qa"]]) {
    const cmd = commands(skill(name), "line job ")[0];
    assert.ok(cmd && /started=/.test(cmd), `${name}: its line job has no started=: ${cmd}`);
    const r = node(repo(), WRITER, cmd.split(" "));
    assert.equal(r.status, 0, `${name}: ${r.stderr}`);
    assert.equal(lastLine(r.stdout), `Run: ${job} · opus · low · 12 min · #40 @ bbbbbbb`, name);
    assert.equal(parseLine(r.stdout).sha, SHA, name);
  }
});

test("AC-129-2: WHEN started is missing, not a UTC time or after the end THEN the duration says unknown, never a guess", () => {
  const dir = repo();
  for (const extra of [[], ["started=yesterday"], ["started=2026-11-27T15:00:00Z"], ["started=2026-11-27T14:20:00+01:00"]]) {
    const r = node(dir, WRITER, ["line", "job", "job=qa", "pr=40", "outcome=pass", ...extra]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(lastLine(r.stdout), "Run: qa · unknown · unknown · unknown · #40", extra.join(" "));
  }
  const long = node(dir, WRITER, ["line", "job", "job=build", "issue=12", "outcome=pr-opened", "started=2026-11-27T13:07:00.000Z"]);
  assert.equal(lastLine(long.stdout), "Run: build · unknown · unknown · 1 h 25 min · issue #12");
  // A line other than job's stays one comment line (AC-329-5).
  assert.equal(node(dir, WRITER, ["line", "fix-round", "pr=40", "round=2", "fixed=1"]).stdout.trim().split("\n").length, 1);
});

test("AC-129-3: WHEN the tool can't show the model or effort THEN the record says unknown and why, and the skills say to add the why", () => {
  const r = node(repo(), WRITER, ["line", "job", "job=review-code", `pr=40`, `sha=${SHA}`, "outcome=pass", "effort=high",
    "model_from=get_session shows no model", `started=${STARTED}`]);
  assert.equal(r.status, 0, r.stderr);
  const record = parseLine(r.stdout);
  assert.deepEqual(validate(record), []);
  assert.equal(record.model, "unknown");
  assert.equal(record.model_from, "get_session shows no model");
  assert.equal(lastLine(r.stdout), "Run: review-code · unknown · high · 12 min · #40 @ bbbbbbb · unknown: get_session shows no model");
  for (const name of ["build", "pr-review", "qa", "pr-security"]) assert.match(skill(name), /`model_from=<why>`/, name);
  const reference = readFileSync(join(REPO, ".agents/skills/coordinate/references/insights.md"), "utf8");
  assert.match(reference, /Never write the one the routing table asked for/);
  assert.match(reference, /`model_from`/);
});

// Already met on main: the writer refuses any field the format doesn't name (#329). This test pins it.
test("AC-129-5: WHEN a writer passes an account label THEN exit 2 names it and nothing is written: no record names an account", () => {
  const dir = repo();
  for (const cmd of ["write", "line"]) {
    const r = node(dir, WRITER, [cmd, "job", "job=build", "issue=12", "outcome=started", "account=account-2"]);
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /\baccount: not a field of job/);
    assert.equal(r.stdout, "");
  }
});

/** A valid record with the envelope the writer fills. */
function rec(at, fields, kind = "job") {
  const record = { v: 1, kind, at, issue: null, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown", ...fields };
  assert.deepEqual(validate(record), [], JSON.stringify(record));
  return record;
}

const CHAIN = [
  rec("2026-11-25T09:00:00.000Z", { job: "build", issue: 12, model: "opus", effort: "high", outcome: "started" }),
  rec("2026-11-25T09:14:00.000Z", { job: "build", issue: 12, pr: 40, sha: SHA, model: "opus", effort: "high", outcome: "finished" }),
  rec("2026-11-25T09:20:00.000Z", { job: "review-code", pr: 40, sha: SHA, model: "sonnet", effort: "xhigh", outcome: "pass", started: "2026-11-25T09:14:00Z" }),
  rec("2026-11-25T09:21:00.000Z", { pr: 40, round: 1, verdict: "pass", must: 0, nice: 0 }, "review"),
  rec("2026-11-25T09:30:00.000Z", { job: "qa", pr: 40, sha: SHA, outcome: "pass", model_from: "tool shows no model" }),
  // Not in #40's chain: a board event, another pull request, and another issue's start.
  rec("2026-11-25T09:31:00.000Z", { job: "build", pr: 40, source: "board" }),
  rec("2026-11-25T10:00:00.000Z", { job: "build", issue: 13, model: "opus", effort: "low", outcome: "started" }),
  rec("2026-11-26T08:00:00.000Z", { job: "build", issue: 13, pr: 41, model: "opus", effort: "low", outcome: "finished" }),
];

/** A checkout with the records under docs/insights/, named as the writer names them, newest written first. */
function project() {
  const dir = repo();
  [...CHAIN].reverse().forEach((record, i) => {
    mkdirSync(join(dir, dayFolder(record)), { recursive: true });
    writeFileSync(join(dir, dayFolder(record), fileName(record, `00000${i}`)), `${JSON.stringify(record, null, 2)}\n`);
  });
  writeFileSync(join(dir, "docs/insights/2026-11-25/0900-job-0-zzzzzz.json"), "{ not json\n");
  return dir;
}

const PR_40 = [
  "2026-11-25 09:00 · build · opus · high · - · started · issue #12",
  "2026-11-25 09:14 · build · opus · high · 14 min · finished · #40 @ bbbbbbb",
  "2026-11-25 09:20 · review-code · sonnet · xhigh · 6 min · pass · #40 @ bbbbbbb",
  "2026-11-25 09:30 · qa · unknown · unknown · unknown · pass · #40 @ bbbbbbb · unknown: tool shows no model",
];

test("AC-129-4: WHEN runs --pr 40 runs THEN it prints the whole chain for that pull request in order: job, model, effort, time", () => {
  const dir = project();
  for (const r of [node(dir, RUNS, ["--pr", "40"]), node(dir, CLI, ["runs", "--pr", "40"])]) {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `Runs for #40, oldest first (UTC). 1 file skipped: not a valid record.\n${PR_40.join("\n")}\n`);
  }
  const issue = node(dir, RUNS, ["--issue", "12"]);
  assert.equal(issue.stdout, `Runs for issue #12, oldest first (UTC). 1 file skipped: not a valid record.\n${PR_40.join("\n")}\n`);
});

test("AC-129-4: WHEN runs --day runs THEN it prints that day's runs; --brief prints the /back line; nothing found says so", () => {
  const dir = project();
  const day = node(dir, CLI, ["runs", "--day", "2026-11-26"]);
  assert.equal(day.status, 0, day.stderr);
  assert.equal(day.stdout, "Runs on 2026-11-26 (UTC).\n2026-11-26 08:00 · build · opus · low · 22 h 00 min · finished · #41\n");
  const brief = node(dir, RUNS, ["--pr", "40", "--brief"]);
  assert.equal(brief.stdout, "PR #40: build by opus at high, 14 min; review-code by sonnet at xhigh, 6 min; qa by unknown at unknown, unknown time\n");
  assert.equal(node(dir, RUNS, ["--pr", "99"]).stdout, "Runs for #99, oldest first (UTC). 1 file skipped: not a valid record.\nNo runs recorded.\n");
  for (const bad of [[], ["--pr"], ["--pr", "x"], ["--day", "2026-13-45"], ["--pr", "1", "--day", "2026-11-25"], ["--brief", "--day", "2026-11-25"]]) {
    assert.equal(node(dir, RUNS, bad).status, 2, bad.join(" "));
  }
  assert.match(skill("back"), /`node \.agents\/skills\/coordinate\/scripts\/insights-runs\.mjs --pr <n> --brief`/);
});

// Review round 1 of #473: the run line prints job, model, effort and model_from, so none may hold a control character.
const CONTROL = ["line one\nRun: qa · opus · max · 1 min · #41", "red\u001b[31m", "tab\there", "del\u007f", "cr\r"];

test("AC-129-3: WHEN job, model, effort or model_from holds a control character THEN write and line exit 2 and name the field", () => {
  const dir = repo();
  for (const field of ["job", "model", "effort", "model_from"]) {
    for (const value of CONTROL) {
      for (const cmd of ["write", "line"]) {
        const r = node(dir, WRITER, [cmd, "job", "job=qa", "pr=40", "outcome=pass", `started=${STARTED}`, `${field}=${value}`]);
        assert.equal(r.status, 2, `${cmd} ${field}=${JSON.stringify(value)}`);
        assert.match(r.stderr, new RegExp(`\\b${field}: .*control character`), r.stderr);
        assert.equal(r.stdout, "", `${cmd} ${field}`);
      }
    }
    const record = rec("2026-11-25T09:30:00.000Z", { job: "qa", pr: 40, outcome: "pass" });
    assert.match(validate({ ...record, [field]: "nul\u0000" }).join("; "), new RegExp(`\\b${field}: .*control character`));
  }
});

test("AC-129-3: WHEN a record file holds a control character in a field the run line prints THEN runs skips it and prints one line per run", () => {
  const dir = project();
  const bad = { ...CHAIN[4], at: "2026-11-25T09:40:00.000Z", model_from: "x\nRun: qa · opus · max · 1 min · #40" };
  writeFileSync(join(dir, dayFolder(bad), fileName(bad, "abcdef")), `${JSON.stringify(bad, null, 2)}\n`);
  const r = node(dir, RUNS, ["--pr", "40"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `Runs for #40, oldest first (UTC). 2 files skipped: not a valid record.\n${PR_40.join("\n")}\n`);
});
