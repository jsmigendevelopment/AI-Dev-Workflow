// #427, part of #374: the weekly report buckets pull requests by the counted lines on their size-check records.
// AC-427-2: WHEN the report runs over records with sizes THEN each bucket shows its pull requests, how many were sent
// back and the rate; a pull request with no size record stays under unknown. The fixture week is 2026-W48 (Monday
// 2026-11-23 to Sunday 2026-11-29, UTC). The report's other sections are tested in insights-week.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp } from "./helpers.mjs";
import { dayFolder, fileName, validate } from "../src/insights-record.mjs";

const SKILL_SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/insights-week.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const NOW = "2026-12-01T09:00:00Z";
const sha = (pr) => String(pr % 10).repeat(40);

/** A valid record with the envelope filled in, the way the writer fills it. */
function rec(kind, at, fields) {
  const record = { v: 1, kind, at, issue: null, pr: null, sha: null, job: null, tool: null, model: "opus", effort: "medium", ...fields };
  assert.deepEqual(validate(record), [], JSON.stringify(record));
  return record;
}
/** A size check of pull request `pr`: pass, or fail with the size send-back. */
const counted = (at, pr, lines, outcome = "pass") =>
  rec("job", at, { job: "size-check", issue: pr - 40, pr, sha: sha(pr), lines, outcome, ...(outcome === "fail" ? { send_back: "size" } : {}) });
const review = (at, pr, outcome, more = {}) => rec("job", at, { job: "review-code", issue: pr - 40, pr, sha: sha(pr), outcome, ...more });

/** A folder with docs/insights/<day>/ holding the records, in the order given. */
function project(records) {
  const dir = tmp("onrails-week-size-");
  records.forEach((record, i) => {
    mkdirSync(join(dir, dayFolder(record)), { recursive: true });
    writeFileSync(join(dir, dayFolder(record), fileName(record, i.toString(16).padStart(6, "0"))), `${JSON.stringify(record, null, 2)}\n`);
  });
  return dir;
}
const report = (dir, ...args) => spawnSync(process.execPath, [SKILL_SCRIPT, "--week", "2026-W48", ...args], { cwd: dir, encoding: "utf8", env: safeEnv({ ONRAILS_NOW: NOW }) });

const WEEK = [
  // Under 500: #60 passed at 312; #61 was 1,200, sent back for size, and its last head is 450; #68 is 499. One of three sent back.
  counted("2026-11-23T09:00:00.000Z", 60, 312),
  review("2026-11-23T10:00:00.000Z", 60, "pass"),
  // Out of file order on purpose: the later check is listed first, and the report reads them by time.
  counted("2026-11-23T12:00:00.000Z", 61, 450),
  counted("2026-11-23T09:00:00.000Z", 61, 1200, "fail"),
  counted("2026-11-23T09:30:00.000Z", 68, 499),
  // 500 to 999: #62 is exactly 500, #63 is 999 and was sent back by review. One of two.
  counted("2026-11-24T09:00:00.000Z", 62, 500),
  counted("2026-11-24T09:30:00.000Z", 63, 999),
  review("2026-11-24T10:00:00.000Z", 63, "fail", { send_back: "review-must" }),
  // 1,000 or more: #64 is exactly 1,000 with a size exception (a pass), #65 is 1,500 and was sent back for size. One of two.
  counted("2026-11-25T09:00:00.000Z", 64, 1000),
  counted("2026-11-25T09:30:00.000Z", 65, 1500, "fail"),
  // Unknown: #66 has only a review, and #67's size record is from the week before. #67 was sent back by review.
  review("2026-11-25T11:00:00.000Z", 66, "pass"),
  counted("2026-11-18T09:00:00.000Z", 67, 200),
  review("2026-11-26T09:00:00.000Z", 67, "fail", { send_back: "review-must" }),
  // A local-mode size record has no pull request to bucket, and a pull request of the week after isn't this week's.
  rec("job", "2026-11-26T10:00:00.000Z", { job: "size-check", issue: 99, sha: "a".repeat(40), lines: 40, outcome: "pass" }),
  counted("2026-11-30T09:00:00.000Z", 69, 10),
];

test("AC-427-2: WHEN records hold sizes THEN each bucket shows its pull requests, how many were sent back and the rate, and a pull request with no size stays unknown", () => {
  const r = report(project(WEEK));
  assert.equal(r.status, 0, r.stderr);
  for (const row of [
    "| Size (counted lines) | Pull requests | Sent back | Rate |",
    "| under 500 | 3 | 1 | 33% |",
    "| 500 to 999 | 2 | 1 | 50% |",
    "| 1,000 or more | 2 | 1 | 50% |",
    "| unknown | 2 | 1 | 50% |",
    "| All sizes | 9 | 4 | 44% |",
  ]) assert.ok(r.stdout.includes(row), `${row}\n${r.stdout}`);
  assert.ok(r.stdout.includes("Sent back for size (1,000 or more at that head): #61, #65."), r.stdout);
});

test("AC-427-2: WHEN a pull request was checked more than once THEN its size is its last checked head's count in the week", () => {
  // #61: 1,200 then 450. Its size is 450, so it is under 500, and it still counts as sent back.
  const r = report(project(WEEK.filter((x) => x.pr === 61 || x.pr === 60)));
  assert.ok(r.stdout.includes("| under 500 | 2 | 1 | 50% |"), r.stdout);
  assert.ok(r.stdout.includes("| 1,000 or more | 0 | 0 | unknown |"), r.stdout);
  // The same, if the later head is the bigger one.
  const grew = report(project([counted("2026-11-23T09:00:00.000Z", 61, 450), counted("2026-11-23T12:00:00.000Z", 61, 1200, "fail")]));
  assert.ok(grew.stdout.includes("| under 500 | 0 | 0 | unknown |"), grew.stdout);
  assert.ok(grew.stdout.includes("| 1,000 or more | 1 | 1 | 100% |"), grew.stdout);
});

test("AC-427-2: WHEN a bucket has no pull request THEN it shows 0, 0 and an unknown rate; with no size at all every bucket is unknown", () => {
  const some = report(project([counted("2026-11-23T09:00:00.000Z", 60, 10), review("2026-11-23T10:00:00.000Z", 61, "pass")]));
  for (const row of ["| under 500 | 1 | 0 | 0% |", "| 500 to 999 | 0 | 0 | unknown |", "| 1,000 or more | 0 | 0 | unknown |", "| unknown | 1 | 0 | 0% |"]) {
    assert.ok(some.stdout.includes(row), `${row}\n${some.stdout}`);
  }
  const none = report(project([review("2026-11-23T10:00:00.000Z", 61, "fail", { send_back: "review-must" })]));
  for (const row of ["| under 500 | unknown | unknown | unknown |", "| 500 to 999 | unknown | unknown | unknown |", "| 1,000 or more | unknown | unknown | unknown |",
    "| unknown | 1 | 1 | 100% |", "| All sizes | 1 | 1 | 100% |"]) assert.ok(none.stdout.includes(row), `${row}\n${none.stdout}`);
});

test("AC-427-2: WHEN a size record isn't valid THEN its pull request stays unknown", () => {
  const dir = project([review("2026-11-23T10:00:00.000Z", 61, "pass")]);
  const bad = { ...counted("2026-11-23T09:00:00.000Z", 61, 450), lines: "450" };
  mkdirSync(join(dir, dayFolder(bad)), { recursive: true });
  writeFileSync(join(dir, dayFolder(bad), "0900-job-61-ffffff.json"), `${JSON.stringify(bad)}\n`);
  const r = report(dir);
  assert.ok(r.stdout.includes("| unknown | 1 | 0 | 0% |"), r.stdout);
  assert.ok(r.stdout.includes("1 file skipped: not a valid record."), r.stdout);
});

test("AC-427-2: WHEN the CLI's insights --week runs THEN it buckets the sizes the same way", () => {
  const dir = project(WEEK);
  const cli = spawnSync(process.execPath, [CLI, "insights", "--week", "2026-W48", dir], { encoding: "utf8", env: safeEnv({ ONRAILS_NOW: NOW }) });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, report(dir).stdout);
  assert.ok(cli.stdout.includes("| under 500 | 3 | 1 | 33% |"), cli.stdout);
});
