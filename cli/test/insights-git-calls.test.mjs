// #450: what land's and carry's git calls keep and don't send. An environment that sets git up through GIT_CONFIG_COUNT
// (a url insteadOf rewrite for an SSH-style origin) must still reach their fetch and push (AC-450-1); a push.followTags
// or a tag on the remote must add no tag on either side of land (AC-450-2); GIT_DIR and GIT_WORK_TREE must not move land
// to another clone (AC-450-3). The git set-up is insights-land-fakes.mjs and insights-carry-fakes.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { unixOnly } from "./helpers.mjs";
import { mergeMain, oldGitCarry, reviewed } from "./insights-carry-fakes.mjs";
import { JOB, REVIEW, branch, git, json, pathOf, pullOf, put, run, setup, twoNew } from "./insights-land-fakes.mjs";

const BRANCH = "chore/insights-2026-11-27-1432";
const OPEN = "repos/acme/app/pulls?state=open&per_page=100";
const PULLS = {
  [OPEN]: [], "repos/acme/app/pulls": { number: 77 }, "repos/acme/app/issues/77/labels": [],
  "repos/acme/app/issues/66/labels": [], "repos/acme/app/pulls/66": { number: 66 },
};
const HOST = "git-host.example.invalid:";

/**
 * The env of a machine that sets git up through the environment: GIT_CONFIG_COUNT with a url insteadOf that turns
 * `HOST<name>` into the temp remote's folder, and a second pair after it. The transport (ssh) is a command that fails, so
 * a call that doesn't see the rewrite fails at once instead of waiting on a network.
 */
const rewrite = (root) => ({
  GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: `url.${root}/.insteadOf`, GIT_CONFIG_VALUE_0: HOST,
  GIT_CONFIG_KEY_1: "advice.detachedHead", GIT_CONFIG_VALUE_1: "false", GIT_SSH_COMMAND: "false",
});
/** The GIT_ variables each call in a git-env log (insights-land-fakes.mjs `logGitEnv`) was given, one block per call. */
const callsOf = (log) => log.split("\n\n").filter(Boolean);

/** Each call in `calls` was given the rewrite, never GIT_CONFIG_PARAMETERS (which `git -c` hands down). */
function keepsRewrite(calls, why) {
  assert.ok(calls.length > 0, `${why}: logged calls`);
  for (const call of calls) {
    const head = `${why}: ${call.split("\n")[0]}`;
    assert.match(call, /^GIT_CONFIG_COUNT=2$/m, head);
    assert.match(call, /^GIT_CONFIG_KEY_0=url\..*\.insteadOf$/m, head);
    assert.match(call, /^GIT_CONFIG_KEY_1=advice\.detachedHead$/m, head);
    assert.match(call, /^GIT_CONFIG_VALUE_0=git-host\.example\.invalid:$/m, head);
    assert.match(call, /^GIT_CONFIG_VALUE_1=false$/m, head);
    assert.doesNotMatch(call, /^GIT_CONFIG_PARAMETERS=/m, head);
  }
}

test("AC-450-1: WHEN land runs with GIT_CONFIG_COUNT/KEY/VALUE setting an insteadOf rewrite THEN its fetch and push see the rewrite, and GIT_CONFIG_PARAMETERS is still dropped", unixOnly, () => {
  const { root, dir } = setup();
  const added = twoNew(dir);
  git(dir, "remote", "set-url", "origin", `${HOST}remote.git`);
  const env = { ...rewrite(root), GIT_CONFIG_PARAMETERS: "'fetch.prune'='true'" };
  const r = run(dir, ["land", "--repo", "acme/app"], PULLS, { env, logGitEnv: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n");
  const diff = git(join(root, "remote.git"), "diff", "--name-status", "--no-renames", `main...${BRANCH}`);
  assert.deepEqual(diff.split("\n").sort(), added.map((p) => `A\t${p}`), "the push reached the remote through the rewrite");
  const calls = callsOf(r.gitEnv);
  for (const name of ["fetch", "push", "commit-tree", "ls-tree"]) assert.ok(calls.some((c) => c.startsWith(`git ${name} `)), `land runs git ${name}`);
  keepsRewrite(calls, "land");
});

test("AC-450-1: WHEN land --verify runs with an insteadOf rewrite in GIT_CONFIG_COUNT THEN fetching the pull request's branch sees it", unixOnly, () => {
  const { root, dir, seed } = setup();
  const ref = "chore/insights-2026-11-27-1500";
  const sha = branch(seed, ref, { [pathOf(REVIEW)]: json(REVIEW) });
  git(dir, "remote", "set-url", "origin", `${HOST}remote.git`);
  const r = run(dir, ["land", "--verify", "90", "--repo", "acme/app"], { "repos/acme/app/pulls/90": pullOf(90, ref, sha) }, { env: rewrite(root), logGitEnv: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${sha}\n`);
  keepsRewrite(callsOf(r.gitEnv), "land --verify");
});

test("AC-450-1: WHEN carry's fetch of main runs with GIT_CONFIG_COUNT/KEY/VALUE setting an insteadOf rewrite THEN it sees the rewrite, and GIT_CONFIG_PARAMETERS and GIT_CONFIG_GLOBAL are still dropped", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  git(fx.dir, "remote", "set-url", "origin", `${HOST}remote.git`);
  const root = join(fx.dir, "..");
  const env = { ...rewrite(root), GIT_CONFIG_PARAMETERS: "'fetch.prune'='true'", GIT_CONFIG_GLOBAL: "/dev/null-global" };
  const r = oldGitCarry(fx.dir, fx.from, to, { env, logFetchEnv: true });
  assert.equal(r.status, 0, `the fetch reached the remote through the rewrite: ${r.stdout}${r.stderr}`);
  keepsRewrite([r.fetchEnv], "carry's fetch");
  assert.doesNotMatch(r.fetchEnv, /^GIT_CONFIG_GLOBAL=/m);
});

/**
 * A coordinator's clone whose config has push.followTags=true, with an annotated tag on main's commit that no remote
 * holds, and a remote tag named origin/main on that commit too (which a fetch would write as refs/tags/origin/main).
 */
function tagged() {
  const fx = setup();
  const added = twoNew(fx.dir);
  const main = git(fx.dir, "rev-parse", "refs/remotes/origin/main");
  git(fx.dir, "config", "push.followTags", "true");
  git(fx.dir, "tag", "-a", "-m", "a local note", "v1-local", main);
  git(fx.seed, "tag", "-a", "-m", "a remote tag", "origin/main", main);
  git(fx.seed, "push", "-q", "origin", "refs/tags/origin/main");
  return { ...fx, added };
}

/** After land: the remote holds no tag it didn't already hold, and the clone holds no tag but its own. */
function addsNoTag({ root, dir }, why) {
  const names = (cwd) => git(cwd, "for-each-ref", "--format=%(refname)", "refs/tags");
  assert.equal(names(join(root, "remote.git")), "refs/tags/origin/main", `${why}: land pushed no tag`);
  assert.equal(names(dir), "refs/tags/v1-local", `${why}: its fetch wrote no tag`);
}

test("AC-450-2: WHEN push.followTags=true, a local annotated tag is reachable from the records commit and the remote has a tag named origin/main THEN land's new records branch carries no tag and its fetch writes no refs/tags/*", unixOnly, () => {
  const fx = tagged();
  const r = run(fx.dir, ["land", "--repo", "acme/app"], PULLS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n");
  const diff = git(join(fx.root, "remote.git"), "diff", "--name-status", "--no-renames", `main...${BRANCH}`);
  assert.deepEqual(diff.split("\n").sort(), fx.added.map((p) => `A\t${p}`), "the branch was pushed");
  addsNoTag(fx, "a new records branch");
});

/**
 * Land on an open records pull request's branch, which has a tag on its own head, from a clone set up by `tagged()` plus
 * `config` (git config keys and values). The remote's tags may land in the clone only if the clone had them before.
 */
function landOnOpenPull(config) {
  const fx = tagged();
  for (const [key, value] of Object.entries(config)) git(fx.dir, "config", key, value);
  const ref = "chore/insights-2026-11-27-1200";
  // From the full ref: the seed fetched the tag named origin/main too, which makes the short name ambiguous.
  const sha = branch(fx.seed, ref, { [pathOf(REVIEW, "d4e5f6")]: json(REVIEW) }, "refs/remotes/origin/main");
  // A tag on the branch's own head, which a fetch of that branch would follow.
  git(fx.seed, "tag", "-a", "-m", "a head tag", "on-head", sha);
  git(fx.seed, "push", "-q", "origin", "refs/tags/on-head");
  const r = run(fx.dir, ["land", "--repo", "acme/app"], { ...PULLS, [OPEN]: [pullOf(66, ref, sha)] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "66\n");
  const diff = git(join(fx.root, "remote.git"), "diff", "--name-status", "--no-renames", `main...${ref}`);
  assert.deepEqual(diff.split("\n").sort(), fx.added.map((p) => `A\t${p}`), "the branch grew");
  const names = (cwd) => git(cwd, "for-each-ref", "--format=%(refname)", "refs/tags").split("\n");
  assert.deepEqual(names(join(fx.root, "remote.git")), ["refs/tags/on-head", "refs/tags/origin/main"], "land pushed no tag");
  assert.deepEqual(names(fx.dir), ["refs/tags/v1-local"], "its fetches wrote no tag");
}

test("AC-450-2: WHEN push.followTags=true and a local annotated tag is reachable from the records commit THEN land's push to the open records pull request's branch sends no tag, and fetching that branch writes no refs/tags/*", unixOnly, () => {
  landOnOpenPull({});
});

// remote.origin.tagOpt=--tags makes a fetch take every tag of the remote unless the call says --no-tags, so this is the
// case that fails when fetchHead() drops its --no-tags (#565).
test("AC-450-2: WHEN remote.origin.tagOpt=--tags is also set THEN fetching the open records pull request's branch still writes no refs/tags/*", unixOnly, () => {
  landOnOpenPull({ "remote.origin.tagOpt": "--tags" });
});

test("AC-450-3: WHEN GIT_DIR and GIT_WORK_TREE point at another clone THEN land stages and pushes only the checkout it was started in", unixOnly, () => {
  const { root, dir, seed } = setup();
  const added = twoNew(dir);
  const theirs = pathOf({ ...JOB, issue: 13 }, "123456");
  put(seed, theirs, json({ ...JOB, issue: 13 }));
  const r = run(dir, ["land", "--repo", "acme/app"], PULLS, { env: { GIT_DIR: join(seed, ".git"), GIT_WORK_TREE: seed } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n");
  const diff = git(join(root, "remote.git"), "diff", "--name-status", "--no-renames", `main...${BRANCH}`);
  assert.deepEqual(diff.split("\n").sort(), added.map((p) => `A\t${p}`), "only this checkout's records were pushed");
  assert.deepEqual(git(dir, "diff", "--cached", "--name-only").split("\n").sort(), added, "staged in this checkout");
  assert.equal(git(seed, "diff", "--cached", "--name-only"), "", "the other clone's index is as it was");
});
