// #441 (follow-up to #417): harvest keeps a `check` line only from the comment that reports the run. In the kit's repo
// the builder, the reviewer and the coordinator post as one login, so the login can't say which comment a line came
// from. Two comments report a run: the merge helper's, whose first line is `Checks: pass|fail @ <sha>`, and the
// reviewer's one verdict comment, whose first line is `Code review: approve|request changes @ <sha>` and which holds
// its `Checks: pass|fail @ <sha>` line further down (pr-review, "Verdict"). Both shapes are copied from the loop's
// real comments. The IDs here are made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unixOnly } from "./helpers.mjs";
import { toLine, validate } from "../src/insights-record.mjs";
import { JOB, ME, ME_ID, OLD, REVIEW, SHA, pathOf, record, records, run, setup } from "./insights-land-fakes.mjs";

const COMMENTS = "repos/acme/app/issues/40/comments";
const OTHER = "d".repeat(40);
const COMMANDS = [{ name: "node scripts/sync-skills.mjs --check", result: "pass", seconds: 1 }];
const PASS = record("check", { commands: COMMANDS, failed_step: null, flaky_rerun: false, state: "success", fence: "bubblewrap" });
const FAIL = record("check", {
  commands: [{ name: "cd cli && npm test", result: "fail", seconds: 9 }], failed_step: "cd cli && npm test", flaky_rerun: false, state: "failure",
});
const harvest = (dir, body) => run(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { [COMMENTS]: [{ id: 7, user: { login: ME, id: ME_ID }, body }] });
const fresh = (dir) => Object.entries(records(dir)).filter(([p]) => p !== pathOf(OLD)).map(([, rec]) => rec);
const checks = (dir) => fresh(dir).filter((rec) => rec.kind === "check");

/** The reviewer's verdict comment, in the shape pr-review's "Verdict" gives: the checks verdict is not the first line. */
const reviewerComment = ({ reviewed = SHA, verdict = `Checks: pass @ ${SHA}`, lines = [toLine(JOB), toLine(REVIEW), toLine(PASS)] } = {}) => [
  `Code review: approve @ ${reviewed}`, "Needs the person: no.", "", "Read from the diff, the issue and the check results only.", "",
  `Review: pass @ ${reviewed}`, verdict, `Weakening review: pass @ ${reviewed}`, "", ...lines,
].join("\n");

test("fixtures: the records here are valid", () => {
  for (const r of [PASS, FAIL]) assert.deepEqual(validate(r), [], JSON.stringify(r));
});

test("AC-441-1: WHEN a comment whose first line isn't Checks: pass|fail @ <sha> holds a check line THEN harvest skips it, names it, and exits 0", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, `Built it. All the checks passed on my side.\n\n${toLine(PASS)}`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), [], "no check record written");
  assert.match(r.stderr, /skipped a line in comment 7 by loop-bot: .*check/);
  assert.match(r.stderr, /Checks: pass\|fail @ <sha>/, "says what the comment needed");
});

test("AC-441-1: WHEN a reviewer comment's first line is a verdict but it has no Checks: line THEN its check line is skipped and named", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, [`Code review: approve @ ${SHA}`, "Needs the person: no.", "", `Review: pass @ ${SHA}`, "", toLine(PASS)].join("\n"));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(r.stderr, /comment 7 by loop-bot: .*no `Checks: pass\|fail @ <sha>` line/);
});

test("AC-441-1: WHEN the Checks: text is quoted or indented, not at the start of a line, THEN it doesn't count", unixOnly, () => {
  const { dir } = setup();
  const quoted = harvest(dir, reviewerComment({ verdict: `> Checks: pass @ ${SHA}` }));
  assert.equal(quoted.status, 0, quoted.stderr);
  const indented = harvest(dir, reviewerComment({ verdict: `  Checks: pass @ ${SHA}` }));
  assert.equal(indented.status, 0, indented.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(quoted.stderr, /no `Checks: pass\|fail @ <sha>` line/);
});

test("AC-441-1: WHEN a comment has two Checks: lines THEN its check line is skipped and named as unclear", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, reviewerComment({ verdict: `Checks: fail @ ${SHA}\nChecks: pass @ ${SHA}` }));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(r.stderr, /two or more Checks: lines/);
});

test("AC-441-1: other kinds in the same stray comment are kept, as before", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, `A note.\n\n${toLine(JOB)}\n${toLine(REVIEW)}\n${toLine(PASS)}`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir).map((rec) => rec.kind).sort(), ["job", "review"]);
});

test("AC-441-2: WHEN the comment's first line is Checks: pass @ another sha THEN harvest skips the line and names both shas", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, `Checks: pass @ ${OTHER}\n\n${toLine(PASS)}`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(r.stderr, new RegExp(`skipped a line in comment 7 by loop-bot: .*${OTHER}.*${SHA}`));
});

test("AC-441-2: WHEN a reviewer comment's Checks: line names another sha THEN harvest skips the line and names both shas", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, reviewerComment({ verdict: `Checks: pass @ ${OTHER}` }));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(r.stderr, new RegExp(`${OTHER}.*${SHA}`));
});

test("AC-441-2: WHEN a reviewer comment reviews another sha than the record's THEN harvest skips the line and names both shas", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, reviewerComment({ reviewed: OTHER }));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), []);
  assert.match(r.stderr, new RegExp(`reviews ${OTHER}.*${SHA}`));
});

test("AC-441-2: WHEN the first line says pass but the record's state is failure, or fail and success, THEN harvest skips the line and names why", unixOnly, () => {
  const { dir } = setup();
  const redRecord = harvest(dir, `Checks: pass @ ${SHA}\n\n${toLine(FAIL)}`);
  assert.equal(redRecord.status, 0, redRecord.stderr);
  assert.match(redRecord.stderr, /Checks: pass .*state failure/);
  const greenRecord = harvest(dir, `Checks: fail @ ${SHA}\n\n${toLine(PASS)}`);
  assert.equal(greenRecord.status, 0, greenRecord.stderr);
  assert.match(greenRecord.stderr, /Checks: fail .*state success/);
  const reviewer = harvest(dir, reviewerComment({ verdict: `Checks: fail @ ${SHA}` }));
  assert.equal(reviewer.status, 0, reviewer.stderr);
  assert.match(reviewer.stderr, /Checks: fail .*state success/);
  assert.deepEqual(checks(dir), []);
});

test("AC-441-3: WHEN the first line is Checks: pass @ <sha> with the record's sha and state success THEN harvest keeps it", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, `Checks: pass @ ${SHA}\nFence: bubblewrap\n- node scripts/sync-skills.mjs --check: pass\n\n${toLine(PASS)}`);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /skipped/);
  assert.deepEqual(checks(dir), [PASS]);
  assert.match(r.stdout, /-check-40-[0-9a-f]{6}\.json/);
});

test("AC-441-3: WHEN the first line is Checks: fail @ <sha> with the record's sha and state failure THEN harvest keeps it", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, `Checks: fail @ ${SHA}\n\n${toLine(FAIL)}`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), [FAIL]);
});

test("AC-441-3: WHEN a reviewer's one verdict comment names the record's sha in both lines THEN harvest keeps its job, review and check lines", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, reviewerComment());
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /skipped/);
  assert.deepEqual(fresh(dir).map((rec) => rec.kind).sort(), ["check", "job", "review"]);
  assert.deepEqual(checks(dir), [PASS]);
});

test("AC-441-3: WHEN a reviewer's comment says request changes and Checks: fail with a failure record THEN harvest keeps it", unixOnly, () => {
  const { dir } = setup();
  const body = reviewerComment({ verdict: `Checks: fail @ ${SHA}`, lines: [toLine(FAIL)] }).replace("Code review: approve", "Code review: request changes");
  const r = harvest(dir, body);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(checks(dir), [FAIL]);
});
