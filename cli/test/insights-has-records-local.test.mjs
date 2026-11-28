// Local mode's record check (#415, part of #281): there is no pull request, so `insights.mjs has-records --issue <n>
// --sha <sha>` exits 0 only when the checkout of main has a job, a check and a review record for that issue at that
// exact sha, and `coordinate`'s local-mode merge step runs it before `git merge --no-ff` (decision 415-1). Same
// set-up as insights-has-records.test.mjs: a copy of the coordinate scripts in a temp git repo, next to fake gh,
// claude and codex, none of which may be called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmp, unixOnly } from "./helpers.mjs";
import { validate } from "../src/insights-record.mjs";
import { JOB, REPO, REVIEW, SCRIPTS, SHA, git, json, pathOf, put, record, run } from "./insights-land-fakes.mjs";

const OLDER = "b".repeat(40);
const KINDS = ["job", "check", "review"];
// Local mode's records carry the issue and no pull request (#424's job=size-check ... pr=null).
const local = (r, fields = {}) => ({ ...r, pr: null, ...fields });
const RECORDS = {
  job: local(JOB),
  check: local(record("check", {
    job: null, tool: null, state: "success", commands: [{ name: "npm test", result: "pass", seconds: 4 }], failed_step: null, flaky_rerun: false,
  })),
  review: local(REVIEW),
};

/** A temp git repo standing in for the checkout of main, holding `records` and the coordinate scripts. */
function checkout(records) {
  const dir = tmp("onrails-has-records-local-");
  git(dir, "init", "-q", "-b", "main");
  cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  records.forEach((r, i) => {
    assert.deepEqual(validate(r), [], `fixture ${JSON.stringify(r)}`);
    put(dir, pathOf(r, `${i}`.padStart(6, "0")), json(r));
  });
  return dir;
}

const hasRecords = (dir, issue = "12", sha = SHA) => run(dir, ["has-records", "--issue", issue, "--sha", sha]);

test("AC-415-2: WHEN a local-mode checkout has job, check and review records for issue 12 at <sha> THEN has-records --issue 12 --sha <sha> exits 0", unixOnly, () => {
  const r = hasRecords(checkout(KINDS.map((k) => RECORDS[k])));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(SHA), `names the sha: ${r.stdout}`);
  assert.match(r.stdout, /issue #12/);
  assert.equal(r.calls, "", "no gh call");
});

for (const gone of KINDS) {
  test(`AC-415-2: WHEN the ${gone} record of issue 12 is gone THEN has-records --issue exits 1 and names ${gone} only`, unixOnly, () => {
    const r = hasRecords(checkout(KINDS.filter((k) => k !== gone).map((k) => RECORDS[k])));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, new RegExp(`no ${gone} record`));
    for (const other of KINDS.filter((k) => k !== gone)) assert.doesNotMatch(r.stderr, new RegExp(`no ${other} record`), `${other} is there`);
  });
}

test("AC-415-2: WHEN the records are another issue's, another sha's, a board record or the builder's finish THEN they don't count and every missing kind is named", unixOnly, () => {
  const board = local(RECORDS.review, { source: "board" });
  const build = local(JOB, { job: "build", sha: OLDER, outcome: "finished" });
  const r = hasRecords(checkout([
    build, local(RECORDS.job, { issue: 13 }), local(RECORDS.check, { issue: 13 }), local(RECORDS.review, { sha: OLDER }), board,
  ]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  for (const kind of KINDS) assert.match(r.stderr, new RegExp(`no ${kind} record`));
});

test("has-records --issue: the hints never send local mode to harvest, which needs GitHub's API", unixOnly, () => {
  const r = hasRecords(checkout([]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /harvest/);
  assert.match(r.stderr, /don't merge issue #12 yet/);
});

test("has-records: the pull request form is unchanged, and still points at harvest", unixOnly, () => {
  const r = run(checkout([]), ["has-records", "--pr", "40", "--sha", SHA]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /Then harvest/);
});

test("AC-415-2: WHEN a local-mode job, check and review are written with insights.mjs write THEN has-records --issue exits 0 on that sha", unixOnly, () => {
  const dir = checkout([]);
  const common = ["issue=12", "pr=null", `sha=${SHA}`];
  const writes = [
    ["job", "job=review-code", "outcome=pass", "tool=claude-code"],
    ["check", "state=success", `commands=${JSON.stringify([{ name: "npm test", result: "pass", seconds: 4 }])}`],
    ["review", "job=review-code", "tool=claude-code", "round=1", "verdict=pass", "must=0", "nice=0"],
  ];
  for (const [kind, ...fields] of writes) {
    const w = run(dir, ["write", kind, ...common, ...fields]);
    assert.equal(w.status, 0, `write ${kind}: ${w.stdout}${w.stderr}`);
  }
  const r = hasRecords(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("has-records --issue: a usage error exits 2 and names the usage; --pr and --issue never mix", unixOnly, () => {
  const dir = checkout(KINDS.map((k) => RECORDS[k]));
  const bad = [
    ["has-records", "--issue", "12"], ["has-records", "--issue", "x", "--sha", SHA], ["has-records", "--issue", "12", "--sha", "abc"],
    ["has-records", "--issue", "12", "--sha", SHA, "junk"], ["has-records", "--issue", "12", "--pr", "40", "--sha", SHA],
  ];
  for (const args of bad) {
    const r = run(dir, args);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /has-records --issue <n> --sha <sha>/);
  }
});

/** local-mode.md's "No remote" merge step: from "5. **Merge" up to step 6. */
function mergeStep() {
  const text = readFileSync(join(REPO, ".agents/skills/coordinate/references/local-mode.md"), "utf8");
  const section = text.indexOf("## No remote");
  const start = text.indexOf("5. **Merge the reviewed commit", section);
  assert.ok(start > section && section > 0, "local mode has its merge step under No remote");
  return text.slice(start, text.indexOf("\n6. **", start));
}

test("AC-415-1: WHEN local mode's merge step is read THEN it runs the record check before the merge and merges only on exit 0", () => {
  const step = mergeStep();
  const check = step.indexOf("insights.mjs has-records --issue <n> --sha <sha>");
  assert.ok(check > 0, "it runs has-records --issue <n> --sha <sha>");
  assert.ok(check < step.indexOf("git merge --no-ff"), "the check comes before the merge");
  assert.match(step, /[Mm]erge only on (its )?exit 0/);
  assert.match(step, /[Nn]ever write (a|the) (missing )?record/);
  assert.match(step, /Full included/, "it holds on every level");
});

test("AC-415-1: WHEN local mode's merge step is read THEN a missing check record sends the sha back to the gate and a missing job or review record to a fresh pr-review", () => {
  const step = mergeStep();
  assert.match(step, /No `check` record: run step 4 on that sha again/);
  assert.match(step, /No `job` or `review` record: send that sha to a fresh `pr-review`/);
});

test("AC-415-1: WHEN local mode's gate step is read THEN it says how a check record is written, with the issue and no pull request", () => {
  const text = readFileSync(join(REPO, ".agents/skills/coordinate/references/local-mode.md"), "utf8");
  assert.match(text, /insights\.mjs write check issue=<n> pr=null sha=<sha>/);
});
