// The merge step's review carry (#333, decision 333-2): when the loop merges main into a reviewed branch, `insights.mjs
// carry --pr <n> --from <reviewed sha> --to <merge sha>` proves the merge commit is a clean merge of main and nothing
// else, then writes the job and review records for the merge commit through the writer. Anything else exits 1 and the
// merge commit goes to a fresh pr-review. A temp bare remote and the coordinator's clone stand in for GitHub; fake gh,
// claude and codex log any call, and none is expected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { safeEnv, unixOnly } from "./helpers.mjs";
import { validate } from "../src/insights-record.mjs";
import { JOB, REVIEW, branch, git, json, pathOf, put, record, records, run, setup } from "./insights-land-fakes.mjs";

const FEAT = "feat/40-share";
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "loop", GIT_AUTHOR_EMAIL: "loop@example.invalid", GIT_COMMITTER_NAME: "loop", GIT_COMMITTER_EMAIL: "loop@example.invalid",
};

/**
 * A reviewed branch (`from`) and main moved on after it. `feature` and `onMain` are the files each side adds; the
 * coordinator's clone has fetched both and holds the reviewer's job and review records for `from`, unless `reviewed`
 * is false (then only the job record).
 */
function reviewed({ feature = { "app.txt": "feature\n" }, onMain = { "main.txt": "main\n" }, records: keep = true } = {}) {
  const { dir, seed } = setup();
  const from = branch(seed, FEAT, feature);
  branch(seed, "main", onMain);
  git(seed, "checkout", "-q", FEAT);
  git(seed, "fetch", "-q", "origin");
  const at = (r) => ({ ...r, sha: from });
  put(dir, pathOf(at(JOB), "a00001"), json(at(JOB)));
  if (keep) put(dir, pathOf(at(REVIEW), "a00002"), json(at(REVIEW)));
  return { dir, seed, from };
}

/** Pushes the branch as it is in the seed and makes the coordinator's clone fetch it. Returns its head. */
function push({ dir, seed }) {
  git(seed, "push", "-q", "origin", `HEAD:refs/heads/${FEAT}`);
  git(dir, "fetch", "-q", "origin");
  return git(seed, "rev-parse", "HEAD");
}

/** Merges origin/main into the branch the way step 7 does, cleanly, and pushes it. */
function mergeMain(fx) {
  git(fx.seed, "merge", "-q", "--no-edit", "origin/main");
  return push(fx);
}

const carry = (dir, from, to, extra = []) => run(dir, ["carry", "--pr", "40", "--from", from, "--to", to, ...extra]);
const at = (dir, sha) => Object.values(records(dir)).filter((r) => r.sha === sha);

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

/** Each case makes a merge sha that isn't a clean merge of main into `from`: carry exits 1, names why, writes nothing. */
function refuses(why, names, make, opts) {
  const fx = reviewed(opts);
  const to = make(fx);
  const before = Object.keys(records(fx.dir)).length;
  const r = carry(fx.dir, fx.from, to);
  assert.equal(r.status, 1, `${why}: ${r.stdout}${r.stderr}`);
  assert.match(r.stderr, names, `${why}: says why`);
  assert.match(r.stderr, /fresh pr-review/, `${why}: says what to do`);
  assert.equal(Object.keys(records(fx.dir)).length, before, `${why}: writes nothing`);
}

test("carry: a conflict fix exits 1 and goes to a fresh review", unixOnly, () => {
  refuses("a conflict fix", /conflicts/, (fx) => {
    const r = spawnSync("git", ["merge", "-q", "--no-edit", "origin/main"], { cwd: fx.seed, encoding: "utf8", env: safeEnv(GIT_ENV) });
    assert.equal(r.status, 1, "the merge conflicts");
    put(fx.seed, "README.md", "both, fixed by hand\n");
    git(fx.seed, "add", "README.md");
    git(fx.seed, "commit", "-q", "--no-edit");
    return push(fx);
  }, { feature: { "README.md": "feature\n" }, onMain: { "README.md": "main\n" } });
});

test("carry: a hand edit inside a clean merge exits 1", unixOnly, () => {
  refuses("a hand edit", /change of its own/, (fx) => {
    git(fx.seed, "merge", "-q", "--no-commit", "--no-ff", "origin/main");
    put(fx.seed, "extra.txt", "slipped in\n");
    git(fx.seed, "add", "extra.txt");
    git(fx.seed, "commit", "-q", "--no-edit");
    return push(fx);
  });
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
  }
  assert.equal(Object.keys(records(fx.dir)).length, before);
});
