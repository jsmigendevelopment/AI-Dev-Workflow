// #225: the local gate runs the pack's merge checks and the pull request rules, the builder posts its preview, and a
// refused `onrails/check` post never leaves a merge waiting. The two kit scripts run against a fake gh; the skill steps
// are text the agents read, so those tests read the text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fakeGh, nodeOnly, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { HEAD, rules } from "./pr-rules-fakes.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const script = (name) => fileURLToPath(new URL(`../../.agents/skills/coordinate/scripts/${name}`, import.meta.url));
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
  assert.match(run, /In it, run the install and `check`/, "in the clean clone of the exact head");
  const at = (text) => (assert.ok(run.includes(text), text), run.indexOf(text));
  assert.ok(at("then `test:e2e` if the project has it") < at("`pnpm check:merge`"), "after check and test:e2e");
  assert.ok(at("`pnpm check:merge`") < at("`node .agents/skills/coordinate/scripts/pr-rules.mjs <n>"), "then the rules");
  const comment = subStep(5);
  assert.match(comment, /`Checks: pass @ <sha>` or `Checks: fail @ <sha>`/);
  assert.match(comment, /each command and its result/);
  assert.match(comment, /every check `check:merge` skipped, with its reason/);
  assert.match(comment, /A `check:merge` failure, `pr-rules\.mjs` exit 1, or a merge check main has and the head dropped is `Checks: fail`; a skip isn't\./);
});

/** Lines that give a command a token: a clause that names a token and isn't only about unsetting it. */
function tokenGrants(text) {
  const names = /\btokens?\b|[A-Z_]TOKEN\b/i;
  const grants = /\bwith (?:the |a |your )?(?:`[A-Z_]*TOKEN`|[\w ]*\btokens?\b)(?!\s+unset)|`[A-Z_]*TOKEN` set\b|\b(?:keeps?|gets?|reach(?:es)?|except)\b|\bunset only\b|\b(?:stays?|remains?|left) set\b|\bin place\b|\bleave\b/i;
  const unsetOnly = (clause) => /\bunset\b|`env -u /i.test(clause) && !grants.test(clause);
  return text.split("\n").filter((line) => line.split(/(?<=[.;:])\s+/).some((clause) => names.test(clause) && !unsetOnly(clause)));
}
/** The grants a step must not have: one not about your checkout of main, or one about the head's clone ("In it"). */
const headGrants = (text) => tokenGrants(text).filter((line) => !/from your own checkout of main/.test(line) || /\bIn it\b|head's (?:worktree|clone)/.test(line));

test("AC-225-1: every command in the head's clone runs with tokens unset, and only main's copy of the rules gets the token", () => {
  const run = subStep(3);
  assert.match(run, /\*\*In the head's clone, every command runs with tokens unset and an empty home, with no exception\.\*\*/);
  assert.match(run, /`env -i PATH="\$PATH" HOME=<home> /);
  // Any line that gives a command a token must be about your checkout of main, never the head's clone.
  assert.ok(tokenGrants(run).length, "one line names the command that gets the token");
  assert.deepEqual(headGrants(run), []);
  // Round 2 review, nice item 1: these phrasings give a command in the head's clone a token, so they must be caught.
  const rule = run.split("\n").find((line) => line.includes("every command runs with tokens unset")) ?? "";
  for (const added of [
    "\n         - In the head's clone, run `pnpm check:merge` with `GH_TOKEN` set.",
    "\n         - In it, run `node scripts/audit.mjs` with the GitHub token.",
    "\n         - In it, `pnpm pr:rules <n>` keeps the GitHub token.",
    "\n         - In it, run `pnpm deploy:preview <n>` with `CLOUDFLARE_API_TOKEN` set and the rest unset.",
    // Round 3 review, nice item 6: a clause that says "unset" and keeps a token in other words.
    "\n         - In it, the GitHub token stays set for `pnpm audit`, every other token unset.",
    "\n         - In it, leave `GH_TOKEN` in place for `pnpm check:merge` and unset the rest.",
  ]) assert.notDeepEqual(headGrants(run + added), [], added);
  assert.notDeepEqual(headGrants(run.replace(rule, `${rule} In it, run \`node scripts/audit.mjs\` with the GitHub token.`)), [], "added to the unset rule");
  assert.match(run, /from your own checkout of main, run `node \.agents\/skills\/coordinate\/scripts\/pr-rules\.mjs <n> --repo <owner>\/<repo> --head <sha>`: the issue link, the branch name and the size\. It is the one command here that gets the GitHub token/);
  // The head's own pr:rules never runs: the head would decide what the token reaches.
  assert.doesNotMatch(run.replace("Never run the head's `pnpm pr:rules`", ""), /`pnpm pr:rules/);
  assert.match(run, /A pack whose `pr:rules` checks more\? Run main's copy of it from your checkout of main, against the head's files, never the head's copy\./);
});

test("#225: main's package.json decides which merge checks run, so a pull request can't drop its own", () => {
  const run = subStep(3);
  assert.match(run, /Main's `package\.json`, in your checkout, decides whether `test:e2e` and `check:merge` run, not the head's: run each one that main's or the head's has\. One main has and the head dropped is `Checks: fail`/);
  assert.doesNotMatch(run, /where the head's `package\.json` has them/);
});

test("#225: pr-rules.mjs exit 1 is a fail, a list cut short included, and exit 2 never gives Checks: pass and tries again next sweep", () => {
  assert.match(subStep(3), /`pr-rules\.mjs` exit 1 is `Checks: fail`, a file list GitHub cut short on two reads in a row included\. Exit 2 \(a usage or API error, or counts that don't add up on two reads in a row\) never gives `Checks: pass`: post no verdict, and try again next sweep\./);
  assert.match(subStep(5), /`pr-rules\.mjs` exit 2 never gives `Checks: pass`: post no verdict, and try again next sweep\./);
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

/** mark-check.mjs on HEAD of acme/app: `status` is the POST's answer, `rules` main's active rules (or a gh error),
 * `classic` the required status checks of main's classic branch protection. `env` replaces the fake gh's env. */
function mark({ status = {}, rules = [], classic = { contexts: [], checks: [] }, args = [HEAD, "--repo", "acme/app", "--state", "success"], env } = {}) {
  const dir = tmp("onrails-mark-");
  const fake = fakeGh(dir, {
    [`repos/acme/app/statuses/${HEAD}`]: status,
    "repos/acme/app": { default_branch: "main" },
    "repos/acme/app/rules/branches/main": rules,
    "repos/acme/app/branches/main": { name: "main", protection: { enabled: true, required_status_checks: { enforcement_level: "everyone", ...classic } } },
  });
  const r = spawnSync(process.execPath, [script("mark-check.mjs"), ...args], { cwd: dir, encoding: "utf8", env: env ?? fake.env });
  return { ...r, calls: fake.calls() };
}
const REFUSED = { ghError: "gh: Write access to this GitHub API path is not permitted through this proxy (HTTP 403)" };
const requires = (...contexts) => [{ type: "deletion" }, { type: "required_status_checks", parameters: { required_status_checks: contexts.map((context) => ({ context })) } }];
const posts = (calls) => calls.split("\n").filter((l) => l.includes("POST")).length;

test("AC-225-3: WHEN the onrails/check post is refused on a repo whose main requires it THEN mark-check says to run setup-github, tries once and never waits", unixOnly, () => {
  const r = mark({ status: REFUSED, rules: requires("onrails/check") });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /GitHub refused the onrails\/check status here \(gh: Write access .*HTTP 403\)/);
  assert.match(r.stderr, /main requires onrails\/check \(a ruleset\), so no merge can pass/);
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

test("AC-225-3: a classic branch protection that requires onrails/check counts as required too", unixOnly, () => {
  for (const classic of [{ contexts: ["onrails/check"], checks: [] }, { contexts: [], checks: [{ context: "onrails/check", app_id: null }] }]) {
    const r = mark({ status: REFUSED, rules: [], classic });
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, /main requires onrails\/check \(its branch protection\), so no merge can pass/);
    assert.match(r.stderr, /Another rule that requires it needs removing in the repo's settings\./);
    assert.equal(posts(r.calls), 1, "one try, no retry loop");
  }
  const other = mark({ status: REFUSED, rules: [], classic: { contexts: ["vercel"], checks: [] } });
  assert.equal(other.status, 1, other.stderr);
});

test("AC-225-3: with no gh on PATH, mark-check says gh isn't installed and exits 3", unixOnly, () => {
  const r = mark({ env: safeEnv({ PATH: nodeOnly() }) });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /gh isn't installed here \(or not on PATH\), so onrails\/check wasn't posted and main's rules couldn't be read/);
  assert.doesNotMatch(r.stderr, /ENOENT|GitHub refused/);
});

test("AC-225-3: step 6.1.4 runs mark-check once, and on a refused required status runs setup-github on Full or sends one decision below Full", () => {
  const step = subStep(4);
  assert.match(step, /node \.agents\/skills\/coordinate\/scripts\/mark-check\.mjs <sha> --repo <owner>\/<repo> --state success/);
  assert.match(step, /It tries once and never waits/);
  const exit3 = step.split("\n").find((l) => l.trim().startsWith("- Exit 3")) ?? "";
  assert.match(exit3, /On Full, run `node \.agents\/skills\/name\/scripts\/setup-github\.mjs --plan <plan>` from this session now: its probe is refused here too, so it drops the requirement\./);
  assert.match(exit3, /`<plan>` is `github_plan` from `docs\/profile\.toml` or `~\/\.onrails\/profile\.toml`, else `team` \(main has a rule, which a private repo gets only on Team or above\), so it never asks at a terminal\./);
  assert.match(exit3, /Record "AI pick, not reviewed" and put its result in the next ℹ️ FYI\./);
  assert.match(exit3, /Below Full, send one ⏳ decision through `ask` that recommends that run/);
  assert.match(exit3, /Never wait for the status: go on to 6\.1\.5/);
  assert.doesNotMatch(step, /gh api repos\/<owner>\/<repo>\/statuses/, "the post goes through the script");
  const again = step.split("\n").find((l) => l.trim().startsWith("- Exit 3 again")) ?? "";
  assert.match(again, /`setup-github\.mjs` drops the requirement only from its own `protect-main` ruleset/);
  assert.match(again, /Don't run it again: send one ℹ️ FYI per run of the loop that names that rule, not one per sweep/);
});

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

test("AC-225-4: a renamed file is skipped only when its old and new names are both lockfiles or generated", unixOnly, () => {
  const attributes = "plugin/** linguist-generated\n";
  const moved = rules({ files: [["plugin/moved.ts", 700, 650, "src/core.ts"]], attributes });
  assert.equal(moved.status, 1, "a rename into plugin/ counts");
  assert.match(moved.stderr, /1350 changed lines \(over 400/);
  const locked = rules({ files: [["pnpm-lock.yaml", 900, 0, "src/data.json"]], attributes });
  assert.equal(locked.status, 1, "a rename to pnpm-lock.yaml counts");
  assert.match(locked.stderr, /900 changed lines \(over 400/);
  const both = rules({ files: [["plugin/b.md", 900, 0, "plugin/a.md"], ["pnpm-lock.yaml", 800, 0, "app/pnpm-lock.yaml"], ["src/a.ts", 3, 0]], attributes });
  assert.equal(both.status, 0, both.stderr);
  assert.match(both.stdout, /3 changed lines/);
});

test("AC-225-4: WHEN GitHub lists fewer files than the pull request changes on two reads in a row THEN pr-rules.mjs fails (exit 1), never a pass", unixOnly, () => {
  const files = Array.from({ length: 3000 }, (_, i) => [`plugin/f${i}.md`, 33, 0]);
  const cut = rules({ files, changed: 3500, attributes: "plugin/** linguist-generated\n" });
  assert.equal(cut.status, 1, cut.stderr);
  assert.match(cut.stderr, /GitHub listed 3000 of the 3500 files #9 changes, twice \(its list stops at 3000\), so the size can't be counted\. Split the pull request\. That's a fail, never a pass\./);
  assert.equal(cut.stdout, "");
  assert.equal(cut.calls.split("\n").filter((l) => l.endsWith("repos/acme/app/pulls/9/files")).length, 2, "read twice, then decided");
  // A list cut short once and whole on the second read is counted as usual.
  const once = rules({ files, changed: 3500, again: { pull: { changed_files: 1, additions: 10, deletions: 5 }, files: [["src/a.ts", 10, 5]] } });
  assert.equal(once.status, 0, once.stderr);
  assert.match(once.stdout, /15 changed lines/);
  const unknown = rules({ changed: null });
  assert.equal(unknown.status, 2, "no changed_files is never a pass");
});

test("#225: the kit repo's .gitattributes counts the two plugin manifests people edit, and the pack marks its generated files", unixOnly, () => {
  const kit = rules({
    files: [["plugin/.claude-plugin/plugin.json", 300, 0], ["plugin/.codex-plugin/plugin.json", 200, 0], ["plugin/skills/a.md", 900, 0], [".claude/skills/b.md", 900, 0], ["cli/README.md", 500, 0]],
    attributes: read(".gitattributes"),
  });
  assert.equal(kit.status, 1);
  assert.match(kit.stderr, /500 changed lines \(over 400/);
  const pack = rules({
    files: [["src/routeTree.gen.ts", 500, 0], ["migrations/meta/0001_snapshot.json", 2000, 0], ["e2e/visual.spec.ts-snapshots/home.txt", 700, 0], ["worker-configuration.d.ts", 4000, 0], ["src/a.ts", 10, 5]],
    attributes: read("stacks/tanstack-start/.gitattributes"),
  });
  assert.equal(pack.status, 0, pack.stderr);
  assert.match(pack.stdout, /15 changed lines/);
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

test("AC-225-4: step 6.1.3 runs the kit's pr-rules.mjs from your checkout of main on every stack, so one without pr:rules gets it too", () => {
  const run = subStep(3);
  assert.match(run, /\*\*The pull request rules, on every stack:\*\* from your own checkout of main, run `node \.agents\/skills\/coordinate\/scripts\/pr-rules\.mjs <n> --repo <owner>\/<repo> --head <sha>`/);
  assert.match(run, /the issue link, the branch name and the size/);
});

test("#225: the skills that waited on #225 say the local gate runs check:merge and pr:rules now", () => {
  // The issues line is pinned in no-actions-mentions.test.mjs; these two are stricter than its matches there.
  assert.match(read(".agents/skills/dependencies/SKILL.md"), /`pnpm check:merge` on the web pack, which the local gate, `coordinate` step 6\.1, runs/);
  assert.match(read(".agents/skills/web-performance/SKILL.md"), /the web pack's `pnpm check:merge`, which the local gate runs/);
  for (const path of [".agents/skills/issues/SKILL.md", ".agents/skills/dependencies/SKILL.md", ".agents/skills/web-performance/SKILL.md"]) {
    assert.doesNotMatch(read(path), /once #225 lands/, path);
  }
});
