// #225: the local gate runs the pack's merge checks and the pull request rules, the builder posts its preview, and a
// refused `onrails/check` post never leaves a merge waiting. The two kit scripts run against a fake gh; the skill steps
// are text the agents read, so those tests read the text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const script = (name) => fileURLToPath(new URL(`../../.agents/skills/coordinate/scripts/${name}`, import.meta.url));
const HEAD = "d".repeat(40);
const coordinate = () => read(".agents/skills/coordinate/SKILL.md");
/** Step 6.1 of coordinate, the local checks, up to the code review. */
const localChecks = () => coordinate().slice(coordinate().indexOf("1. **Local checks**"), coordinate().indexOf("2. **Code review.**"));
/** One numbered sub-step of 6.1, up to the next one. */
const subStep = (n) => {
  const step = localChecks();
  const at = step.indexOf(`\n      ${n}. `);
  const next = step.indexOf(`\n      ${n + 1}. `, at + 1);
  return step.slice(at, next === -1 ? undefined : next);
};

test("AC-225-1: WHEN the project has check:merge and pr:rules THEN step 6.1 runs them on the exact head and records them in the Checks: comment", () => {
  const scripts = JSON.parse(read("stacks/tanstack-start/package.json")).scripts;
  for (const name of ["check:merge", "pr:rules", "deploy:preview"]) assert.ok(scripts[name], `the pack's package.json names ${name}`);
  const run = subStep(3);
  assert.match(run, /In it, run the install and `check`/, "in the clean worktree of the exact head");
  const at = (text) => (assert.ok(run.includes(text), text), run.indexOf(text));
  assert.ok(at("then `test:e2e` if the project has it") < at("`pnpm check:merge`"), "after check and test:e2e");
  assert.ok(at("`pnpm check:merge`") < at("`pnpm pr:rules <n>`"));
  assert.match(run, /where the head's `package\.json` has them/);
  const comment = subStep(5);
  assert.match(comment, /`Checks: pass @ <sha>` or `Checks: fail @ <sha>`/);
  assert.match(comment, /each command and its result/);
  assert.match(comment, /every check `check:merge` skipped, with its reason/);
  assert.match(comment, /A `check:merge` or `pr:rules` failure is `Checks: fail`/);
});

test("AC-225-2: WHEN the project has deploy:preview THEN build's finish steps run it after the pull request opens and after each push", () => {
  const build = read(".agents/skills/build/SKILL.md");
  const step12 = build.slice(build.indexOf("12. **Open the pull request"), build.indexOf("13. **Handing work on?**"));
  const bullet = step12.split("\n").find((l) => l.includes("pnpm deploy:preview <n>")) ?? "";
  assert.ok(bullet, "step 12 runs the preview");
  assert.match(bullet, /where the project's `package\.json` has `deploy:preview`/);
  assert.match(bullet, /once the pull request is open, and again after each push/);
  assert.match(bullet, /Link it in your report and on the pull request/);
  assert.ok(step12.indexOf("Open the pull request") < step12.indexOf(bullet), "after the pull request opens");
  assert.ok(build.indexOf(bullet) < build.indexOf("14. **Finish:**"), "before the finish step exits");
});

/** mark-check.mjs on HEAD of acme/app: `status` is the POST's answer, `rules` main's active rules (or a gh error). */
function mark({ status = {}, rules = [], args = [HEAD, "--repo", "acme/app", "--state", "success"] } = {}) {
  const dir = tmp("onrails-mark-");
  const fake = fakeGh(dir, {
    [`repos/acme/app/statuses/${HEAD}`]: status,
    "repos/acme/app": { default_branch: "main" },
    "repos/acme/app/rules/branches/main": rules,
  });
  const r = spawnSync(process.execPath, [script("mark-check.mjs"), ...args], { cwd: dir, encoding: "utf8", env: fake.env });
  return { ...r, calls: fake.calls() };
}
const REFUSED = { ghError: "gh: Write access to this GitHub API path is not permitted through this proxy (HTTP 403)" };
const requires = (...contexts) => [{ type: "deletion" }, { type: "required_status_checks", parameters: { required_status_checks: contexts.map((context) => ({ context })) } }];
const posts = (calls) => calls.split("\n").filter((l) => l.includes("POST")).length;

test("AC-225-3: WHEN the onrails/check post is refused on a repo whose main requires it THEN mark-check says to run setup-github, tries once and never waits", unixOnly, () => {
  const r = mark({ status: REFUSED, rules: requires("onrails/check") });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /GitHub refused the onrails\/check status here \(gh: Write access .*HTTP 403\)/);
  assert.match(r.stderr, /main requires onrails\/check, so no merge can pass/);
  assert.match(r.stderr, /node \.agents\/skills\/name\/scripts\/setup-github\.mjs/);
  assert.equal(posts(r.calls), 1, "one try, no retry loop");
  // A rule it can't read counts as one that requires it: setup-github's own probe settles it.
  const unknown = mark({ status: REFUSED, rules: { ghError: "HTTP 502: bad gateway" } });
  assert.equal(unknown.status, 3);
  assert.match(unknown.stderr, /couldn't read main's rules \(HTTP 502: bad gateway\)/);
});

test("AC-225-3: a refused post on a repo whose main doesn't require it exits 1, and a post that lands exits 0 without reading the rules", unixOnly, () => {
  const free = mark({ status: REFUSED, rules: requires("vercel") });
  assert.equal(free.status, 1);
  assert.match(free.stderr, /main doesn't require onrails\/check: the Checks: comment is the record/);
  const ok = mark({ args: [HEAD, "--repo", "acme/app", "--state", "failure", "--description", "pnpm check failed"] });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.calls, new RegExp(`-X POST -f state=failure -f context=onrails/check -f description=pnpm check failed repos/acme/app/statuses/${HEAD}`));
  assert.doesNotMatch(ok.calls, /rules\/branches/);
  for (const args of [["abc", "--repo", "acme/app", "--state", "success"], [HEAD, "--state", "success"], [HEAD, "--repo", "acme/app", "--state", "maybe"]]) {
    const bad = mark({ args });
    assert.equal(bad.status, 2, args.join(" "));
    assert.equal(bad.calls, "", "a usage error calls nothing");
  }
});

test("AC-225-3: step 6.1.4 runs mark-check once, and on a refused required status runs setup-github on Full or sends one decision below Full", () => {
  const step = subStep(4);
  assert.match(step, /node \.agents\/skills\/coordinate\/scripts\/mark-check\.mjs <sha> --repo <owner>\/<repo> --state success/);
  assert.match(step, /It tries once and never waits/);
  const exit3 = step.split("\n").find((l) => l.trim().startsWith("- Exit 3")) ?? "";
  assert.match(exit3, /On Full, run `node \.agents\/skills\/name\/scripts\/setup-github\.mjs` from this session now: its probe is refused here too, so it drops the requirement\./);
  assert.match(exit3, /Record "AI pick, not reviewed" and put its result in the next ℹ️ FYI\./);
  assert.match(exit3, /Below Full, send one ⏳ decision through `ask` that recommends that run/);
  assert.match(exit3, /Never wait for the status: go on to 6\.1\.5/);
  assert.doesNotMatch(step, /gh api repos\/<owner>\/<repo>\/statuses/, "the post goes through the script");
});

/** A pull request for pr-rules.mjs: number 9 of acme/app, from `branch`, with `body`, `labels` and the files changed. */
function rules({ body = "Adds sharing.\n\nCloses #5", branch = "feat/5-share", labels = [], author = "builder", files = [["src/a.ts", 10, 5]], sha = HEAD, attributes = "", args = ["9", "--repo", "acme/app", "--head", HEAD] } = {}) {
  const dir = tmp("onrails-rules-");
  execFileSync("git", ["init", "-q", dir], { env: safeEnv() });
  writeFileSync(join(dir, ".gitattributes"), attributes);
  const fake = fakeGh(dir, {
    "repos/acme/app/pulls/9": { number: 9, body, user: { login: author }, labels: labels.map((name) => ({ name })), head: { ref: branch, sha } },
    "repos/acme/app/pulls/9/files": files.map(([filename, additions, deletions]) => ({ filename, additions, deletions })),
  });
  const r = spawnSync(process.execPath, [script("pr-rules.mjs"), ...args], { cwd: dir, encoding: "utf8", env: fake.env });
  return { ...r, calls: fake.calls() };
}

test("AC-225-4: WHEN a project has no pr:rules THEN pr-rules.mjs still checks the issue link and the branch name", unixOnly, () => {
  const ok = rules();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /#9 @ d{40}: closes #5 from feat\/5-share, 15 changed lines/);
  for (const [why, pr, says] of [
    ["no closing keyword", { body: "See #5" }, /needs `Closes #<issue>`/],
    ["a branch with no issue", { branch: "share" }, /must look like feat\/<issue>-short-name or fix\/<issue>-short-name/],
    ["another prefix", { branch: "feature/5-share" }, /must look like feat\//],
    ["the two disagree", { branch: "fix/6-share" }, /The branch names issue #6 but the description closes #5/],
  ]) {
    const r = rules(pr);
    assert.equal(r.status, 1, why);
    assert.match(r.stderr, says, why);
  }
  assert.equal(rules({ body: "Fixes #5", branch: "fix/5-typo" }).status, 0, "Fixes and a fix/ branch");
  assert.equal(rules({ body: "", branch: "tidy", labels: ["no-issue"] }).status, 0, "the no-issue label");
  assert.equal(rules({ body: "", branch: "dependabot/npm_and_yarn/vite-8.4.0", author: "dependabot[bot]" }).status, 0, "Dependabot");
});

test("AC-225-4: WHEN a project has no pr:rules THEN pr-rules.mjs still checks the size, without lockfiles or files main marks generated", unixOnly, () => {
  const big = [["src/a.ts", 300, 150]];
  const over = rules({ files: big });
  assert.equal(over.status, 1);
  assert.match(over.stderr, /450 changed lines \(over 400, lockfiles and generated files not counted\)\. Split the pull request, or add the large-pr label/);
  assert.equal(rules({ files: big, labels: ["large-pr"] }).status, 0, "the large-pr label");
  assert.equal(rules({ files: [["src/a.ts", 200, 200]] }).status, 0, "400 is fine");
  const skipped = rules({
    files: [["src/a.ts", 10, 5], ["pnpm-lock.yaml", 900, 800], ["app/package-lock.json", 500, 0], ["yarn.lock", 1, 1], ["plugin/skills/a.md", 600, 0], ["docs/b.md", 3, 0]],
    attributes: "plugin/** linguist-generated\n",
  });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /18 changed lines/);
});

test("AC-225-4: pr-rules.mjs checks the exact head, and a usage or API error is exit 2", unixOnly, () => {
  const moved = rules({ sha: "e".repeat(40) });
  assert.equal(moved.status, 1);
  assert.match(moved.stderr, /The head moved: #9 is at e{40}, not d{40}\. Check the new head\./);
  const usage = rules({ args: ["9", "--repo", "acme/app"] });
  assert.equal(usage.status, 2);
  assert.equal(usage.calls, "");
  const missing = rules({ args: ["8", "--repo", "acme/app", "--head", HEAD] });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Couldn't read #8/);
});

test("AC-225-4: step 6.1.3 runs the kit's pr-rules.mjs from your checkout of main when the project has no pr:rules", () => {
  const run = subStep(3);
  assert.match(run, /No `pr:rules`\? From your own checkout of main, run `node \.agents\/skills\/coordinate\/scripts\/pr-rules\.mjs <n> --repo <owner>\/<repo> --head <sha>`/);
  assert.match(run, /the issue link, the branch name and the size/);
});

test("#225: the skills that waited on #225 say the local gate runs check:merge and pr:rules now", () => {
  assert.match(read(".agents/skills/issues/SKILL.md"), /The local gate \(`coordinate` step 6\.1\) runs it, or the kit's `pr-rules\.mjs` on a stack without it\./);
  assert.match(read(".agents/skills/dependencies/SKILL.md"), /`pnpm check:merge` on the web pack, which the local gate, `coordinate` step 6\.1, runs/);
  assert.match(read(".agents/skills/web-performance/SKILL.md"), /the web pack's `pnpm check:merge`, which the local gate runs/);
  for (const path of [".agents/skills/issues/SKILL.md", ".agents/skills/dependencies/SKILL.md", ".agents/skills/web-performance/SKILL.md"]) {
    assert.doesNotMatch(read(path), /once #225 lands/, path);
  }
});
