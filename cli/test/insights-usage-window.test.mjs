// #431, follow-up to #381: a usage reading's window and reset time. AC-431-1: the job record holds them, written by the
// writer, as tightly as the rest. AC-431-2: the weekly report gives a run's usage as unknown when the run crossed a
// reset or its two readings name different windows. The last tests are the two small items from the issue's comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { dayFolder, fileName, parseLine, validate } from "../src/insights-record.mjs";
import { recordProblem } from "../../.agents/skills/coordinate/scripts/insights-land.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const WRITER = join(REPO, ".agents/skills/coordinate/scripts/insights.mjs");
const REPORT = join(REPO, ".agents/skills/coordinate/scripts/insights-week.mjs");
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const FIELDS = ["usage_window_before", "usage_window_after", "usage_resets_before", "usage_resets_after"];
const AT = "2026-11-24T11:00:00.000Z";
const NOW = "2026-12-01T09:00:00Z";

/** A record with the envelope filled in, the way the writer fills it. */
const raw = (kind, at, fields) => ({ v: 1, kind, at, issue: null, pr: null, sha: null, job: null, tool: null, model: "unknown", effort: "unknown", ...fields });
/** The same, and it must be valid. */
function rec(kind, at, fields) {
  const record = raw(kind, at, fields);
  assert.deepEqual(validate(record), [], JSON.stringify(record));
  return record;
}
const reading = (before, after, more = {}) => ({ tool: "claude-code", usage_before: before, usage_after: after, usage_from: "get_session", ...more });
const build = (at, issue, pr, more = {}) => rec("job", at, { job: "build", issue, pr, model: "opus", effort: "high", outcome: "finished", ...more });
const merge = (at, pr) => rec("merge", at, { pr, conflicted: [] });
const job = (more) => raw("job", AT, { job: "build", issue: 12, pr: 40, model: "opus", effort: "high", outcome: "finished", ...reading("41%", "44%"), ...more });
const problems = (record, name) => validate(record).filter((e) => e.startsWith(`${name}:`));

/** A folder with docs/insights/<day>/ holding the records, as the writer names them. */
function project(records) {
  const dir = tmp("onrails-window-");
  records.forEach((record, i) => {
    mkdirSync(join(dir, dayFolder(record)), { recursive: true });
    writeFileSync(join(dir, dayFolder(record), fileName(record, i.toString(16).padStart(6, "0"))), `${JSON.stringify(record, null, 2)}\n`);
  });
  return dir;
}
const report = (dir) => {
  const r = spawnSync(process.execPath, [REPORT, "--week", "2026-W48"], { cwd: dir, encoding: "utf8", env: safeEnv({ ONRAILS_NOW: NOW }) });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
/** One merged pull request with one build that has the fields, and a review with a plain reading. */
const week = (buildFields, pr = 70) => project([
  build("2026-11-24T11:00:00.000Z", 30, pr, { started: "2026-11-24T09:00:00.000Z", ...reading("90%", "95%"), ...buildFields }),
  rec("job", "2026-11-24T12:00:00.000Z", { job: "review-code", pr, model: "opus", effort: "medium", outcome: "pass", ...reading("95%", "96%") }),
  merge("2026-11-24T13:00:00.000Z", pr),
]);

test("AC-431-1: WHEN a job record has a reading's window and reset time THEN it validates, and an older one without them still does", () => {
  const full = job({
    usage_window_before: "seven_day", usage_window_after: "seven_day",
    usage_resets_before: "2026-11-30T10:00:00.000Z", usage_resets_after: "2026-11-30T10:00:00.000Z",
  });
  assert.deepEqual(validate(full), []);
  assert.deepEqual(validate(job({ usage_window_after: "five_hour", usage_resets_after: "2026-11-24T16:00:00.000Z" })), [], "one side only");
  assert.deepEqual(validate(job({ usage_before: "unknown", usage_window_before: "seven_day", usage_resets_before: "2026-11-30T10:00:00.000Z" })), [],
    "the tool shows the window and reset but no percentage");
  assert.deepEqual(validate(job({ usage_window_before: "unknown", usage_resets_before: "unknown" })), [], "unknown when the tool shows none");
  assert.deepEqual(validate(job({})), [], "a record from before #431");
});

test("AC-431-1: WHEN a window isn't a plain lower-case name THEN validate names the field", () => {
  for (const value of ["Seven_Day", "seven day", "7_day", "seven-day", "seven_day\n", "seven_day ", "a".repeat(41), "", "seven_day=1", 7, null, ["seven_day"]]) {
    assert.equal(problems(job({ usage_window_before: value }), "usage_window_before").length, 1, `${JSON.stringify(value)}: ${validate(job({ usage_window_before: value }))}`);
  }
  assert.deepEqual(validate(job({ usage_window_after: "a".repeat(40) })), [], "40 characters passes");
});

test("AC-431-1: WHEN a reset time isn't exactly what toISOString writes, or unknown, THEN validate names the field", () => {
  for (const value of [
    "2026-11-30T10:00:00Z", "2026-11-30 10:00:00.000Z", "2026-11-30T10:00:00.000+00:00", "2026-11-30", "1780000000", 1780000000,
    "Nov 30 2026 10:00 (UTC) Z", "2026-11-30T10:00:00.000Z\n", "tomorrow", "", null,
  ]) {
    assert.equal(problems(job({ usage_resets_after: value }), "usage_resets_after").length, 1, `${JSON.stringify(value)}: ${validate(job({ usage_resets_after: value }))}`);
  }
  assert.ok(!problems(job({ usage_resets_before: "2026-11-30T10:00:00" }), "usage_resets_before")[0].includes("not a field"));
});

test("AC-431-1: WHEN a window or reset has no reading of its own side THEN validate refuses it", () => {
  const noBefore = job({ usage_window_before: "seven_day", usage_resets_before: "2026-11-30T10:00:00.000Z" });
  delete noBefore.usage_before;
  assert.deepEqual(problems(noBefore, "usage_window_before"), ["usage_window_before: only with usage_before (the reading it is for)"]);
  assert.deepEqual(problems(noBefore, "usage_resets_before"), ["usage_resets_before: only with usage_before (the reading it is for)"]);
  const noAfter = job({ usage_window_after: "seven_day", usage_resets_after: "2026-11-30T10:00:00.000Z" });
  delete noAfter.usage_after;
  assert.deepEqual(problems(noAfter, "usage_window_after"), ["usage_window_after: only with usage_after (the reading it is for)"]);
  assert.deepEqual(problems(noAfter, "usage_resets_after"), ["usage_resets_after: only with usage_after (the reading it is for)"]);
});

test("AC-431-1: WHEN another kind has the fields THEN validate says they aren't its fields", () => {
  const review = raw("review", AT, { round: 1, verdict: "pass", must: 0, nice: 0, usage_window_before: "seven_day" });
  assert.deepEqual(problems(review, "usage_window_before"), ["usage_window_before: not a field of review"]);
});

test("AC-431-1: WHEN the writer gets the window and reset time THEN the record holds both, and a bad value writes nothing", () => {
  const dir = tmp("onrails-window-writer-");
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  delete env.CLAUDE_PROJECT_DIR;
  const base = ["job", "job=build", "issue=12", "outcome=finished", "model=opus", "effort=high", "tool=claude-code", "usage_before=90%", "usage_after=95%", "usage_from=get_session"];
  const write = (...more) => spawnSync(process.execPath, [WRITER, "write", ...base, ...more], { cwd: dir, encoding: "utf8", env });
  const ok = write("usage_window_before=seven_day", "usage_window_after=seven_day", "usage_resets_before=2026-11-30T10:00:00.000Z", "usage_resets_after=2026-11-30T10:00:00.000Z");
  assert.equal(ok.status, 0, ok.stderr);
  const written = JSON.parse(readFileSync(ok.stdout.trim(), "utf8"));
  assert.equal(written.usage_window_before, "seven_day");
  assert.equal(written.usage_window_after, "seven_day");
  assert.equal(written.usage_resets_before, "2026-11-30T10:00:00.000Z");
  assert.equal(written.usage_resets_after, "2026-11-30T10:00:00.000Z");
  assert.deepEqual(validate(written), []);
  const line = spawnSync(process.execPath, [WRITER, "line", ...base, "usage_window_before=seven_day"], { cwd: dir, encoding: "utf8", env });
  assert.equal(parseLine(line.stdout)?.usage_window_before, "seven_day", line.stderr);
  const files = () => readdirSync(join(dir, "docs/insights/2026-11-27")).length;
  const before = files();
  for (const bad of ["usage_window_before=Seven Day", "usage_resets_before=2026-11-30T10:00:00Z", "usage_resets_after=1780000000"]) {
    const r = write(bad);
    assert.equal(r.status, 2, `${bad}: ${r.stderr}`);
    assert.ok(r.stderr.includes(bad.split("=")[0]), r.stderr);
  }
  assert.equal(files(), before, "a refused write leaves no file");
});

test("AC-431-1: WHEN build, pr-review, pr-security and qa are read THEN each says to pass the window and reset time where the tool shows them, and never estimate", () => {
  for (const name of ["build", "pr-review", "pr-security", "qa"]) {
    const text = readFileSync(join(REPO, ".agents/skills", name, "SKILL.md"), "utf8");
    for (const field of FIELDS) assert.ok(text.includes(field), `${name}: ${field}`);
    assert.match(text, /rateLimitType/, name);
    assert.match(text, /never (?:estimate|work out|guess)/i, name);
  }
});

test("AC-431-2: WHEN a run's reset time falls inside the run THEN its usage, and its pull request's, is unknown", () => {
  const out = report(week({ usage_window_before: "seven_day", usage_resets_before: "2026-11-24T10:00:00.000Z" }));
  assert.ok(out.includes("| #70 | 2 | 1 | unknown |"), out);
  // The same run with no reset time still shows the 5 points the issue says read low.
  assert.ok(report(week({})).includes("| #70 | 2 | 2 | 6% |"), "control");
});

test("AC-431-2: WHEN the reset time is the run's end reading's, and inside the run, THEN its usage is unknown", () => {
  const out = report(week({ usage_window_after: "seven_day", usage_resets_after: "2026-11-24T10:30:00.000Z" }));
  assert.ok(out.includes("| #70 | 2 | 1 | unknown |"), out);
});

test("AC-431-2: WHEN a reset time is before the run began or after it ended THEN the usage still shows", () => {
  for (const [name, resets] of [["before", "2026-11-24T08:00:00.000Z"], ["after", "2026-11-30T10:00:00.000Z"]]) {
    const out = report(week({ usage_window_before: "seven_day", usage_window_after: "seven_day", usage_resets_before: resets, usage_resets_after: resets }));
    assert.ok(out.includes("| #70 | 2 | 2 | 6% |"), `${name}\n${out}`);
  }
});

test("AC-431-2: WHEN a run has no started time THEN a reset time at or before its end still marks it", () => {
  const dir = project([
    build("2026-11-24T11:00:00.000Z", 30, 71, { ...reading("90%", "95%"), usage_window_before: "seven_day", usage_resets_before: "2026-11-24T11:00:00.000Z" }),
    merge("2026-11-24T13:00:00.000Z", 71),
  ]);
  assert.ok(report(dir).includes("| #71 | 1 | 0 | unknown |"), "at the end");
});

test("AC-431-2: WHEN a run's two readings name different windows THEN its usage is unknown; the same, or one unknown, shows", () => {
  assert.ok(report(week({ usage_window_before: "five_hour", usage_window_after: "seven_day" })).includes("| #70 | 2 | 1 | unknown |"), "different");
  assert.ok(report(week({ usage_window_before: "seven_day", usage_window_after: "seven_day" })).includes("| #70 | 2 | 2 | 6% |"), "same");
  assert.ok(report(week({ usage_window_before: "seven_day", usage_window_after: "unknown" })).includes("| #70 | 2 | 2 | 6% |"), "one unknown");
  assert.ok(report(week({ usage_window_before: "seven_day" })).includes("| #70 | 2 | 2 | 6% |"), "one absent");
});

test("AC-431-2: WHEN the report prints usage THEN it says a crossed reset or different windows are unknown, and the CLI copy agrees", () => {
  const dir = week({ usage_window_before: "five_hour", usage_window_after: "seven_day" });
  const out = report(dir);
  assert.match(out, /crossed a reset|reset time/i);
  const cli = spawnSync(process.execPath, [CLI, "insights", "--week", "2026-W48", dir], { encoding: "utf8", env: safeEnv({ ONRAILS_NOW: NOW }) });
  assert.equal(cli.stdout, out);
});

// The two small items from the comment on #431 (from the round 3 review of #428).
const RETRY = [
  build("2026-11-24T09:00:00.000Z", 30, 72, { model: "sonnet", effort: "medium" }),
  rec("job", "2026-11-24T10:00:00.000Z", { job: "review-code", pr: 72, model: "opus", effort: "medium", outcome: "fail", send_back: "review-must" }),
];

test("AC-431-3: WHEN a retry on the same model and effort follows an escalation THEN it stays inside that escalation's row", () => {
  const out = report(project([...RETRY,
    build("2026-11-24T11:00:00.000Z", 30, 72, { model: "opus", effort: "medium" }),
    rec("job", "2026-11-24T12:00:00.000Z", { job: "review-code", pr: 72, model: "opus", effort: "medium", outcome: "fail", send_back: "review-must" }),
    build("2026-11-24T13:00:00.000Z", 30, 72, { model: "opus", effort: "medium" }),
    rec("job", "2026-11-24T14:00:00.000Z", { job: "review-code", pr: 72, model: "opus", effort: "medium", outcome: "pass" }),
    merge("2026-11-24T15:00:00.000Z", 72)]));
  assert.ok(out.includes("Builds after a failed review or check: 2. Escalated: 1. Not escalated: 1. Unknown: 0."), out);
  assert.ok(out.includes("| #30 | sonnet · medium | opus · medium | yes |"), out);
  assert.equal(out.split("\n").filter((l) => l.startsWith("| #30 |")).length, 1, "one row");
});

test("AC-431-3: WHEN two builds of an issue share an unknown model or effort THEN the earlier row's fixed it is unknown, not yes", () => {
  const out = report(project([...RETRY,
    build("2026-11-24T11:00:00.000Z", 30, 72, { model: "unknown", effort: "unknown" }),
    rec("job", "2026-11-24T12:00:00.000Z", { job: "review-code", pr: 72, model: "opus", effort: "medium", outcome: "fail", send_back: "review-must" }),
    build("2026-11-24T13:00:00.000Z", 30, 72, { model: "unknown", effort: "unknown" }),
    rec("job", "2026-11-24T14:00:00.000Z", { job: "review-code", pr: 72, model: "opus", effort: "medium", outcome: "pass" }),
    merge("2026-11-24T15:00:00.000Z", 72)]));
  assert.ok(out.includes("| #30 | sonnet · medium | unknown · unknown | unknown |"), out);
  assert.ok(out.includes("| #30 | unknown · unknown | unknown · unknown | yes |"), out);
});

// #572, from the review of #563: the edges of the report's rule, both mixed orders of "Fixed it", and a zone on started and ended.
const crossed = (fields) => report(week({ usage_window_before: "seven_day", ...fields })).includes("| #70 | 2 | 1 | unknown |");
const shown = (fields) => report(week({ usage_window_before: "seven_day", ...fields })).includes("| #70 | 2 | 2 | 6% |");

test("AC-572-1: WHEN a reset is exactly at started THEN the run isn't crossed, and a millisecond later it is", () => {
  assert.ok(shown({ usage_resets_before: "2026-11-24T09:00:00.000Z" }), "at started");
  assert.ok(crossed({ usage_resets_before: "2026-11-24T09:00:00.001Z" }), "just after started");
});

test("AC-572-1: WHEN ended differs from at THEN a reset at ended crosses and one after ended, before at, doesn't", () => {
  const ended = "2026-11-24T10:30:00.000Z";
  assert.ok(crossed({ ended, usage_resets_after: ended }), "at ended");
  assert.ok(shown({ ended, usage_resets_after: "2026-11-24T10:30:00.001Z" }), "after ended, before at");
});

test("AC-572-1: WHEN started or ended isn't a time THEN the report falls back to at, and to the end alone", () => {
  // No usable start: a reset before the real start still counts, since only the end bounds the run.
  assert.ok(crossed({ started: "yesterday", usage_resets_before: "2026-11-24T08:00:00.000Z" }), "bad started, reset before it");
  assert.ok(shown({ started: "yesterday", usage_resets_before: "2026-11-24T11:00:00.001Z" }), "bad started, reset after at");
  assert.ok(crossed({ ended: "soon", usage_resets_after: AT }), "bad ended, reset at at");
  assert.ok(shown({ ended: "soon", usage_resets_after: "2026-11-24T11:00:00.001Z" }), "bad ended, reset after at");
});

const escalation = (...runs) => report(project([...RETRY, ...runs, merge("2026-11-24T15:00:00.000Z", 72)]));
const failed = (at) => rec("job", at, { job: "review-code", pr: 72, model: "opus", effort: "medium", outcome: "fail", send_back: "review-must" });
const passed = (at) => rec("job", at, { job: "review-code", pr: 72, model: "opus", effort: "medium", outcome: "pass" });

test("AC-572-2: WHEN a known build is followed by a build with an unknown model THEN its fixed it is unknown, and the later one's is yes", () => {
  const out = escalation(
    build("2026-11-24T11:00:00.000Z", 30, 72, { model: "opus", effort: "medium" }), failed("2026-11-24T12:00:00.000Z"),
    build("2026-11-24T13:00:00.000Z", 30, 72, { model: "unknown", effort: "unknown" }), passed("2026-11-24T14:00:00.000Z"));
  assert.ok(out.includes("| #30 | sonnet · medium | opus · medium | unknown |"), out);
  assert.ok(out.includes("| #30 | opus · medium | unknown · unknown | yes |"), out);
});

test("AC-572-2: WHEN a build with an unknown model is followed by a known one THEN its fixed it is unknown, and the later one's is yes", () => {
  const out = escalation(
    build("2026-11-24T11:00:00.000Z", 30, 72, { model: "unknown", effort: "unknown" }), failed("2026-11-24T12:00:00.000Z"),
    build("2026-11-24T13:00:00.000Z", 30, 72, { model: "opus", effort: "medium" }), passed("2026-11-24T14:00:00.000Z"));
  assert.ok(out.includes("| #30 | sonnet · medium | unknown · unknown | unknown |"), out);
  assert.ok(out.includes("| #30 | unknown · unknown | opus · medium | yes |"), out);
});

test("AC-572-3: WHEN started or ended has no zone THEN validate names the field", () => {
  for (const name of ["started", "ended"]) {
    for (const value of ["2026-11-24T09:00:00", "2026-11-24T09:00:00.000", "2026-11-24T09:00", "2026-11-24 09:00:00", "2026-11-24", "Nov 24 2026 09:00"]) {
      assert.equal(problems(job({ [name]: value }), name).length, 1, `${name} ${JSON.stringify(value)}: ${validate(job({ [name]: value }))}`);
    }
    for (const value of ["2026-11-24T09:00:00Z", "2026-11-24T09:00:00.000Z", "2026-11-24T09:00Z", "2026-11-24T09:00:00+01:00"]) {
      assert.deepEqual(problems(job({ [name]: value }), name), [], `${name} ${value}`);
    }
  }
  // Text that is no time at all stays valid: the writer's `line` takes started=yesterday and the run line says unknown (AC-129-2).
  assert.deepEqual(validate(job({ started: "yesterday" })), []);
});

test("AC-572-3: WHEN the writer gets a started or ended with no zone THEN it exits 2 naming the field and writes nothing", () => {
  const dir = tmp("onrails-zone-writer-");
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  const env = safeEnv({ ONRAILS_NOW: "2026-11-27T14:32:00Z" });
  delete env.CLAUDE_PROJECT_DIR;
  const base = ["job", "job=build", "issue=12", "outcome=finished", "model=opus", "effort=high", "tool=claude-code"];
  for (const bad of ["started=2026-11-27T14:20:00", "ended=2026-11-27 14:30:00"]) {
    const r = spawnSync(process.execPath, [WRITER, "write", ...base, bad], { cwd: dir, encoding: "utf8", env });
    assert.equal(r.status, 2, `${bad}: ${r.stderr}`);
    assert.ok(r.stderr.includes(bad.split("=")[0]), r.stderr);
  }
  assert.equal(existsSync(join(dir, "docs/insights")), false, "a refused write leaves no file");
  const ok = spawnSync(process.execPath, [WRITER, "write", ...base, "started=2026-11-27T14:20:00Z", "ended=2026-11-27T14:30:00Z"], { cwd: dir, encoding: "utf8", env });
  assert.equal(ok.status, 0, ok.stderr);
});

test("AC-572-3: WHEN every record under docs/insights/ on main is checked THEN all of them still pass", () => {
  const top = join(REPO, "docs/insights");
  const files = readdirSync(top).flatMap((day) => readdirSync(join(top, day)).map((file) => `docs/insights/${day}/${file}`));
  assert.ok(files.length > 0);
  for (const file of files) assert.equal(recordProblem(file, readFileSync(join(REPO, file))), null, file);
});
