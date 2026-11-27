// Shared set-up for the carry tests (#333, decision 333-2): a reviewed branch and main moved on after it, in a temp
// bare remote with the coordinator's clone (insights-land-fakes.mjs), carry run as is or under a fake git older than
// 2.38, and the checkout state carry must leave as it was.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "./child.mjs";
import { fake, safeEnv, tmp } from "./helpers.mjs";
import { findCommand } from "../src/system.mjs";
import { JOB, REVIEW, SCRIPTS, branch, git, json, pathOf, put, records, run, setup } from "./insights-land-fakes.mjs";

export const FEAT = "feat/40-share";
export const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "loop", GIT_AUTHOR_EMAIL: "loop@example.invalid", GIT_COMMITTER_NAME: "loop", GIT_COMMITTER_EMAIL: "loop@example.invalid",
};

/**
 * A reviewed branch (`from`) and main moved on after it. `base` is committed to main before the branch starts;
 * `feature` and `onMain` are the files each side adds, and `featureChange(seed)` runs before the branch's commit. The
 * coordinator's clone has fetched both and holds the reviewer's job and review records for `from`, unless `records`
 * is false (then only the job record). `held` replaces those two records, each given at `from`.
 */
export function reviewed({ base, feature = { "app.txt": "feature\n" }, featureChange, onMain = { "main.txt": "main\n" }, records: keep = true, held } = {}) {
  const { dir, seed } = setup();
  if (base) {
    branch(seed, "main", base);
    git(dir, "pull", "-q", "--ff-only");
  }
  const from = branch(seed, FEAT, feature, "origin/main", featureChange);
  branch(seed, "main", onMain);
  git(seed, "checkout", "-q", FEAT);
  git(seed, "fetch", "-q", "origin");
  const at = (r) => ({ ...r, sha: from });
  const mine = held ?? (keep ? [JOB, REVIEW] : [JOB]);
  mine.forEach((r, i) => put(dir, pathOf(at(r), `a0000${i}`), json(at(r))));
  return { dir, seed, from };
}

/** Pushes the branch as it is in the seed and makes the coordinator's clone fetch it. Returns its head. */
export function push({ dir, seed }) {
  git(seed, "push", "-q", "origin", `HEAD:refs/heads/${FEAT}`);
  git(dir, "fetch", "-q", "origin");
  return git(seed, "rev-parse", "HEAD");
}

/** Merges origin/main into the branch the way step 7 does, cleanly, and pushes it. */
export function mergeMain(fx) {
  git(fx.seed, "merge", "-q", "--no-edit", "origin/main");
  return push(fx);
}

/** A merge of main whose conflict was fixed by hand, keeping `text`; it needs CLASH, where both sides change README.md. */
export function conflictFix(fx, text = "both, fixed by hand\n") {
  const r = spawnSync("git", ["merge", "-q", "--no-edit", "origin/main"], { cwd: fx.seed, encoding: "utf8", env: safeEnv(GIT_ENV) });
  assert.equal(r.status, 1, "the merge conflicts");
  put(fx.seed, "README.md", text);
  git(fx.seed, "add", "README.md");
  git(fx.seed, "commit", "-q", "--no-edit");
  return push(fx);
}
export const CLASH = { feature: { "README.md": "feature\n" }, onMain: { "README.md": "main\n" } };

/** A clean merge of main with a file of the coordinator's own slipped in. */
export function handEdit(fx) {
  git(fx.seed, "merge", "-q", "--no-commit", "--no-ff", "origin/main");
  put(fx.seed, "extra.txt", "slipped in\n");
  git(fx.seed, "add", "extra.txt");
  git(fx.seed, "commit", "-q", "--no-edit");
  return push(fx);
}

export const carry = (dir, from, to, extra = []) => run(dir, ["carry", "--pr", "40", "--from", from, "--to", to, ...extra]);
export const at = (dir, sha) => Object.values(records(dir)).filter((r) => r.sha === sha);

/**
 * What carry must leave as it was in the coordinator's checkout: its refs, HEAD, index, working tree, worktrees and
 * any merge in progress.
 */
export function state(dir) {
  const cmds = ["for-each-ref", "rev-parse --symbolic-full-name HEAD", "ls-files --stage", "status --porcelain --untracked-files=no", "worktree list --porcelain"];
  return [...cmds.map((c) => git(dir, ...c.split(" "))), `MERGE_HEAD: ${existsSync(join(dir, ".git", "MERGE_HEAD"))}`].join("\n");
}

/** Each case makes a merge sha carry must refuse: exit 1, names why, writes nothing, and leaves the checkout as it was. */
export function refuses(why, names, make, opts, runner = carry) {
  const fx = reviewed(opts);
  const to = make(fx);
  const before = Object.keys(records(fx.dir)).length;
  const was = state(fx.dir);
  const r = runner(fx.dir, fx.from, to);
  assert.equal(r.status, 1, `${why}: ${r.stdout}${r.stderr}`);
  assert.match(r.stderr, names, `${why}: says why`);
  assert.match(r.stderr, /fresh pr-review/, `${why}: says what to do`);
  assert.equal(Object.keys(records(fx.dir)).length, before, `${why}: writes nothing`);
  assert.equal(state(fx.dir), was, `${why}: the checkout is as it was`);
}

/**
 * carry under a git older than 2.38: a fake git that refuses `merge-tree --write-tree` (exit 129, as git 2.34 does)
 * and passes every other call through to the real git. `env` adds variables (a GIT_DIR, a global config).
 * `refuseClone` makes `clone` fail; `killOnMerge` makes a plain `merge` send SIGTERM to carry; `logFetchEnv` keeps the
 * fetch's GIT_ variables as `fetchEnv`. `fallback: false` is for a case refused before any merge. Returns the result
 * and `tmp`, carry's own TMPDIR, with `left`, what is still in it.
 */
export function oldGitCarry(dir, from, to, { env = {}, refuseClone = false, killOnMerge = false, logFetchEnv = false, fallback = true } = {}) {
  const bin = tmp("onrails-old-git-");
  const log = join(bin, "refused.log");
  fake(bin, "git", `#!/bin/sh
tree=no; write=no; clone=no; merge=no; fetch=no
for a in "$@"; do
  [ "$a" = fetch ] && fetch=yes
  [ "$a" = merge-tree ] && tree=yes
  [ "$a" = --write-tree ] && write=yes
  [ "$a" = clone ] && clone=yes
  [ "$a" = merge ] && merge=yes
done
if [ $tree = yes ] && [ $write = yes ]; then echo "merge-tree $*" >> '${log}'; echo "usage: git merge-tree <base> <a> <b>" >&2; exit 129; fi
${refuseClone ? `if [ $clone = yes ]; then echo "fatal: could not create work tree dir" >&2; exit 128; fi` : ""}
${killOnMerge ? "if [ $merge = yes ]; then kill -TERM $PPID; exit 1; fi" : ""}
${logFetchEnv ? `if [ $fetch = yes ]; then env | grep '^GIT_' | sort > '${join(bin, "fetch.env")}'; fi` : ""}
exec '${findCommand("git")}' "$@"
`);
  const own = tmp("onrails-carry-tmp-");
  const childEnv = safeEnv({ ...GIT_ENV, ONRAILS_NOW: "2026-11-27T14:32:00Z", TMPDIR: own, ...env }, { bins: [bin] });
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "insights.mjs"), "carry", "--pr", "40", "--from", from, "--to", to], { cwd: dir, encoding: "utf8", env: childEnv });
  assert.equal(existsSync(log), fallback, fallback ? "the fake refused merge-tree --write-tree" : "refused before any merge");
  const fetchEnv = existsSync(join(bin, "fetch.env")) ? readFileSync(join(bin, "fetch.env"), "utf8") : "";
  return { ...r, tmp: own, left: readdirSync(own), fetchEnv };
}
