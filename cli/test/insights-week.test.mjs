// The weekly report (#381, part of #374): send-backs by size and reason, escalations and usage per merge, read from
// the insights records. AC-381-1: WHEN the report runs over a week of records THEN it prints each section, and says
// unknown where readings were missing. The fixture week is 2026-W48 (Monday 2026-11-23 to Sunday 2026-11-29, UTC).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { dayFolder, fileName, validate } from "../src/insights-record.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SKILL_SCRIPT = join(REPO, ".agents/skills/coordinate/scripts/insights-week.mjs");
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
// A Tuesday in the week after the fixture week, so "last week" is 2026-W48.
const NOW = "2026-12-01T09:00:00Z";
const usage = (before, after) => ({ usage_before: before, usage_after: after, usage_from: "status-line" });

/** A valid record with the envelope filled in, the way the writer fills it. */
function rec(kind, at, fields) {
  const record = { v: 1, kind, at, issue: null, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown", ...fields };
  assert.deepEqual(validate(record), [], JSON.stringify(record));
  return record;
}
const build = (at, issue, pr, model, effort, more = {}) => rec("job", at, { job: "build", issue, pr, model, effort, outcome: "finished", ...more });
const review = (at, pr, outcome, more = {}) => rec("job", at, { job: "review-code", pr, model: "opus", effort: "medium", outcome, ...more });

const WEEK = [
  // #10 on #50: sent back by review, escalated from sonnet to opus, then passed and merged. Every run has a reading.
  build("2026-11-23T08:50:00.000Z", 10, null, "sonnet", "medium", { outcome: "started" }),
  build("2026-11-23T09:00:00.000Z", 10, 50, "sonnet", "medium", usage("10%", "14%")),
  review("2026-11-23T10:00:00.000Z", 50, "fail", { send_back: "review-must", ...usage("14%", "15%") }),
  build("2026-11-23T12:00:00.000Z", 10, 50, "opus", "medium", usage("15%", "20%")),
  review("2026-11-23T13:00:00.000Z", 50, "pass", usage("20%", "21%")),
  rec("merge", "2026-11-23T14:00:00.000Z", { pr: 50, conflicted: [] }),
  // #11 on #51: sent back for size (not a failed review or check, so the next build is no escalation), then merged.
  // Two of its three runs have no reading.
  build("2026-11-24T09:00:00.000Z", 11, 51, "sonnet", "medium", usage("unknown", "unknown")),
  rec("job", "2026-11-24T09:30:00.000Z", { job: "size-check", issue: 11, pr: 51, model: "opus", effort: "medium", outcome: "fail", send_back: "size" }),
  build("2026-11-24T11:00:00.000Z", 11, 51, "sonnet", "medium", usage("30%", "33%")),
  review("2026-11-24T12:00:00.000Z", 51, "pass", usage("unknown", "unknown")),
  rec("merge", "2026-11-24T13:00:00.000Z", { pr: 51, conflicted: [] }),
  // #12 on #52: a failed acceptance check, escalated, then a failed review: the escalation didn't fix it. Not merged.
  build("2026-11-25T09:00:00.000Z", 12, 52, "sonnet", "medium"),
  rec("job", "2026-11-25T10:00:00.000Z", { job: "qa", pr: 52, model: "opus", effort: "low", outcome: "fail", send_back: "checks" }),
  build("2026-11-25T12:00:00.000Z", 12, 52, "opus", "medium"),
  review("2026-11-25T13:00:00.000Z", 52, "fail", { send_back: "review-must" }),
  // #13: the builder stopped on the machine, with no model or effort it could read.
  build("2026-11-26T09:00:00.000Z", 13, null, "unknown", "unknown", { outcome: "stopped", send_back: "infra", ...usage("unknown", "unknown") }),
  // #14 on #54: sent back by review, and the next build's model is unknown, so whether it escalated is unknown.
  build("2026-11-26T09:00:00.000Z", 14, 54, "sonnet", "medium"),
  review("2026-11-26T10:00:00.000Z", 54, "fail", { send_back: "review-must" }),
  build("2026-11-26T12:00:00.000Z", 14, 54, "unknown", "unknown"),
  // The week after: never counted in 2026-W48.
  build("2026-11-30T09:00:00.000Z", 15, 55, "opus", "high", usage("1%", "2%")),
];

/** A folder with docs/insights/<day>/ holding the records, as the writer names them, and one file that isn't a record. */
function project(records) {
  const dir = tmp("onrails-week-");
  records.forEach((record, i) => {
    mkdirSync(join(dir, dayFolder(record)), { recursive: true });
    writeFileSync(join(dir, dayFolder(record), fileName(record, i.toString(16).padStart(6, "0"))), `${JSON.stringify(record, null, 2)}\n`);
  });
  mkdirSync(join(dir, "docs/insights/2026-11-25"), { recursive: true });
  writeFileSync(join(dir, "docs/insights/2026-11-25/0900-job-0-zzzzzz.json"), "{ not json\n");
  return dir;
}

const env = () => safeEnv({ ONRAILS_NOW: NOW });
const report = (dir, ...args) => spawnSync(process.execPath, [SKILL_SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: env() });

/** Every file under dir with its bytes and time, to show a run changed nothing. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = join(d, e.name);
    if (e.isDirectory()) return walk(p);
    out[p] = `${readFileSync(p, "utf8")}@${statSync(p).mtimeMs}`;
  });
  walk(dir);
  return out;
}

test("AC-381-1: WHEN the report runs over a week of records THEN it prints the runs per role and model", () => {
  const r = report(project(WEEK), "--week", "2026-W48");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^# Weekly report · 2026-W48\n/);
  assert.ok(r.stdout.includes("2026-11-23 to 2026-11-29 (UTC). 19 records this week. 1 file skipped: not a valid record."), r.stdout);
  assert.ok(r.stdout.includes("## Runs per role and model"), r.stdout);
  for (const row of [
    "| builder | build | opus | medium | 2 |",
    "| builder | build | sonnet | medium | 5 |",
    "| builder | build | unknown | unknown | 2 |",
    "| coordinator | review-code | opus | medium | 5 |",
    "| coordinator | size-check | opus | medium | 1 |",
    "| unknown | qa | opus | low | 1 |",
  ]) assert.ok(r.stdout.includes(row), `${row}\n${r.stdout}`);
  // The start record is no run, and the week after isn't this week.
  assert.ok(!r.stdout.includes("| high |"), r.stdout);
});

test("AC-381-1: WHEN the report runs over a week of records THEN it prints the send-back rate by reason, per builder model", () => {
  const r = report(project(WEEK), "--week", "2026-W48");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("## Send-backs by reason"), r.stdout);
  for (const row of [
    "| Builder model | Effort | Builds | size | review-must | checks | infra | process | Per build |",
    "| opus | medium | 2 | 0 | 1 | 0 | 0 | 0 | 0.50 |",
    "| sonnet | medium | 5 | 1 | 2 | 1 | 0 | 0 | 0.80 |",
    "| unknown | unknown | 2 | 0 | 0 | 0 | 1 | 0 | 0.50 |",
    "| All | | 9 | 1 | 3 | 1 | 1 | 0 | 0.67 |",
  ]) assert.ok(r.stdout.includes(row), `${row}\n${r.stdout}`);
});

test("AC-381-1: WHEN the records hold no pull request size THEN the size buckets say unknown, and the size send-backs are named", () => {
  const r = report(project(WEEK), "--week", "2026-W48");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("## Pull request size against send-backs"), r.stdout);
  for (const row of [
    "| under 500 | unknown | unknown | unknown |",
    "| 500 to 999 | unknown | unknown | unknown |",
    "| 1,000 or more | unknown | unknown | unknown |",
    "| All sizes | 4 | 4 | 100% |",
  ]) assert.ok(r.stdout.includes(row), `${row}\n${r.stdout}`);
  assert.ok(r.stdout.includes("Sent back for size (1,000 or more at that head): #51."), r.stdout);
});

test("AC-381-1: WHEN builds follow a failed review or check THEN it prints each escalation and whether it fixed it, unknown where a model is", () => {
  const r = report(project(WEEK), "--week", "2026-W48");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("## Escalations"), r.stdout);
  assert.ok(r.stdout.includes("Builds after a failed review or check: 3. Escalated: 2. Not escalated: 0. Unknown: 1."), r.stdout);
  for (const row of [
    "| #10 | sonnet · medium | opus · medium | yes |",
    "| #12 | sonnet · medium | opus · medium | no |",
    "| #14 | sonnet · medium | unknown · unknown | unknown |",
  ]) assert.ok(r.stdout.includes(row), `${row}\n${r.stdout}`);
  // A build after a size send-back is no escalation.
  assert.ok(!r.stdout.includes("| #11 |"), r.stdout);
});

test("AC-381-1: WHEN a merged pull request's runs have readings THEN it prints the usage per merge, and unknown where one is missing", () => {
  const r = report(project(WEEK), "--week", "2026-W48");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("## Usage per merged pull request"), r.stdout);
  assert.ok(r.stdout.includes("| #50 | 4 | 4 | 11% |"), r.stdout);
  assert.ok(r.stdout.includes("| #51 | 3 | 1 | unknown |"), r.stdout);
  assert.ok(!r.stdout.includes("| #52 |"), r.stdout);
});

test("AC-381-1: WHEN a week has no records THEN every section still prints, and says unknown", () => {
  const r = report(project(WEEK), "--week", "2026-W40");
  assert.equal(r.status, 0, r.stderr);
  for (const heading of ["## Runs per role and model", "## Send-backs by reason", "## Pull request size against send-backs", "## Escalations",
    "## Usage per merged pull request"]) assert.ok(r.stdout.includes(heading), `${heading}\n${r.stdout}`);
  assert.ok(r.stdout.includes("No runs recorded this week."), r.stdout);
  assert.ok(r.stdout.includes("| All | | 0 | 0 | 0 | 0 | 0 | 0 | unknown |"), r.stdout);
  assert.ok(r.stdout.includes("| All sizes | 0 | 0 | unknown |"), r.stdout);
  assert.ok(r.stdout.includes("Builds after a failed review or check: 0."), r.stdout);
  assert.ok(r.stdout.includes("No merge records this week, so the usage per merged pull request is unknown."), r.stdout);
});

test("AC-381-1: WHEN no week is named THEN it reports last full week, and the CLI's insights --week prints the same", () => {
  const dir = project(WEEK);
  const named = report(dir, "--week", "2026-W48");
  const last = report(dir);
  assert.equal(last.status, 0, last.stderr);
  assert.equal(last.stdout, named.stdout);
  const cli = spawnSync(process.execPath, [CLI, "insights", "--week", "2026-W48", dir], { encoding: "utf8", env: env() });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, named.stdout);
  const cliLast = spawnSync(process.execPath, [CLI, "insights", "--week"], { cwd: dir, encoding: "utf8", env: env() });
  assert.equal(cliLast.status, 0, cliLast.stderr);
  assert.equal(cliLast.stdout, named.stdout);
});

test("AC-381-1: WHEN --skip names the week it would report THEN it prints nothing, so the loop sends each week once", () => {
  const dir = project(WEEK);
  const skipped = report(dir, "--skip", "2026-W48");
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.equal(skipped.stdout, "");
  for (const week of ["2026-W47", "none"]) {
    const due = report(dir, "--skip", week);
    assert.equal(due.status, 0, due.stderr);
    assert.match(due.stdout, /^# Weekly report · 2026-W48\n/);
  }
  const bad = report(dir, "--skip", "W48");
  assert.equal(bad.status, 2, bad.stdout);
  assert.equal(bad.stdout, "");
});

test("AC-381-1: WHEN the week is malformed or doesn't exist THEN it exits 2 and prints no report", () => {
  const dir = project(WEEK);
  for (const week of ["2026-48", "2026-W00", "2026-W54", "2025-W53"]) {
    const r = report(dir, "--week", week);
    assert.equal(r.status, 2, `${week}: ${r.stdout}`);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /yyyy-Www/);
  }
  const cli = spawnSync(process.execPath, [CLI, "insights"], { cwd: dir, encoding: "utf8", env: env() });
  assert.equal(cli.status, 2, cli.stdout);
  assert.match(cli.stderr, /insights --week/);
});

test("AC-381-1: WHEN the report runs THEN it only reads: every file stays as it was", () => {
  const dir = project(WEEK);
  const before = snapshot(dir);
  assert.equal(report(dir, "--week", "2026-W48").status, 0);
  assert.equal(spawnSync(process.execPath, [CLI, "insights", "--week", "2026-W48", dir], { encoding: "utf8", env: env() }).status, 0);
  assert.deepEqual(snapshot(dir), before);
});
