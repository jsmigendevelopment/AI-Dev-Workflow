// #427, part of #374: the size check's record. A `job=size-check` record holds the counted lines of the head it
// checked (`lines`), pass or fail, so the weekly report can bucket a pull request by size. AC-427-1 here: the format
// and the writers accept the field only as tightly as the rest, and a size-check record is no review run. The script
// that writes it is tested in pr-size-record.test.mjs, the report in insights-week-size.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { SIZE_LIMIT, parseLine, validate } from "../src/insights-record.mjs";
import { MAX_CHANGED_LINES } from "../../.agents/skills/coordinate/scripts/pr-size.mjs";
import { REPO, REVIEW, SCRIPTS, SHA, git, json, pathOf, put, record, run } from "./insights-land-fakes.mjs";
import { mergeMain, refuses } from "./insights-carry-fakes.mjs";

const SIZE = record("job", { job: "size-check", outcome: "pass", lines: 312, model: "opus", effort: "medium" });
const SENT_BACK = { ...SIZE, outcome: "fail", send_back: "size", lines: 1234 };
const REVIEW_JOB = record("job", { outcome: "pass" });
const CHECK = record("check", { job: null, tool: null, state: "success", commands: [{ name: "npm test", result: "pass", seconds: 4 }], failed_step: null });
const PROBLEM = (r, name) => validate(r).filter((e) => e.startsWith(`${name}:`));

test("AC-427-1: the size limit the record format checks against is the one pr-size.mjs fails at", () => {
  assert.equal(SIZE_LIMIT, MAX_CHANGED_LINES);
});

test("AC-427-1: WHEN a size-check job record has lines, pass or fail, THEN it validates; an older one with no lines still does", () => {
  assert.deepEqual(validate(SIZE), []);
  assert.deepEqual(validate({ ...SIZE, lines: 0 }), []);
  assert.deepEqual(validate({ ...SIZE, lines: 1500 }), [], "a pass over the limit is a size exception");
  assert.deepEqual(validate(SENT_BACK), []);
  assert.deepEqual(validate({ ...SENT_BACK, lines: SIZE_LIMIT }), []);
  const old = { ...SENT_BACK };
  delete old.lines;
  assert.deepEqual(validate(old), [], "the #378 send-back record, with no lines");
  assert.deepEqual(validate({ ...SIZE, lines: undefined, pr: null, sha: null }), [], "a pass with no lines needs no sha");
});

test("AC-427-1: WHEN lines isn't a whole number from 0 up THEN validate names lines", () => {
  for (const lines of [-1, 1.5, "312", null, true, [312], Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(PROBLEM({ ...SIZE, lines }, "lines").length, 1, `${String(lines)}: ${validate({ ...SIZE, lines })}`);
    assert.ok(!PROBLEM({ ...SIZE, lines }, "lines")[0].includes("not a field"), String(lines));
  }
  assert.deepEqual(validate({ ...SIZE, lines: Number.MAX_SAFE_INTEGER }), []);
});

test("AC-427-1: WHEN lines is on another job, another kind or an outcome that isn't pass or fail THEN validate refuses it", () => {
  assert.deepEqual(PROBLEM({ ...SIZE, job: "review-code" }, "lines"), ["lines: only on a size-check job record"]);
  assert.deepEqual(PROBLEM({ ...SIZE, job: null }, "lines"), ["lines: only on a size-check job record"]);
  for (const outcome of ["started", "finished", "stopped", "pr-opened"]) {
    assert.deepEqual(PROBLEM({ ...SIZE, outcome }, "lines"), ["lines: only with outcome pass or fail"], outcome);
  }
  assert.deepEqual(PROBLEM(record("review", { round: 1, verdict: "pass", must: 0, nice: 0, lines: 312 }), "lines"), ["lines: not a field of review"]);
  assert.deepEqual(PROBLEM(record("check", { commands: [], lines: 312 }), "lines"), ["lines: not a field of check"]);
});

test("AC-427-1: WHEN a size record has lines but no head sha THEN validate asks for the sha it counted", () => {
  for (const sha of [null, undefined]) assert.deepEqual(PROBLEM({ ...SIZE, sha }, "sha"), ["sha: required with lines (the head that was counted)"]);
});

test("AC-427-1: WHEN a failed size check has fewer than the limit, or isn't a size send-back, THEN validate refuses it", () => {
  assert.deepEqual(PROBLEM({ ...SENT_BACK, lines: SIZE_LIMIT - 1 }, "lines"), [`lines: a failed size check counted ${SIZE_LIMIT} or more, not ${SIZE_LIMIT - 1}`]);
  const other = { ...SENT_BACK, send_back: "process" };
  assert.deepEqual(PROBLEM(other, "send_back"), ["send_back: a failed size check with lines is send_back=size"]);
  const none = { ...SENT_BACK };
  delete none.send_back;
  assert.deepEqual(PROBLEM(none, "send_back"), ["send_back: a failed size check with lines is send_back=size"]);
  // A pass never sends work back.
  assert.ok(PROBLEM({ ...SIZE, send_back: "size" }, "send_back").length === 1);
});

const WRITER = join(REPO, SCRIPTS, "insights.mjs");
const written = (dir, ...args) => {
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [WRITER, ...args], { cwd: dir, encoding: "utf8", env });
};
const base = ["job", "job=size-check", "issue=12", "pr=40", `sha=${SHA}`, "model=opus", "effort=medium", "tool=claude-code"];

test("AC-427-1: WHEN insights.mjs write or line gets lines THEN it writes a valid record, and a bad value exits 2 naming lines", () => {
  const dir = tmp("insights-size-");
  git(dir, "init", "-q", "-b", "main");
  const ok = written(dir, "write", ...base, "outcome=pass", "lines=312");
  assert.equal(ok.status, 0, ok.stderr);
  const saved = JSON.parse(readFileSync(ok.stdout.trim(), "utf8"));
  assert.deepEqual([saved.job, saved.outcome, saved.lines, saved.sha], ["size-check", "pass", 312, SHA]);
  assert.equal(parseLine(written(dir, "line", ...base, "outcome=fail", "send_back=size", "lines=1200").stdout).lines, 1200);
  for (const lines of ["abc", "-3", "2.5", "", "1e999"]) {
    const bad = written(dir, "write", ...base, "outcome=pass", `lines=${lines}`);
    assert.equal(bad.status, 2, `lines=${lines}`);
    assert.match(bad.stderr, /lines:/, lines);
  }
  const wrongJob = written(dir, "write", "job", "job=build", "outcome=finished", "model=opus", "effort=medium", "lines=3");
  assert.equal(wrongJob.status, 2);
  assert.match(wrongJob.stderr, /lines: only on a size-check job record/);
});

/** Every record file under docs/insights/ of this checkout. */
function repoRecords() {
  const top = join(REPO, "docs", "insights");
  return readdirSync(top).flatMap((day) => readdirSync(join(top, day)).filter((n) => n.endsWith(".json")).map((n) => join(top, day, n)));
}

test("AC-427-1: every record already on main still validates under the stricter format", () => {
  const files = repoRecords();
  assert.ok(files.length > 0, "docs/insights/ has records");
  for (const file of files) assert.deepEqual(validate(JSON.parse(readFileSync(file, "utf8"))), [], file);
});

/** A temp git repo standing in for the coordinator's checkout of main, holding `records` and the coordinate scripts. */
function checkout(records) {
  const dir = tmp("onrails-size-records-");
  git(dir, "init", "-q", "-b", "main");
  cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  records.forEach((r, i) => put(dir, pathOf(r, `${i}`.padStart(6, "0")), json(r)));
  return dir;
}
const hasRecords = (dir) => run(dir, ["has-records", "--pr", "40", "--sha", SHA]);

test("AC-427-1: WHEN the only job record at a head is the size check's THEN has-records still names the missing review job", unixOnly, () => {
  const r = hasRecords(checkout([SIZE, CHECK, REVIEW]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /no job record/);
  assert.equal(hasRecords(checkout([SIZE, REVIEW_JOB, CHECK, REVIEW])).status, 0, "with the review job it passes");
  assert.equal(hasRecords(checkout([SENT_BACK, CHECK, REVIEW])).status, 1);
  // Local mode's form matches on the issue, and the same rule holds.
  const byIssue = (records) => run(checkout(records), ["has-records", "--issue", "12", "--sha", SHA]);
  assert.equal(byIssue([SIZE, CHECK, REVIEW]).status, 1);
  assert.equal(byIssue([SIZE, REVIEW_JOB, CHECK, REVIEW]).status, 0);
});

test("AC-427-1: WHEN the reviewed head has a size-check job and a review but no review job THEN carry refuses", unixOnly, () => {
  refuses("a size-check job is no review job", /no job and review records/, mergeMain, { held: [SIZE, REVIEW] });
});
