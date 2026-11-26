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
const say = (body, login = "builder") => ({ body, user: login && { login } });
const CLAIM = (branch, login) => say(`Claimed by the loop at 2026-11-26T09:10Z · branch ${branch}\nCheck by 11:10Z.`, login);
// GitHub's permission API reads "maintain" as permission "write" and "triage" as "read"; role_name has the role.
const ACCESS = { builder: ["write", "write"], keeper: ["write", "maintain"], owner: ["admin", "admin"], reader: ["read", "read"], helper: ["read", "triage"] };
const PERMISSIONS = Object.fromEntries(
  Object.entries(ACCESS).map(([login, [permission, role_name]]) => [`repos/acme/app/collaborators/${login}/permission`, { permission, role_name }]),
);

/** own-branch.mjs on pull request 7 of acme/app by `author`, whose branch `ref` lives in the repo `from`; issue 5 has `comments`. */
function own({ from = "acme/app", ref = "feat/5-share", author = "builder", comments = [CLAIM(ref)], args = ["7", "--repo", "acme/app"], env = {}, api = {} } = {}) {
  const dir = tmp("onrails-own-");
  const fake = fakeGh(dir, {
    ...PERMISSIONS,
    ...api,
    "repos/acme/app/pulls/7": { number: 7, user: author && { login: author }, head: { sha: HEAD, ref, repo: from && { full_name: from } } },
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
    "a claim with no branch": { comments: [say("Claimed by the loop at 09:10Z")] },
    "the branch named outside a claim": { comments: [say("Looks good on branch feat/5-share")] },
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
  assert.equal(own({ comments: [say(body)] }).status, 0, "the script reads the claim the skill writes");
  const step = skill.slice(skill.indexOf("1. **Local checks**"), skill.indexOf("2. **Code review.**"));
  const at = (text) => (assert.ok(step.includes(text), text), step.indexOf(text));
  assert.ok(at("own-branch.mjs <n> --repo <owner>/<repo>") < at("git fetch origin pull/<n>/head"));
  assert.ok(at("git fetch origin pull/<n>/head") < at("git worktree add --detach"));
  assert.ok(at("rev-parse HEAD` must print `<sha>`") < at("run the install"));
  assert.doesNotMatch(step, /\$sha\b|sha=\$\(/, "the sha is written out, never a shell variable");
});

test("AC-131-1: a pull request own-branch refuses leaves step 6 at once: it never reaches review, qa or any later step", () => {
  const skill = read(".agents/skills/coordinate/SKILL.md");
  const step6 = skill.slice(skill.indexOf("6. **Check each pull request"), skill.indexOf("7. **Merge through one queue"));
  const line = (exit) => step6.split("\n").find((l) => l.trim().startsWith(`- ${exit}`)) ?? "";
  assert.match(line("Exit 1"), /never check out or run its code/);
  for (const later of ["review", "`qa`", "the security review", "the human gate", "step 7"]) assert.ok(line("Exit 1").includes(later), later);
  assert.match(line("Exit 2"), /Run nothing else on it until it exits 0/);
  const laterSteps = ["2. **Code review.**", "3. **Acceptance**", "4. **Security review**", "5. **Human gate:**"];
  for (const later of laterSteps) assert.ok(step6.indexOf(line("Exit 1")) < step6.indexOf(later), later);
});

test("AC-131-1: every sha in coordinate's examples is the full 40 characters", () => {
  for (const file of [".agents/skills/coordinate/SKILL.md", ".agents/skills/coordinate/references/local-mode.md"]) {
    const shas = [...read(file).matchAll(/(?:sha=|@ )([0-9a-f]{6,})\b/g)].map((m) => m[1]);
    for (const sha of shas) assert.equal(sha.length, 40, `${file}: ${sha}`);
  }
  assert.match(read(".agents/skills/coordinate/references/local-mode.md"), /· status · sha=[0-9a-f]{40} ·/);
});

test("item 3 of the round 2 review: each run checks in a fresh mktemp folder, written out, and removes it", () => {
  const skill = read(".agents/skills/coordinate/SKILL.md");
  const step = skill.slice(skill.indexOf("1. **Local checks**"), skill.indexOf("2. **Code review.**"));
  assert.ok(step.indexOf("`mktemp -d`") < step.indexOf("git worktree add --detach <dir> <sha>"));
  assert.match(step, /Write that path into each command/);
  assert.match(step, /`git worktree remove --force <dir>`, then `git worktree prune`/);
  assert.doesNotMatch(step, /check-<n>|\$\{TMPDIR/, "no fixed folder a stopped run can leave behind");
});

test("round 3 review, item 2: step 6.1.2 points to 6.1.5 for the fail comment, not the top-level step 5", () => {
  const skill = read(".agents/skills/coordinate/SKILL.md");
  const step = skill.slice(skill.indexOf("2. Make a clean worktree"), skill.indexOf("3. In it, run the install"));
  assert.match(step, /post `Checks: fail @ <sha>` \(6\.1\.5\)/);
  assert.doesNotMatch(step, /\(step 5\)/);
});

test("round 3 review, item 3: step 8 checks main's own sha in a fresh folder and records it in docs/state.md only", () => {
  const skill = read(".agents/skills/coordinate/SKILL.md");
  const line = skill.split("\n").find((l) => l.includes("**Check main.**")) ?? "";
  const at = (text) => (assert.ok(line.includes(text), text), line.indexOf(text));
  assert.ok(at("`git fetch origin main`") < at("`git rev-parse origin/main`"));
  assert.ok(at("`git rev-parse origin/main`") < at("`mktemp -d`"));
  assert.ok(at("`mktemp -d`") < at("`git worktree add --detach <dir> <sha>`"));
  assert.ok(at("`git -C <dir> rev-parse HEAD` must print `<sha>`") < at("`check`"));
  assert.ok(at("`check`") < at("`Main's checks:` line of `docs/state.md`"));
  assert.ok(at("`Main's checks:` line of `docs/state.md`") < at("`git worktree remove --force <dir>`, then `git worktree prune`"));
  assert.match(line, /fetch no `pull\/<n>\/head` and post no pull request comment/);
  assert.doesNotMatch(line, /6\.1\.2|issues\/<n>\/comments|git fetch origin pull/, "no step that fetches a pull request or comments on one");
});

test("AC-131-1: a claim counts only from a login with write access or higher", unixOnly, () => {
  for (const login of ["keeper", "owner"]) assert.equal(own({ comments: [CLAIM("feat/5-share", login)] }).status, 0, login);
  for (const login of ["reader", "helper", "stranger", null]) {
    const r = own({ comments: [CLAIM("feat/5-share", login)] });
    assert.equal(r.status, 1, String(login));
    assert.equal(r.stdout, "", String(login));
    assert.match(r.stderr, /No claim comment on #5 names feat\/5-share/, String(login));
  }
  assert.equal(own({ comments: [CLAIM("feat/5-share", "reader"), CLAIM("feat/5-share")] }).status, 0, "a writer's claim still counts next to a reader's");
});

test("AC-131-1: the pull request's author must have write access or higher", unixOnly, () => {
  assert.equal(own({ author: "owner" }).status, 0);
  for (const author of ["reader", "helper", "stranger", null]) {
    const r = own({ author });
    assert.equal(r.status, 1, String(author));
    assert.equal(r.stdout, "", String(author));
    assert.match(r.stderr, /opened by .* without write access/, String(author));
    assert.doesNotMatch(r.calls, /issues\//, String(author));
  }
});

test("AC-131-1: a claim counts only as a whole line in the template's exact form", unixOnly, () => {
  const line = "Claimed by the loop at 2026-11-26T09:10Z · branch feat/5-share";
  const cases = {
    quoted: `> ${line}`,
    "inside other text": `As the old note said: ${line}`,
    "with words after the branch": `${line} (copied from #9)`,
    "with no time": "Claimed by the loop · branch feat/5-share",
    "with an open backtick": "Claimed by the loop at 09:10Z · branch `feat/5-share",
    "with a closing backtick only": "Claimed by the loop at 09:10Z · branch feat/5-share`",
    "in a code span": `\`${line}\``,
  };
  for (const [name, body] of Object.entries(cases)) {
    const r = own({ comments: [say(body)] });
    assert.equal(r.status, 1, name);
    assert.equal(r.stdout, "", name);
  }
  assert.equal(own({ comments: [say(`Hello\r\n${line}\r\nCheck by 11:10Z.`)] }).status, 0, "a whole line in a longer comment");
  assert.equal(own({ comments: [say("Claimed by the loop at 09:10Z · branch `feat/5-share`")] }).status, 0, "backticks as a pair");
});

test("AC-131-1: only feat/<n>-<name> or fix/<n>-<name>, with letters, digits, dots, dashes and underscores", unixOnly, () => {
  assert.equal(own({ ref: "fix/5-Share_v2.1" }).status, 0);
  for (const ref of ["feat/5-", "feat/5-share/more", "feat/5-share;true", "feat/5-sh are", "feat/5-share$x", "feat/5-sh`are", "feat/5-shére"]) {
    const r = own({ ref });
    assert.equal(r.status, 1, ref);
    assert.equal(r.stdout, "", ref);
    assert.match(r.stderr, /isn't a feat\/<n>- or fix\/<n>- branch/, ref);
    assert.doesNotMatch(r.calls, /issues\//, ref);
  }
});

// Round 3 review, item 1: an access check with no answer is an API error (exit 2), never "no write access" (exit 1).
const PERM = (login) => `repos/acme/app/collaborators/${login}/permission`;
const REFUSED = { ghError: "gh: Access to this GitHub API path is not permitted through this proxy. (HTTP 403)" };
const ME = (login, push) => ({ user: { login }, "repos/acme/app": { permissions: { admin: false, maintain: false, push, triage: true, pull: true } } });

test("AC-131-1: a proxy's 403 on the permission path exits 2 with no sha, not 1", unixOnly, () => {
  const r = own({ api: { [PERM("builder")]: REFUSED } });
  assert.equal(r.status, 2, r.stderr);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Couldn't check builder's access to acme\/app: .*not permitted through this proxy/);
  assert.doesNotMatch(r.stderr, /without write access/);
  assert.doesNotMatch(r.calls, /issues\//, "nothing after the author's check");
});

test("AC-131-1: a 5xx, a rate limit or a network error on any access check exits 2 with no sha", unixOnly, () => {
  const errors = {
    "a 502": "gh: Server Error (HTTP 502)",
    "a rate limit": "gh: API rate limit exceeded for user ID 1. (HTTP 403)",
    "a secondary limit": "gh: You have exceeded a secondary rate limit. (HTTP 429)",
    "the network": "error connecting to api.github.com",
  };
  for (const [name, ghError] of Object.entries(errors)) {
    // keeper only claims, so the second run covers the claim's check after the author passed.
    for (const [login, comments] of [["builder", undefined], ["keeper", [CLAIM("feat/5-share", "keeper")]]]) {
      const r = own({ comments, api: { [PERM(login)]: { ghError } } });
      assert.equal(r.status, 2, `${name}, ${login}: ${r.stderr}`);
      assert.equal(r.stdout, "", `${name}, ${login}`);
      assert.match(r.stderr, new RegExp(`Couldn't check ${login}'s access`), `${name}, ${login}`);
    }
  }
});

test("AC-131-1: where the permission path is refused, the token's own user passes on the repo's push permission", unixOnly, () => {
  const r = own({ api: { [PERM("builder")]: REFUSED, ...ME("Builder", true) } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${HEAD}: feat/5-share is this loop's branch for #5\n`);
  assert.equal(r.calls.split("\n").filter((c) => c === "api user").length, 1, "gh api user is read once, for the author and the claim");
});

test("AC-131-1: where the permission path is refused, the token's own user with push false exits 1 on that answer", unixOnly, () => {
  const r = own({ api: { [PERM("builder")]: REFUSED, ...ME("builder", false) } });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /opened by builder without write access/);
  assert.match(r.calls, /^api user$/m, "the answer came from the fallback");
  assert.match(r.calls, /^api repos\/acme\/app$/m, "the answer came from the fallback");
  const other = own({ api: { [PERM("builder")]: REFUSED, ...ME("someone-else", true) } });
  assert.equal(other.status, 2, "another user's push says nothing about builder");
  assert.equal(other.stdout, "");
});

test("AC-131-1: only a real read, triage or none, or a 404 for the user, is no write access; any other answer exits 2", unixOnly, () => {
  const nobody = { [PERM("nobody")]: { permission: "none", role_name: "none" } };
  for (const author of ["reader", "helper", "nobody", "stranger"]) {
    const r = own({ author, api: nobody });
    assert.equal(r.status, 1, author);
    assert.match(r.stderr, new RegExp(`opened by ${author} without write access`), author);
    assert.doesNotMatch(r.calls, /^api user$/m, `${author}: a real answer needs no fallback`);
  }
  const odd = own({ author: "odd", api: { [PERM("odd")]: { message: "no permission field" } } });
  assert.equal(odd.status, 2, odd.stderr);
  assert.equal(odd.stdout, "");
  assert.match(odd.stderr, /Couldn't check odd's access/);
});
