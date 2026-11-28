// carry's git is isolated from the coordinator's environment (#333 round 4, decision 333-2), the way pr-size.mjs's git
// is (#225): no GIT_ variable, no global or system config or attributes, no hooks, and main's merge attributes, never
// the branch's. Most cases run under a fake git older than 2.38, so the throwaway clone does the merge, and each shows
// the coordinator's checkout is as it was. The set-up is in
// insights-carry-fakes.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmp, unixOnly } from "./helpers.mjs";
import { CLASH, FEAT, at, carry, conflictFix, handEdit, mergeMain, oldGitCarry, push, refuses, reviewed, state } from "./insights-carry-fakes.mjs";
import { branch, git, records } from "./insights-land-fakes.mjs";

/** A clean merge carried under the old git with `env`: exit 0, its two records, and the checkout as it was. */
function carriesCleanly(why, env) {
  const fx = reviewed();
  const to = mergeMain(fx);
  const was = state(fx.dir);
  const r = oldGitCarry(fx.dir, fx.from, to, { env: env(fx) });
  assert.equal(r.status, 0, `${why}: ${r.stdout}${r.stderr}`);
  assert.deepEqual(at(fx.dir, to).map((m) => `${m.kind}:${m.job}`).sort(), ["job:carry-review", "review:carry-review"], why);
  assert.equal(state(fx.dir), was, `${why}: the checkout is as it was`);
  assert.deepEqual(r.left, [], `${why}: no temp folder left`);
}

/** A global git config holding `text`, given both ways git finds one: GIT_CONFIG_GLOBAL and HOME. */
function globalConfig(text) {
  const home = tmp("onrails-global-");
  writeFileSync(join(home, ".gitconfig"), text);
  return { GIT_CONFIG_GLOBAL: join(home, ".gitconfig"), HOME: home, XDG_CONFIG_HOME: home };
}

const underOldGit = (env, opts = {}) => (dir, from, to) => oldGitCarry(dir, from, to, { env, ...opts });

test("carry: an exported GIT_DIR (as a hook gets) doesn't point carry's git at the checkout", unixOnly, () => {
  carriesCleanly("GIT_DIR", (fx) => ({ GIT_DIR: join(fx.dir, ".git") }));
});

test("carry: an exported GIT_INDEX_FILE doesn't let carry's git rewrite the checkout's index", unixOnly, () => {
  carriesCleanly("GIT_INDEX_FILE", (fx) => ({ GIT_INDEX_FILE: join(fx.dir, ".git", "index") }));
});

// Merge attributes are main's, never the branch's (decision 333-2): merge-tree reads the checkout's (main's), and the
// old-git redo writes `* merge=text` and main's .gitattributes into the clone's .git/info/attributes.
const BRANCH_UNION = { feature: { "README.md": "feature\n", ".gitattributes": "README.md merge=union\n" }, onMain: { "README.md": "main\n" } };

test("carry: a union attribute only on the branch is refused as a conflict, on new git and on old git", unixOnly, () => {
  refuses("a branch-only union, new git", /conflicts/, mergeMain, BRANCH_UNION);
  refuses("a branch-only union, old git", /conflicts/, mergeMain, BRANCH_UNION, underOldGit({}));
});

/**
 * A branch that edits .gitattributes, merged with main twice (B to M, then M to M2 after main moves again): carry
 * passes both times, through `runner`, and leaves the checkout as it was.
 */
function carriesTwice(why, runner) {
  const fx = reviewed({ feature: { "app.txt": "feature\n", ".gitattributes": "*.jpg binary\n" } });
  const m = mergeMain(fx);
  let was = state(fx.dir);
  const first = runner(fx.dir, fx.from, m);
  assert.equal(first.status, 0, `${why}, B to M: ${first.stdout}${first.stderr}`);
  assert.equal(state(fx.dir), was, `${why}, B to M: the checkout is as it was`);
  branch(fx.seed, "main", { "main2.txt": "main again\n" });
  git(fx.seed, "checkout", "-q", FEAT);
  git(fx.seed, "fetch", "-q", "origin");
  const m2 = mergeMain(fx);
  was = state(fx.dir);
  const second = runner(fx.dir, m, m2);
  assert.equal(second.status, 0, `${why}, M to M2: ${second.stdout}${second.stderr}`);
  assert.deepEqual(at(fx.dir, m2).map((r) => `${r.kind}:${r.job}`).sort(), ["job:carry-review", "review:carry-review"], why);
  assert.equal(state(fx.dir), was, `${why}, M to M2: the checkout is as it was`);
}

test("carry: a pull request that edits .gitattributes carries across two merges of main on new git", unixOnly, () => {
  carriesTwice("new git", carry);
});

test("carry: a pull request that edits .gitattributes carries across two merges of main on old git", unixOnly, () => {
  carriesTwice("old git", underOldGit({}));
});

test("carry: under the old-git redo, main's own CHANGELOG union still applies while the branch edits .gitattributes", unixOnly, () => {
  const fx = reviewed({
    base: { ".gitattributes": "CHANGELOG.md merge=union\n", "CHANGELOG.md": "# log\n" },
    feature: { "CHANGELOG.md": "# log\nfeature\n", ".gitattributes": "CHANGELOG.md merge=union\n*.jpg binary\n" },
    onMain: { "CHANGELOG.md": "# log\nmain\n" },
  });
  const to = mergeMain(fx);
  const was = state(fx.dir);
  const r = oldGitCarry(fx.dir, fx.from, to);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(at(fx.dir, to).map((m) => `${m.kind}:${m.job}`).sort(), ["job:carry-review", "review:carry-review"]);
  assert.equal(state(fx.dir), was);
  assert.deepEqual(r.left, [], "no temp folder left");
});

test("carry: the fetch of main drops the variables that move the repository and env-given config, keeps transport ones, and never prompts", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const env = {
    GIT_DIR: join(fx.dir, ".git"), GIT_INDEX_FILE: join(fx.dir, ".git", "index"), GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "fetch.prune", GIT_CONFIG_VALUE_0: "true", GIT_SSL_CAINFO: "/dev/null-ca", GIT_TERMINAL_PROMPT: "1",
  };
  const r = oldGitCarry(fx.dir, fx.from, to, { env, logFetchEnv: true, fallback: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.fetchEnv, /^GIT_TERMINAL_PROMPT=0$/m);
  assert.match(r.fetchEnv, /^GIT_SSL_CAINFO=\/dev\/null-ca$/m, "a transport variable stays");
  assert.doesNotMatch(r.fetchEnv, /^GIT_(DIR|INDEX_FILE|CONFIG_COUNT|CONFIG_KEY_0|CONFIG_VALUE_0)=/m);
});

test("carry: a global pull.twohead=ours doesn't turn the redo into an ours merge", unixOnly, () => {
  // The merge commit drops main's change, as an ours merge does: only the redo's own strategy could match it.
  const oursMerge = (fx) => {
    git(fx.seed, "merge", "-q", "--no-edit", "-s", "ours", "origin/main");
    return push(fx);
  };
  refuses("a global pull.twohead=ours", /change of its own/, oursMerge, undefined, underOldGit(globalConfig("[pull]\n\ttwohead = ours\n")));
});

test("carry: a merge driver from the global config isn't used in the redo", unixOnly, () => {
  refuses("a global merge driver", /conflicts/, (fx) => conflictFix(fx, "feature\n"), {
    ...CLASH, base: { ".gitattributes": "README.md merge=keepours\n" },
  }, underOldGit(globalConfig('[merge "keepours"]\n\tname = keep ours\n\tdriver = true\n')));
});

test("carry: a relative global core.hooksPath doesn't run a hook from the reviewed sha's tree in the redo", unixOnly, () => {
  const hook = "#!/bin/sh\nprintf 'slipped in\\n' > extra.txt\ngit add extra.txt\ngit -c user.name=hook -c user.email=hook@example.invalid commit -q -m hook\n";
  refuses("a relative hooksPath", /change of its own/, handEdit, {
    feature: { "app.txt": "feature\n", "hooks/post-checkout": hook },
    featureChange: (seed) => chmodSync(join(seed, "hooks/post-checkout"), 0o755),
  }, underOldGit(globalConfig("[core]\n\thooksPath = hooks\n")));
});

test("carry: when the throwaway clone fails, it exits 1 (couldn't redo the merge), writes nothing and leaves no temp folder", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const was = state(fx.dir);
  const before = Object.keys(records(fx.dir)).length;
  const r = oldGitCarry(fx.dir, fx.from, to, { refuseClone: true });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /couldn't redo the merge/);
  assert.match(r.stderr, /fresh pr-review/);
  assert.equal(Object.keys(records(fx.dir)).length, before, "writes nothing");
  assert.equal(state(fx.dir), was);
  assert.deepEqual(r.left, [], "no temp folder left");
});

test("carry: a SIGTERM while the redo merges removes the temp clone, and carry isn't killed with it left behind", unixOnly, () => {
  const fx = reviewed();
  const to = mergeMain(fx);
  const was = state(fx.dir);
  const r = oldGitCarry(fx.dir, fx.from, to, { killOnMerge: true });
  assert.equal(r.signal, null, `carry handled the signal: ${r.stderr}`);
  assert.notEqual(r.status, 0, "nothing carried");
  assert.deepEqual(r.left, [], "no temp folder left");
  assert.equal(state(fx.dir), was);
});
