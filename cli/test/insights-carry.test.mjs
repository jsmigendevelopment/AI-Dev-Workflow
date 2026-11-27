// The merge step's review carry (#333, decision 333-2): when the loop merges main into a reviewed branch, `insights.mjs
// carry --pr <n> --from <reviewed sha> --to <merge sha>` proves the merge commit is a clean merge of main and nothing
// else, then writes the job and review records for the merge commit through the writer. Anything else exits 1 and the
// merge commit goes to a fresh pr-review. The set-up is in insights-carry-fakes.mjs; fake gh, claude and codex log any
// call, and none is expected. The isolation of carry's git is in insights-carry-isolation.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../src/insights-record.mjs";
import { unixOnly } from "./helpers.mjs";
import { CLASH, FEAT, at, carry, conflictFix, handEdit, mergeMain, oldGitCarry, push, refuses, reviewed, state } from "./insights-carry-fakes.mjs";
import { JOB, REVIEW, branch, git, json, pathOf, put, record, records, run } from "./insights-land-fakes.mjs";

test("AC-333-4 carry: WHEN main is merged cleanly into a reviewed branch THEN carry writes a carry-review job and a copy of the review at the merge sha, and has-records passes", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  assert.equal(run(fx.dir, ["has-records", "--pr", "40", "--sha", to]).status, 1, "nothing at the merge sha yet");

  const r = carry(fx.dir, fx.from, to);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.calls, "", "no gh call");
  const made = at(fx.dir, to);
  assert.equal(made.length, 2, JSON.stringify(made));
  const job = made.find((m) => m.kind === "job");
  const review = made.find((m) => m.kind === "review");
  assert.equal(job.job, "carry-review");
  assert.equal(job.outcome, "pass");
  assert.equal(job.pr, 40);
  for (const field of ["issue", "pr", "round", "verdict", "must", "nice", "categories", "model", "effort", "tool"]) {
    assert.deepEqual(review[field], REVIEW[field], `the copy keeps ${field}`);
  }
  assert.equal(review.job, "carry-review", "the copy says it was carried");
  for (const m of made) assert.deepEqual(validate(m), []);

  // The gate re-runs on the merge commit and writes its own check record there; carry never makes one.
  const check = record("check", { sha: to, job: null, tool: null, commands: [{ name: "pnpm check", result: "pass", seconds: 9 }], failed_step: null, flaky_rerun: false });
  put(fx.dir, pathOf(check, "c00001"), json(check));
  const has = run(fx.dir, ["has-records", "--pr", "40", "--sha", to]);
  assert.equal(has.status, 0, has.stderr);
  const again = carry(fx.dir, fx.from, to);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(at(fx.dir, to).length, 3, "a rerun writes nothing new");
});

test("carry: a conflict fix exits 1 and goes to a fresh review", unixOnly, () => {
  refuses("a conflict fix", /conflicts/, conflictFix, CLASH);
});

test("carry: a hand edit inside a clean merge exits 1", unixOnly, () => {
  refuses("a hand edit", /change of its own/, handEdit);
});

test("carry: a merge whose first parent isn't the reviewed sha exits 1", unixOnly, () => {
  refuses("parents swapped", /first parent/, (fx) => {
    git(fx.seed, "checkout", "-q", "--detach", "origin/main");
    git(fx.seed, "merge", "-q", "--no-edit", FEAT);
    return push(fx);
  });
});

test("carry: a plain commit, not a merge, exits 1", unixOnly, () => {
  refuses("one parent", /1 parent/, (fx) => {
    put(fx.seed, "more.txt", "more\n");
    git(fx.seed, "add", "more.txt");
    git(fx.seed, "commit", "-q", "-m", "more");
    return push(fx);
  });
});

test("carry: a merge of a branch that isn't on main exits 1", unixOnly, () => {
  refuses("second parent off main", /isn't on origin\/main/, (fx) => {
    branch(fx.seed, "side", { "side.txt": "side\n" }, fx.from);
    git(fx.seed, "checkout", "-q", FEAT);
    git(fx.seed, "merge", "-q", "--no-ff", "--no-edit", "side");
    return push(fx);
  });
});

test("carry: a reviewed sha with no review record exits 1", unixOnly, () => {
  refuses("no review at from", /no job and review records/, mergeMain, { records: false });
});

const CHANGES = { ...REVIEW, verdict: "changes", must: 1 };

test("carry: a reviewed sha whose review asked for changes exits 1 and writes nothing", unixOnly, () => {
  refuses("a changes review", /review didn't pass/, mergeMain, { held: [{ ...JOB, outcome: "fail" }, CHANGES] });
});

test("carry: a pass that follows a changes review at the same sha still exits 1: every review there counts", unixOnly, () => {
  const earlier = { ...CHANGES, at: "2026-11-27T14:00:00.000Z" };
  refuses("a pass after a changes", /review didn't pass/, mergeMain, { held: [JOB, earlier, REVIEW] });
});

test("carry: a failed review job at the reviewed sha exits 1, even next to a passing review", unixOnly, () => {
  refuses("a failed review job", /review didn't pass/, mergeMain, { held: [{ ...JOB, outcome: "fail" }, REVIEW] });
});

test("carry: a merge of three parents exits 1", unixOnly, () => {
  refuses("an octopus merge", /3 parent/, (fx) => {
    branch(fx.seed, "side", { "side.txt": "side\n" }, "origin/main~1");
    git(fx.seed, "checkout", "-q", FEAT);
    git(fx.seed, "merge", "-q", "--no-edit", "origin/main", "side");
    return push(fx);
  });
});

/** A merge of a side commit that isn't on main, with a `kind` (tag or branch) named origin/main on it in the clone. */
function shadowed(kind) {
  refuses(`a ${kind} named origin/main`, /isn't on origin\/main/, (fx) => {
    const side = branch(fx.seed, "side", { "side.txt": "side\n" }, fx.from);
    git(fx.seed, "checkout", "-q", FEAT);
    git(fx.seed, "merge", "-q", "--no-ff", "--no-edit", "side");
    const to = push(fx);
    git(fx.dir, kind, "origin/main", side);
    return to;
  });
}

test("carry: a tag named origin/main on a commit that isn't on main doesn't count as main", unixOnly, () => shadowed("tag"));
test("carry: a local branch named origin/main on a commit that isn't on main doesn't count as main", unixOnly, () => shadowed("branch"));

test("carry: a git without merge-tree --write-tree proves the merge in a throwaway clone and carries the same, leaving the checkout as it was", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const before = state(fx.dir);
  const r = oldGitCarry(fx.dir, fx.from, to);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const made = at(fx.dir, to);
  assert.deepEqual(made.map((m) => `${m.kind}:${m.job}`).sort(), ["job:carry-review", "review:carry-review"]);
  assert.equal(state(fx.dir), before, "no ref, index or file of the checkout changed");
});

test("carry: under a git without merge-tree --write-tree, a hand edit and a conflict fix still exit 1", unixOnly, () => {
  refuses("a hand edit, old git", /change of its own/, handEdit, undefined, oldGitCarry);
  refuses("a conflict fix, old git", /conflicts/, conflictFix, CLASH, oldGitCarry);
});

test("carry: a merge sha that already has a changes review exits 1, never says carried", unixOnly, () => {
  refuses("a changes review at the merge sha", /merge commit's own review didn't pass/, (fx) => {
    const to = mergeMain(fx);
    const own = { ...REVIEW, sha: to, verdict: "changes", must: 2, at: "2026-11-27T14:20:00.000Z" };
    put(fx.dir, pathOf(own, "b00001"), json(own));
    put(fx.dir, pathOf({ ...JOB, sha: to, outcome: "fail", at: own.at }, "b00002"), json({ ...JOB, sha: to, outcome: "fail", at: own.at }));
    return to;
  });
});

test("carry: a usage error or an unknown commit exits 2 and writes nothing", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const before = Object.keys(records(fx.dir)).length;
  const cases = [
    ["carry", "--pr", "40", "--from", fx.from],
    ["carry", "--pr", "40", "--from", fx.from.slice(0, 12), "--to", to],
    ["carry", "--pr", "40", "--from", "--to", "--to", to],
    ["carry", "--pr", "x", "--from", fx.from, "--to", to],
    ["carry", "--pr", "40", "--from", fx.from, "--to", to, "junk"],
    ["carry", "--pr", "40", "--from", fx.from, "--to", "d".repeat(40)],
  ];
  for (const args of cases) {
    const r = run(fx.dir, args);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    const unknown = args.at(-1) === "d".repeat(40);
    assert.match(r.stderr, unknown ? /isn't a commit/ : /insights\.mjs carry --pr <n> --from/, `${args.join(" ")}: carry's own message`);
  }
  assert.equal(Object.keys(records(fx.dir)).length, before);
});
