// Tests for own-branch.mjs (#131): the local gate only runs the loop's own branches. A fake gh answers the API.
// AC-131-1: step 6.1 runs the checks on the exact head commit, and only for a pull request the loop started.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/own-branch.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const HEAD = "c".repeat(40);
const CLAIM = (branch) => ({ body: `Claimed by the loop at 2026-11-26T09:10Z · branch ${branch}\nCheck by 11:10Z.` });

/** own-branch.mjs on pull request 7 of acme/app, whose branch `ref` lives in the repo `from`; issue 5 has `comments`. */
function own({ from = "acme/app", ref = "feat/5-share", comments = [CLAIM("feat/5-share")], args = ["7", "--repo", "acme/app"], env = {} } = {}) {
  const dir = tmp("onrails-own-");
  const fake = fakeGh(dir, {
    "repos/acme/app/pulls/7": { number: 7, head: { sha: HEAD, ref, repo: from && { full_name: from } } },
    "repos/acme/app/issues/5/comments": comments,
  }, env);
  return { ...spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: fake.env }), calls: fake.calls() };
}

test("AC-131-1: a fork's pull request is refused, even on a claimed branch name: exit 1, no sha, its issue not read", unixOnly, () => {
  for (const from of ["someone/app", "acme/app-fork", null]) {
    const r = own({ from });
    assert.equal(r.status, 1, String(from));
    assert.equal(r.stdout, "", "no sha to check out");
    assert.match(r.stderr, /only runs the loop's own branches/);
    assert.doesNotMatch(r.calls, /issues\//);
  }
});

test("AC-131-1: the loop's own branch passes and prints the head's full sha", unixOnly, () => {
  const r = own();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${HEAD}: feat/5-share is this loop's branch for #5\n`);
  assert.equal(own({ ref: "fix/5-share", comments: [CLAIM("`fix/5-share`")] }).status, 0, "a fix branch, in backticks");
  assert.equal(own({ from: "Acme/App" }).status, 0, "GitHub names ignore case");
});

test("AC-131-1: a branch in the repo passes only when a claim on its issue names it", unixOnly, () => {
  const cases = {
    "no comments": { comments: [] },
    "a claim for a longer branch name": { comments: [CLAIM("feat/5-share-v2")] },
    "a claim with no branch": { comments: [{ body: "Claimed by the loop at 09:10Z" }] },
    "the branch named outside a claim": { comments: [{ body: "Looks good on branch feat/5-share" }] },
  };
  for (const [name, more] of Object.entries(cases)) {
    const r = own(more);
    assert.equal(r.status, 1, name);
    assert.equal(r.stdout, "", name);
    assert.match(r.stderr, /No claim comment on #5 names feat\/5-share/, name);
  }
  const other = own({ ref: "patch-1" });
  assert.equal(other.status, 1);
  assert.match(other.stderr, /isn't a feat\/<n>- or fix\/<n>- branch/);
  assert.doesNotMatch(other.calls, /issues\//);
});

test("AC-131-1: a usage or API error exits 2 and prints no sha; REPO from the shell doesn't stand in for --repo", unixOnly, () => {
  const usage = own({ args: ["7"], env: { REPO: "acme/app" } });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /own-branch\.mjs <n> --repo <owner>\/<name>/);
  assert.equal(usage.calls, "");
  const missing = own({ args: ["8", "--repo", "acme/app"] });
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /Couldn't read #8/);
});

test("AC-131-1: coordinate's claim names the branch, and step 6.1 asks own-branch before it fetches, checks out or runs anything", unixOnly, () => {
  const skill = read(".agents/skills/coordinate/SKILL.md");
  const template = skill.match(/`(Claimed by <session name> at <time> · branch feat\/<n>-<short-name>)`/)?.[1];
  assert.ok(template, "step 3's claim names the branch");
  const body = template.replace("<session name>", "the loop").replace("<time>", "09:10Z").replace("feat/<n>-<short-name>", "feat/5-share");
  assert.equal(own({ comments: [{ body }] }).status, 0, "the script reads the claim the skill writes");
  const step = skill.slice(skill.indexOf("1. **Local checks**"), skill.indexOf("2. **Code review.**"));
  const at = (text) => (assert.ok(step.includes(text), text), step.indexOf(text));
  assert.ok(at("own-branch.mjs <n> --repo <owner>/<repo>") < at("git fetch origin pull/<n>/head"));
  assert.ok(at("git fetch origin pull/<n>/head") < at("git worktree add --detach"));
  assert.ok(at("rev-parse HEAD` must print `<sha>`") < at("run the install"));
  assert.doesNotMatch(step, /\$sha\b|sha=\$\(/, "the sha is written out, never a shell variable");
});
