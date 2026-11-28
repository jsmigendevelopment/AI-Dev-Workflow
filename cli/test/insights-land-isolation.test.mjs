// land's git calls drop the variables that move the repository (#422), as carry's fetch does (decision 333-2): a hook
// exports GIT_DIR and GIT_INDEX_FILE, which would point land's reads, commit and staging at another repository or
// index. The shared set-up is in insights-land-fakes.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { unixOnly } from "./helpers.mjs";
import { REVIEW, branch, git, json, pathOf, pullOf, run, setup, twoNew } from "./insights-land-fakes.mjs";

const BRANCH = "chore/insights-2026-11-27-1432";
const PULLS = { "repos/acme/app/pulls?state=open&per_page=100": [], "repos/acme/app/pulls": { number: 77 }, "repos/acme/app/issues/77/labels": [] };

test("#422: an exported GIT_DIR and GIT_INDEX_FILE (as a hook gets) don't move land off the checkout: it opens off main and stages in the checkout's own index", unixOnly, () => {
  const { root, dir, seed } = setup();
  const added = twoNew(dir);
  const otherIndex = join(root, "other-index");
  const r = run(dir, ["land", "--repo", "acme/app"], PULLS, { env: { GIT_DIR: join(seed, ".git"), GIT_INDEX_FILE: otherIndex } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "77\n");
  git(dir, "fetch", "-q", "origin");
  const main = git(dir, "rev-parse", "refs/remotes/origin/main");
  assert.equal(git(dir, "rev-parse", `refs/remotes/origin/${BRANCH}^`), main, "one commit on main");
  assert.deepEqual(git(dir, "diff", "--cached", "--name-only").split("\n").sort(), added, "staged in the checkout's own index");
  assert.equal(git(seed, "diff", "--cached", "--name-only"), "", "the other repository's index is as it was");
  assert.equal(existsSync(otherIndex), false, "the exported index isn't written");
});

test("#422: every git call of land and land --verify drops GIT_DIR, GIT_INDEX_FILE and env-given config, keeps transport variables, and never prompts", unixOnly, () => {
  const { root, dir, seed } = setup();
  twoNew(dir);
  const env = {
    GIT_DIR: join(dir, ".git"), GIT_INDEX_FILE: join(root, "other-index"), GIT_WORK_TREE: dir, GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "fetch.prune", GIT_CONFIG_VALUE_0: "true", GIT_CONFIG_PARAMETERS: "'fetch.prune'='true'",
    GIT_SSL_CAINFO: "/dev/null-ca", GIT_TERMINAL_PROMPT: "1",
  };
  const opened = run(dir, ["land", "--repo", "acme/app"], PULLS, { env, logGitEnv: true });
  assert.equal(opened.status, 0, opened.stderr);
  const ref = "chore/insights-2026-11-27-1500";
  const sha = branch(seed, ref, { [pathOf(REVIEW)]: json(REVIEW) });
  const verified = run(dir, ["land", "--verify", "90", "--repo", "acme/app"], { "repos/acme/app/pulls/90": pullOf(90, ref, sha) }, { env, logGitEnv: true });
  assert.equal(verified.status, 0, verified.stderr);
  // insights.mjs finds the checkout before land runs: that one call isn't land's.
  const calls = `${opened.gitEnv}${verified.gitEnv}`.split("\n\n").filter((c) => c && !c.startsWith("git rev-parse --show-toplevel"));
  for (const name of ["fetch", "ls-tree", "commit-tree", "push", "add", "diff", "cat-file"]) {
    assert.ok(calls.some((c) => c.startsWith(`git ${name} `)), `land runs git ${name}`);
  }
  for (const call of calls) {
    const head = call.split("\n")[0];
    assert.match(call, /^GIT_TERMINAL_PROMPT=0$/m, `${head}: never prompts`);
    assert.match(call, /^GIT_SSL_CAINFO=\/dev\/null-ca$/m, `${head}: a transport variable stays`);
    assert.doesNotMatch(call, /^GIT_(DIR|WORK_TREE|CONFIG_COUNT|CONFIG_KEY_0|CONFIG_VALUE_0|CONFIG_PARAMETERS)=/m, head);
    // commitOn's own temp index is the only index a call may name.
    const index = /^GIT_INDEX_FILE=(.*)$/m.exec(call)?.[1];
    if (index) assert.notEqual(index, env.GIT_INDEX_FILE, `${head}: not the exported index`);
  }
});
