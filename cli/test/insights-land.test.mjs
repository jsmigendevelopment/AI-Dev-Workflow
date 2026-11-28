// The coordinator harvests reviewers' records and lands them on main (#332): AC-332-1, -2, -3 and -5.
// `land --verify` (AC-332-4) is in insights-verify.test.mjs; the shared set-up is in insights-land-fakes.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { safeEnv, unixOnly } from "./helpers.mjs";
import { toLine, validate } from "../src/insights-record.mjs";
import { exceptionReason } from "../../.agents/skills/coordinate/scripts/pr-size.mjs";
import { JOB, ME, ME_ID, OLD, REPO, REVIEW, SHA, SIZE_LINE, branch, git, json, pathOf, pullOf, put, record, records, run, setup, twoNew } from "./insights-land-fakes.mjs";

// Made-up numeric user IDs (#408): harvest trusts an account by ID, never by login alone.
const IDS = { [ME]: ME_ID, "review-bot": 2002, "qa-bot": 2003 };
const comment = (id, login, body) => ({ id, user: { login, id: IDS[login.toLowerCase()] ?? 4000 + id }, body });
const COMMENTS = "repos/acme/app/issues/40/comments";
const harvest = (dir, comments) => run(dir, ["harvest", "--pr", "40", "--repo", "acme/app"], { [COMMENTS]: comments });
const sorted = (list) => list.map((r) => JSON.stringify(r)).sort();
const fresh = (dir) => Object.entries(records(dir)).filter(([p]) => p !== pathOf(OLD));

test("AC-332-1: WHEN a fake gh returns three comments, two with valid insights lines from the coordinator's login and one from another login THEN harvest writes exactly the two records, and running it again writes nothing new", unixOnly, () => {
  const { dir } = setup();
  const stranger = record("review", { round: 9, verdict: "changes", must: 3, nice: 0 });
  const comments = [
    comment(1, ME, `Review · ${SHA} · approve\n\n${toLine(JOB)}`),
    comment(2, "someone-else", `Looks fine.\n${toLine(stranger)}`),
    comment(3, ME, `Verdict\n${toLine(REVIEW)}\n`),
  ];
  const first = harvest(dir, comments);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.calls, /--paginate .*repos\/acme\/app\/issues\/40\/comments/);
  const after = fresh(dir);
  assert.equal(after.length, 2, `two new records: ${after.map(([p]) => p)}`);
  assert.deepEqual(sorted(after.map(([, r]) => r)), sorted([JOB, REVIEW]));
  for (const [p] of after) assert.ok(first.stdout.includes(p), `it prints ${p}`);
  assert.match(first.stderr, /someone-else/, "it names the comment it didn't trust");

  const again = harvest(dir, comments);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(fresh(dir).map(([p]) => p).sort(), after.map(([p]) => p).sort(), "nothing new");
  assert.doesNotMatch(again.stdout, /docs\/insights/);
});

test("AC-332-1: a login and user ID listed under [insights] writers in docs/profile.toml count, in any case, on one line or many", unixOnly, () => {
  const profiles = [
    '[board]\ndir = "x"\n\n[insights]\nwriters = ["review-bot:2002", "qa-bot:2003"]\n',
    '[insights]\nwriters = [\n  # the reviewers\n  "review-bot:2002",\n  "qa-bot:2003", # "not-a-writer:4009"\n]\n\n[board]\ndir = "x"\n',
  ];
  for (const profile of profiles) {
    const { dir } = setup();
    put(dir, "docs/profile.toml", profile);
    const r = harvest(dir, [comment(5, "Review-Bot", toLine(REVIEW)), comment(6, "other", toLine(JOB)), comment(9, "not-a-writer", toLine(JOB))]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fresh(dir).map(([, rec]) => rec), [REVIEW], profile);
  }
});

test("AC-332-2: WHEN a comment's line fails validate THEN harvest skips it, names it, and exits 0", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, [
    comment(7, ME, `${toLine({ ...REVIEW, verdict: "maybe" })}\n${toLine(JOB)}`),
    comment(8, ME, "<!-- onrails-insights {not json} -->"),
    comment(10, ME, toLine({ ...JOB, kind: "hasOwnProperty" })),
    comment(11, ME, toLine({ ...JOB, toString: "x" })),
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir).map(([, rec]) => rec), [JOB], "only the valid record");
  assert.match(r.stderr, /comment 7 .*verdict/, "names the comment and the field");
  assert.match(r.stderr, /comment 8 .*JSON/, "names the line that isn't JSON");
  assert.match(r.stderr, /comment 10 .*kind/, "a kind named after an object method isn't a kind");
  assert.match(r.stderr, /comment 11 .*toString/, "nor is a field named after one");
});

test("#332: validate refuses kinds and fields named after an object's own methods", () => {
  for (const kind of ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"]) {
    assert.ok(validate({ ...JOB, kind }).some((e) => e.startsWith("kind:")), kind);
  }
  for (const kind of [["review"], [["job"]], ["check"], 1, null]) {
    assert.ok(validate({ ...JOB, kind }).some((e) => e.startsWith("kind:")), JSON.stringify(kind));
  }
  for (const name of ["constructor", "toString", "valueOf"]) {
    assert.ok(validate({ ...JOB, [name]: "x" }).some((e) => e.startsWith(`${name}:`)), name);
  }
});

test("#332: validate wants text items in every list but check's commands", () => {
  assert.ok(validate({ ...REVIEW, categories: [{ a: {} }, 5, true] }).some((e) => e.startsWith("categories:")));
  assert.ok(validate(record("merge", { conflicted: [1] })).some((e) => e.startsWith("conflicted:")));
  assert.deepEqual(validate(record("merge", { conflicted: ["CHANGELOG.md"] })), []);
  assert.deepEqual(validate(record("check", { commands: [{ name: "pnpm check", result: "pass", seconds: 3 }] })), []);
});

test("#332: harvest keeps a valid record that leaves pr out", unixOnly, () => {
  const { dir } = setup();
  const { pr: _pr, ...noPr } = REVIEW;
  assert.deepEqual(validate(noPr), []);
  const r = harvest(dir, [comment(15, ME, toLine(noPr))]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir).map(([, rec]) => rec), [noPr]);
});

test("#332: harvest skips a record for another pull request, or one whose day folder isn't a date, and names it", unixOnly, () => {
  const { dir } = setup();
  const r = harvest(dir, [
    comment(12, ME, toLine({ ...JOB, pr: 999 })),
    comment(13, ME, toLine({ ...JOB, at: "+010000-01-01T00:00:00.000Z" })),
    comment(14, ME, toLine({ ...REVIEW, pr: null })),
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fresh(dir).map(([, rec]) => rec), [{ ...REVIEW, pr: null }], "a record with no pr is kept");
  assert.match(r.stderr, /comment 12 .*pr.*999/);
  assert.match(r.stderr, /comment 13 .*docs\/insights/);
});

test("#332: harvest skips a record already held under another name, and names a clash on its own name and goes on", unixOnly, () => {
  const { dir } = setup();
  put(dir, pathOf(JOB, "0f0f0f"), json(JOB));
  const held = harvest(dir, [comment(1, ME, toLine(JOB))]);
  assert.equal(held.status, 0, held.stderr);
  assert.deepEqual(fresh(dir).map(([p]) => p), [pathOf(JOB, "0f0f0f")], "nothing new");

  const learn = setup();
  const name = harvest(learn.dir, [comment(3, ME, toLine(REVIEW))]).stdout.trim().split("/docs/")[1];
  const { dir: other } = setup();
  put(other, `docs/${name}`, json({ ...REVIEW, nice: 5 }));
  const clash = harvest(other, [comment(3, ME, toLine(REVIEW)), comment(4, ME, toLine(JOB))]);
  assert.equal(clash.status, 0, clash.stderr);
  assert.ok(clash.stderr.includes(name), `names ${name}: ${clash.stderr}`);
  assert.equal(fresh(other).length, 2, "the clash stays as it was, and the next line is written");
});

const BRANCH = "chore/insights-2026-11-27-1432";
const OPEN = "repos/acme/app/pulls?state=open&per_page=100";
const PULLS = {
  [OPEN]: [], "repos/acme/app/pulls": { number: 77 }, "repos/acme/app/issues/77/labels": [],
  "repos/acme/app/issues/66/labels": [], "repos/acme/app/pulls/66": { number: 66 },
};
/** The labels a records pull request carries: #377's size rule reads size-exception and the body line. */
const LABELS = /-X POST -f labels\[\]=no-issue -f labels\[\]=size-exception repos\/acme\/app\/issues\/(\d+)\/labels/;

test("AC-332-3: WHEN the checkout has two record files not on origin/main (a temp bare remote) THEN land pushes a chore/insights-… branch whose diff from main is exactly those two added files", unixOnly, () => {
  const { dir } = setup();
  const added = twoNew(dir);
  const r = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n", "prints the pull request's number");
  git(dir, "fetch", "-q", "origin");
  const diff = git(dir, "diff", "--name-status", "--no-renames", `origin/main...origin/${BRANCH}`);
  assert.deepEqual(diff.split("\n").sort(), added.map((p) => `A\t${p}`));
  assert.equal(git(dir, "rev-parse", `origin/${BRANCH}^`), git(dir, "rev-parse", "origin/main"), "one commit on main");
  assert.ok(r.calls.includes(`-f head=${BRANCH} -f base=main repos/acme/app/pulls\n`), r.calls);
  assert.equal(r.calls.match(LABELS)?.[1], "77", `labels no-issue and size-exception: ${r.calls}`);
  assert.ok(r.calls.includes(`\n${SIZE_LINE}\n`), "the body has the size exception line");
  const body = r.calls.slice(r.calls.indexOf("-f body=") + 8, r.calls.indexOf(" -f head="));
  assert.equal(exceptionReason(body), "insights records only, each checked by land --verify", "#377's size rule reads it");
});

/** A commit off main holding `files`, pushed as `side`, with a `kind` (tag or branch) named origin/main on it in dir. */
function shadow(dir, seed, kind, files) {
  const side = branch(seed, "side", files);
  git(dir, "fetch", "-q", "origin", "side");
  git(dir, kind, "origin/main", side);
  return side;
}

for (const kind of ["tag", "branch"]) {
  test(`AC-422-1: WHEN the coordinator's clone has a ${kind} named origin/main on a commit that isn't on main THEN land opens its records pull request off main itself, with exactly the files not on main`, unixOnly, () => {
    const { dir, seed } = setup();
    const added = twoNew(dir);
    // The shadow holds the first file: read through it, main would seem to have that file already.
    const side = shadow(dir, seed, kind, { [added[0]]: readFileSync(join(dir, added[0]), "utf8") });
    const r = run(dir, ["land", "--repo", "acme/app"], PULLS);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "77\n");
    git(dir, "fetch", "-q", "origin");
    const main = git(dir, "rev-parse", "refs/remotes/origin/main");
    const head = git(dir, "rev-parse", `refs/remotes/origin/${BRANCH}`);
    assert.notEqual(main, side);
    assert.equal(git(dir, "rev-parse", `${head}^`), main, "one commit on main itself, not on the shadow");
    const diff = git(dir, "diff", "--name-status", "--no-renames", `${main}...${head}`);
    assert.deepEqual(diff.split("\n").sort(), added.map((p) => `A\t${p}`), "both files, the one the shadow holds too");
  });
}

test("#332: after the records pull request merges, the coordinator's git pull --ff-only is clean", unixOnly, () => {
  const { dir, seed } = setup();
  twoNew(dir);
  assert.equal(run(dir, ["land", "--repo", "acme/app"], PULLS).status, 0);
  git(seed, "fetch", "-q", "origin");
  git(seed, "push", "-q", "origin", `origin/${BRANCH}:refs/heads/main`);
  git(dir, "pull", "-q", "--ff-only", "origin", "main");
  assert.equal(git(dir, "status", "--porcelain", "--", "docs"), "", "nothing left to land");
  const again = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.stdout, "");
});

test("#332: land with nothing pending prints nothing, exits 0 and calls no API; an invalid file is named and left out", unixOnly, () => {
  const { dir } = setup();
  const quiet = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stdout, "");
  assert.equal(quiet.calls, "");
  const bad = pathOf({ ...REVIEW, at: "2026-11-27T15:00:00.000Z" }, "ffffff");
  put(dir, bad, json({ ...REVIEW, verdict: "maybe" }));
  const r = run(dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
  assert.ok(r.stderr.includes(bad), "names the invalid file");
});

test("#332: land reuses the records pull request it already has open: it adds only the missing files, and opens no second one", unixOnly, () => {
  const { dir, seed } = setup();
  const [first, second] = twoNew(dir);
  const ref = "chore/insights-2026-11-27-1200";
  const sha = branch(seed, ref, { [first]: readFileSync(join(dir, first), "utf8") });
  const theirs = pullOf(70, "chore/insights-2026-11-27-1100", "e".repeat(40), { login: "someone-else" });
  const api = { ...PULLS, [OPEN]: [theirs, pullOf(66, ref, sha)] };

  const grown = run(dir, ["land", "--repo", "acme/app"], api);
  assert.equal(grown.status, 0, grown.stderr);
  assert.equal(grown.stdout, "66\n", "the open one's number");
  assert.doesNotMatch(grown.calls, /repos\/acme\/app\/pulls\n/, "no new pull request");
  assert.equal(grown.calls.match(LABELS)?.[1], "66", `the missing labels go back on: ${grown.calls}`);
  assert.match(grown.calls, new RegExp(`-X PATCH -f body=[^]*${SIZE_LINE}[^]*repos/acme/app/pulls/66\\n`), "and the size exception line");
  git(dir, "fetch", "-q", "origin");
  assert.equal(git(dir, "rev-parse", `origin/${ref}^`), sha, "a fast-forward on its branch");
  const diff = git(dir, "diff", "--name-status", "--no-renames", `origin/main...origin/${ref}`);
  assert.deepEqual(diff.split("\n").sort(), [`A\t${first}`, `A\t${second}`]);
  assert.equal(git(dir, "ls-remote", "origin", `refs/heads/${BRANCH}`), "", "no new branch");

  const head = git(dir, "rev-parse", `origin/${ref}`);
  const labelled = pullOf(66, ref, head, { labels: ["no-issue", "size-exception"], body: `Records.\n\n${SIZE_LINE}\n` });
  const same = run(dir, ["land", "--repo", "acme/app"], { ...PULLS, [OPEN]: [labelled] });
  assert.equal(same.status, 0, same.stderr);
  assert.equal(same.stdout, "66\n");
  git(dir, "fetch", "-q", "origin");
  assert.equal(git(dir, "rev-parse", `origin/${ref}`), head, "nothing to add: no push");
  assert.doesNotMatch(same.calls, /-X (POST|PATCH)/, "labels and body already right: no write");
});

test("AC-332-5: WHEN coordinate/SKILL.md is read THEN step 9 names harvest and the sweep's end names land and --verify", () => {
  const text = readFileSync(join(REPO, ".agents/skills/coordinate/SKILL.md"), "utf8");
  const step9 = text.slice(text.indexOf("9. **Record it.**"), text.indexOf("10. **End of sweep:**"));
  const step10 = text.slice(text.indexOf("10. **End of sweep:**"), text.indexOf("## End of a pass"));
  assert.match(step9, /`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs harvest --pr <n> --repo <owner>\/<repo>`/);
  assert.match(step10, /`node \.agents\/skills\/coordinate\/scripts\/insights\.mjs land --repo <owner>\/<repo>`/);
  assert.match(step10, /insights\.mjs land --verify <records pr> --repo <owner>\/<repo>/);
  assert.match(step10, /`mark-check\.mjs` without `--record`/, "a records pull request's gate writes no check record");
  assert.match(step10, /while main is red/, "records pull requests wait while main is red");
  assert.match(step10, /skip steps 8 and 9/, "and their merge skips the deploy and harvest");
  const local = readFileSync(join(REPO, ".agents/skills/coordinate/references/local-mode.md"), "utf8");
  assert.match(local, /insights\.mjs harvest/);
  assert.match(local, /docs\/insights\/.*with the next merge|with the next merge.*docs\/insights\//);
});

test("#332: the kit marks docs/insights/ generated, so the size rule leaves records out", () => {
  const attrs = readFileSync(join(REPO, ".gitattributes"), "utf8");
  // Narrowed to record paths in #408: a stray file under docs/insights/ counts toward the size and fails the gate.
  assert.match(attrs, /^docs\/insights\/\*\/\*\.json linguist-generated$/m);
  const r = spawnSync("git", ["check-attr", "linguist-generated", "--", "docs/insights/2026-11-27/1432-job-40-abcdef.json"], { cwd: REPO, encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /linguist-generated: set$/m);
});
