// The merge step's record check (#333, part of #281 item 6): `insights.mjs has-records --pr <n> --sha <sha>` exits 0
// only when the coordinator's checkout of main has a job, a check and a review record for that pull request at that
// exact head sha. The name keeps it apart from `land --verify <pr>` (decision 333-1). A copy of the coordinate scripts
// runs in a temp git repo standing in for that checkout, next to fake gh, claude and codex: no call is expected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmp, unixOnly } from "./helpers.mjs";
import { validate } from "../src/insights-record.mjs";
import { JOB, REPO, REVIEW, SCRIPTS, SHA, git, json, pathOf, put, record, run } from "./insights-land-fakes.mjs";

const OLDER = "b".repeat(40);
const CHECK = record("check", {
  job: null, tool: null, state: "success", fence: "Fence: bubblewrap",
  commands: [{ name: "pnpm check", result: "pass", seconds: 42 }], failed_step: null, flaky_rerun: false,
});
/** The builder's finish record names the commit before it, so it never matches the head (#330). */
const BUILD = record("job", { job: "build", sha: OLDER, outcome: "finished" });

/** A temp git repo standing in for the coordinator's checkout of main, holding `records` and the coordinate scripts. */
function checkout(records) {
  const dir = tmp("onrails-has-records-");
  git(dir, "init", "-q", "-b", "main");
  cpSync(join(REPO, SCRIPTS), join(dir, SCRIPTS), { recursive: true });
  records.forEach((r, i) => {
    assert.deepEqual(validate(r), [], `fixture ${JSON.stringify(r)}`);
    put(dir, pathOf(r, `${i}`.padStart(6, "0")), json(r));
  });
  return dir;
}

const hasRecords = (dir, pr = "40", sha = SHA) => run(dir, ["has-records", "--pr", pr, "--sha", sha]);

test("AC-333-1: WHEN the checkout has job, check and review records for PR 40 at <sha> THEN has-records --pr 40 --sha <sha> exits 0", unixOnly, () => {
  const r = hasRecords(checkout([BUILD, JOB, CHECK, REVIEW]));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(SHA), `names the sha: ${r.stdout}`);
  assert.equal(r.calls, "", "no gh call");
});

test("AC-333-2: WHEN the review record names an older sha of PR 40 THEN has-records exits 1 and names review", unixOnly, () => {
  const r = hasRecords(checkout([JOB, CHECK, { ...REVIEW, sha: OLDER }]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /\breview\b/);
  assert.doesNotMatch(r.stderr, /no (job|check) record/, "only review is missing");
});

test("AC-333-3: WHEN no check record exists for PR 40 THEN has-records exits 1 and names check", unixOnly, () => {
  const r = hasRecords(checkout([JOB, REVIEW, { ...CHECK, pr: 41 }]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /\bcheck\b/);
  assert.doesNotMatch(r.stderr, /no (job|review) record/, "only check is missing");
});

test("has-records: the builder's finish record and another pull request's records don't count, and every missing kind is named", unixOnly, () => {
  const r = hasRecords(checkout([BUILD, { ...JOB, pr: 41 }, { ...CHECK, pr: 41 }, { ...REVIEW, pr: 41 }]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  for (const kind of ["job", "check", "review"]) assert.match(r.stderr, new RegExp(`no ${kind} record`));
});

test("has-records: an invalid record file and a records folder that isn't there count as missing, not as an error", unixOnly, () => {
  const dir = checkout([CHECK, REVIEW]);
  put(dir, pathOf(JOB, "ffffff"), json({ ...JOB, outcome: "done" }));
  const bad = hasRecords(dir);
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stderr, /no job record/);
  const empty = hasRecords(checkout([]));
  assert.equal(empty.status, 1, empty.stdout + empty.stderr);
});

test("has-records: a record land would leave out counts as missing: a folder that isn't a day, another day's folder, or JSON not in the writer's bytes", unixOnly, () => {
  const cases = [
    ["a folder that isn't a day", (dir) => put(dir, "docs/insights/not-a-day/1410-review-40-abcdef.json", json(REVIEW))],
    ["another day's folder", (dir) => put(dir, "docs/insights/2026-11-26/1410-review-40-abcdef.json", json(REVIEW))],
    ["compact JSON", (dir) => put(dir, pathOf(REVIEW, "abcdef"), `${JSON.stringify(REVIEW)}\n`)],
  ];
  for (const [why, place] of cases) {
    const dir = checkout([JOB, CHECK]);
    place(dir);
    const r = hasRecords(dir);
    assert.equal(r.status, 1, `${why}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /no review record/, why);
  }
});

test("has-records: a board record doesn't stand in for the reviewer's line", unixOnly, () => {
  const board = { v: 1, kind: "review", at: REVIEW.at, issue: 12, pr: 40, sha: SHA, job: null, tool: null, model: "unknown", effort: "unknown", source: "board" };
  const r = hasRecords(checkout([JOB, CHECK, board]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /no review record/);
});

test("has-records: a broken checkout exits 2, not 1, so no job is re-run for nothing", unixOnly, () => {
  const outside = tmp("onrails-no-git-");
  cpSync(join(REPO, SCRIPTS), join(outside, SCRIPTS), { recursive: true });
  const noGit = hasRecords(outside);
  assert.equal(noGit.status, 2, `outside a git repo: ${noGit.stdout}${noGit.stderr}`);

  const dir = checkout([]);
  rmSync(join(dir, "docs/insights"), { recursive: true, force: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs/insights"), "not a folder\n");
  const notFolder = hasRecords(dir);
  assert.equal(notFolder.status, 2, `docs/insights is a file: ${notFolder.stdout}${notFolder.stderr}`);
  assert.doesNotMatch(notFolder.stderr, /at .*\.mjs:\d+/, "no stack trace");
});

test("has-records: a usage error exits 2 and names the usage", unixOnly, () => {
  const dir = checkout([JOB, CHECK, REVIEW]);
  for (const args of [["has-records"], ["has-records", "--pr", "40"], ["has-records", "--pr", "x", "--sha", SHA], ["has-records", "--pr", "40", "--sha", "abc"], ["has-records", "--pr", "40", "--sha", SHA, "junk"]]) {
    const r = run(dir, args);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /has-records --pr <n> --sha <sha>/);
  }
});

/** coordinate's merge step: from "7. **Merge" up to step 8. */
function mergeStep() {
  const text = readFileSync(join(REPO, ".agents/skills/coordinate/SKILL.md"), "utf8");
  const start = text.indexOf("7. **Merge through one queue");
  assert.ok(start > 0, "coordinate has its merge step");
  return text.slice(start, text.indexOf("\n8. **", start));
}

test("AC-333-4: WHEN coordinate/SKILL.md's merge step is read THEN it runs has-records, merges only on exit 0, and says to re-run the missing job, never to write the record by hand", () => {
  const step = mergeStep();
  assert.match(step, /insights\.mjs has-records --pr <n> --sha <sha>/);
  assert.match(step, /insights\.mjs harvest[\s\S]*insights\.mjs has-records/, "harvest comes first");
  assert.match(step, /[Mm]erge only on (its )?exit 0/);
  assert.match(step, /[Nn]ever write (a|the) (missing )?record/);
  assert.match(step, /run (the gate|step 6\.1)[^.]*again/i, "the gate makes a missing check record");
  assert.match(step, /fresh `pr-review`/, "a fresh review makes a missing job or review record");
  assert.match(step, /Full included/, "it holds on every level");
  assert.match(step, /records-only pull request/, "the records pull request is exempt");
});

test("AC-333-4: WHEN the merge step merged main into the branch THEN carry runs between harvest and has-records, the checks re-run on the merge commit, and only exit 1 sends it to a fresh review", () => {
  const step = mergeStep();
  assert.match(step, /run step 6\.1 again on that merge commit/, "the gate still runs on the merge commit");
  assert.match(step, /insights\.mjs harvest[\s\S]*insights\.mjs carry --pr <n> --from <reviewed sha> --to <merge sha>[\s\S]*insights\.mjs has-records/);
  assert.match(step, /carry[^\n]*[Ee]xit 1[^\n]*fresh `pr-review`/, "a merge carry refuses goes to a fresh review");
  assert.doesNotMatch(step, /conflict fix or not/, "a clean merge of main needs no fresh review (decision 333-2)");
});

test("AC-333-4: WHEN carry exits 0 THEN the old head's qa and security verdicts stand for the merge commit too, and step 6 says so", () => {
  assert.match(mergeStep(), /`carry` exits 0[^\n]*`qa` and security verdicts stand for the merge commit/);
  const text = readFileSync(join(REPO, ".agents/skills/coordinate/SKILL.md"), "utf8");
  assert.match(text, /A verdict stands until the commit changes\. Never re-run a reviewer to get a different answer\. A clean merge of main that step 7's `carry` proves doesn't count as a change: the old head's verdicts stand for the merge commit\./);
});

test("AC-333-4: WHEN carry exits 2 THEN the merge step fetches the branch and runs carry once more in the same step", () => {
  assert.match(mergeStep(), /exit 2: fetch the branch and run `carry` once more now/);
});

test("AC-333-4: WHEN carry exits 2 a second time on the same merge sha THEN the merge step sends it to a fresh review with one FYI, so it never retries forever", () => {
  assert.match(mergeStep(), /carry[^\n]*second exit 2 on the same merge sha[^\n]*fresh `pr-review`[^\n]*FYI/);
});

/** The stderr line that names `kind` as missing. */
const hintFor = (stderr, kind) => stderr.split("\n").find((l) => l.includes(`no ${kind} record`));

test("AC-551-1: WHEN has-records --pr reports a missing check record THEN its hint names mark-check --record and harvest as the two routes and doesn't end in 'Then harvest.', while the job and review hints keep it", unixOnly, () => {
  const none = hasRecords(checkout([]));
  assert.equal(none.status, 1, none.stdout + none.stderr);
  const check = hintFor(none.stderr, "check");
  assert.ok(check, none.stderr);
  assert.doesNotMatch(check, /Then harvest\.$/, "the check hint doesn't end with the job and review tail");
  assert.match(check, /mark-check\.mjs --record/, "route 1: the gate writes the record");
  assert.match(check, /or harvest if a `Checks:` or `Code review:` comment at this sha carries the check line\.$/, "route 2: harvest, only when a comment carries it");
  for (const kind of ["job", "review"]) {
    assert.match(hintFor(none.stderr, kind), /fresh pr-review: its verdict comment carries the \w+ line\. Then harvest\.$/, `${kind} keeps Then harvest.`);
  }
  // Each kind on its own, so the line under test is the only one missing.
  for (const [gone, left] of [["job", [CHECK, REVIEW]], ["check", [JOB, REVIEW]], ["review", [JOB, CHECK]]]) {
    const r = hasRecords(checkout(left));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(hintFor(r.stderr, gone)?.endsWith("Then harvest."), gone !== "check", `${gone}: ${r.stderr}`);
  }
});

test("AC-551-1: WHEN has-records --issue reports a missing check record THEN its hint is unchanged: the gate again, no harvest", unixOnly, () => {
  const r = run(checkout([]), ["has-records", "--issue", "12", "--sha", SHA]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(hintFor(r.stderr, "check"), /: no check record\. run the local gate \(coordinate step 6\.1\) on this sha again: mark-check\.mjs --record writes it\.$/);
  assert.doesNotMatch(r.stderr, /harvest/);
});
