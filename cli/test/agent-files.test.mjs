// Tests for the agent-file guard (#117, from #103): the label passes on every level, and on Full
// automation a writer's weakening-review pass at the head commit passes unless a fail exists there.
// #103 AC-1: on Full, a rule change merges after the review with no person step.
// #103 AC-2: a weakening the review finds refuses the merge on every level.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUARD_WORKFLOW, changedPaths, decide, deletedTests, level, submodules, verdictOf, verifyMerge, verifyRuns } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
import { LOCAL_CHECK, localChecks, requiredChecks } from "../../.agents/skills/name/scripts/required-checks.mjs";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/agent-files.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const FULL = "## Automation level\n\n- **Level:** full  <!-- recommended | full | hands-on | custom -->\n";
const RECOMMENDED = "## Automation level\n\n- **Level:** recommended\n";
const WRITERS = new Set(["owner"]);
const say = (body, login = "owner", at = "2026-11-24T10:00:00Z") => ({ body, user: { login }, updated_at: at });
const PASS = (sha = HEAD, login, at) => say(`Weakening review: pass @ ${sha}`, login, at);
const FAIL = (sha = HEAD, login, at) => say(`Weakening review: fail @ ${sha}`, login, at);
const RULES = ["AGENTS.md", ".github/workflows/ci.yml", "src/app.ts"];
const full = (comments, more = {}) => decide({ changed: RULES, stack: FULL, comments, head: HEAD, trusted: WRITERS, ...more });

test("the level comes from the Level line, and is recommended when it's missing", () => {
  assert.equal(level(FULL), "full");
  assert.equal(level(RECOMMENDED), "recommended");
  assert.equal(level(""), "recommended");
});

test("no rule file changed: passes on every level", () => {
  assert.equal(decide({ changed: ["src/app.ts"], stack: RECOMMENDED }).pass, true);
});

test("#103 AC-2: a rename counts both names: moving AGENTS.md or a hook out of a protected path is caught", () => {
  const files = [{ filename: "notes.md", previous_filename: "AGENTS.md" }, { filename: "scripts/x.mjs", previous_filename: ".claude/hooks/x.mjs" }];
  assert.deepEqual(changedPaths(files), ["notes.md", "AGENTS.md", "scripts/x.mjs", ".claude/hooks/x.mjs"]);
  const r = decide({ changed: changedPaths(files), stack: RECOMMENDED });
  assert.equal(r.pass, false);
  assert.match(r.why, /AGENTS\.md/);
  assert.match(r.why, /\.claude\/hooks\/x\.mjs/);
});

test("#103: the human-approved label passes on Recommended and Hands-on, and doesn't count on Full", () => {
  assert.equal(decide({ changed: RULES, labels: ["human-approved"], stack: RECOMMENDED }).pass, true);
  assert.equal(decide({ changed: RULES, labels: ["human-approved"], stack: "- **Level:** hands-on\n" }).pass, true);
  const r = full([], { labels: ["human-approved"] });
  assert.equal(r.pass, false, "agents share the owner's login, so the label proves nothing on Full");
  assert.match(r.why, /the label doesn't count/);
});

test("#103 AC-2: Full: the label plus a writer's fail at the head fails", () => {
  assert.equal(full([FAIL(HEAD, "owner")], { labels: ["human-approved"] }).pass, false);
  assert.equal(full([PASS(), say(`Weakening review: fail @ ${HEAD} (removed a test)`)], { labels: ["human-approved"] }).pass, false);
});

test("#103: Full: a label that survives new commits doesn't cover the new head; only a pass at it does", () => {
  assert.equal(full([PASS(OLD)], { labels: ["human-approved"] }).pass, false, "pass at the old head, label still on");
  assert.equal(full([PASS(OLD), PASS(HEAD)], { labels: ["human-approved"] }).pass, true);
});

test("#103 AC-2: off Full, a writer's fail at the head refuses even with the label", () => {
  const r = decide({ changed: RULES, labels: ["human-approved"], stack: RECOMMENDED, comments: [FAIL()], head: HEAD, trusted: WRITERS });
  assert.equal(r.pass, false);
  assert.match(r.why, /refuses on every level/);
  assert.equal(decide({ changed: RULES, labels: ["human-approved"], stack: RECOMMENDED, comments: [FAIL(HEAD, "reader")], head: HEAD, trusted: WRITERS }).pass, true,
    "a non-writer's fail doesn't count");
});

test("#103: protected names ignore case, and the agent instruction files count at any depth", () => {
  for (const path of ["AGENTS.override.md", "CLAUDE.local.md", "GEMINI.md", "Claude.md", "agents.md", ".Claude/settings.local.json", ".Claude/skills/x/SKILL.md",
    ".AGENTS/skills/y.md", ".Codex/config.toml", ".codex", ".GitHub/workflows/x.yml", "Docs/Stack.md", "src/AGENTS.md", "app/CLAUDE.md", "pkg/AGENTS.override.md", "web/GEMINI.md"]) {
    const r = decide({ changed: [path], stack: RECOMMENDED });
    assert.equal(r.pass, false, path);
  }
  for (const path of ["src/agents-notes.md", "docs/claude-tips.md", "AGENTS.md.bak", "docs/stack.mdx", "src/claude/x.ts"]) {
    assert.equal(decide({ changed: [path], stack: RECOMMENDED }).pass, true, path);
  }
});

test("#103: nested .agents/, .claude/ and .codex/ folders are protected; .github/ and docs/stack.md only at the root", () => {
  for (const path of ["apps/web/.claude/skills/x/SKILL.md", "pkg/.agents/skills/x/SKILL.md", "sub/.codex/config.toml", "apps/web/.Claude/settings.json", "a/b/.codex"]) {
    assert.equal(decide({ changed: [path], stack: RECOMMENDED }).pass, false, path);
  }
  for (const path of ["apps/web/.github/notes.md", "apps/web/docs/stack.md", "src/my.claude/x.ts", "pkg/.agentsrc"]) {
    assert.equal(decide({ changed: [path], stack: RECOMMENDED }).pass, true, path);
  }
});

test("#103: a .gitmodules change and any submodule entry are protected", () => {
  assert.equal(decide({ changed: [".gitmodules"], stack: RECOMMENDED }).pass, false);
  assert.equal(decide({ changed: ["vendor/.gitmodules"], stack: RECOMMENDED }).pass, false);
  const files = [
    { filename: "vendor/kit", status: "added", patch: "@@ -0,0 +1 @@\n+Subproject commit " + "c".repeat(40) },
    { filename: "vendor/other", mode: "160000" },
    { filename: "src/app.ts", patch: "@@ -1 +1 @@\n-a\n+b" },
  ];
  assert.deepEqual(submodules(files), ["vendor/kit", "vendor/other"]);
  const r = decide({ changed: changedPaths(files), modules: submodules(files), stack: RECOMMENDED });
  assert.equal(r.pass, false);
  assert.match(r.why, /vendor\/kit \(a submodule\)/);
  assert.equal(decide({ changed: ["src/app.ts"], modules: [], stack: RECOMMENDED }).pass, true);
});

// #162: .mcp.json, the lint, format, type and test config, and the budget and check scripts are check code too.
const LINT_AND_TYPES = ["eslint.config.js", "apps/mobile/eslint.config.js", "eslint.workspace.config.js", "eslint-rules.js", ".prettierrc.json", "knip.jsonc",
  ".jscpd.json", "lefthook.yml", "tsconfig.app.json", "vitest.config.ts", "jest.config.js", "playwright.config.ts"];
const BUDGETS = ["lighthouserc.cjs", "scripts/budgets/check-budgets.ts", "scripts/check-merge.ts", "scripts/pr/rules.ts", "scripts/checks/merge-checks.ts"];

test("AC-162-1: WHEN a pull request changes .mcp.json or apps/web/.mcp.json on Recommended with no label THEN decide fails and names the file", () => {
  for (const path of [".mcp.json", "apps/web/.mcp.json"]) {
    const r = decide({ changed: [path, "src/app.ts"], stack: RECOMMENDED });
    assert.equal(r.pass, false, path);
    assert.match(r.why, new RegExp(path.replace(/[./]/g, "\\$&")), path);
    assert.doesNotMatch(r.why, /src\/app\.ts/);
  }
});

test("AC-162-1: the script: a files list with only .mcp.json on Recommended exits 1 and names it", () => {
  const dir = tmp("onrails-agent-files-mcp-");
  writeFileSync(join(dir, "files.json"), JSON.stringify([{ filename: ".mcp.json" }]));
  writeFileSync(join(dir, "stack.md"), RECOMMENDED);
  const r = spawnSync(process.execPath, [SCRIPT, "--files", join(dir, "files.json"), "--stack", join(dir, "stack.md")], { encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\.mcp\.json/);
});

test("AC-162-2: WHEN it changes any one lint, format, type or test-runner config THEN decide fails on Recommended with no label", () => {
  for (const path of LINT_AND_TYPES) {
    const r = decide({ changed: [path], stack: RECOMMENDED });
    assert.equal(r.pass, false, path);
    assert.ok(r.why.includes(path), `${path}: ${r.why}`);
  }
});

test("AC-162-3: WHEN it changes any one budget or check script THEN decide fails on Recommended with no label", () => {
  for (const path of BUDGETS) {
    const r = decide({ changed: [path], stack: RECOMMENDED });
    assert.equal(r.pass, false, path);
    assert.ok(r.why.includes(path), `${path}: ${r.why}`);
  }
});

test("AC-162-4: WHEN the level is Full and one of those files changes THEN a writer's pass at the head passes and a writer's fail at the head fails", () => {
  for (const path of [".mcp.json", ...LINT_AND_TYPES, ...BUDGETS]) {
    const go = (comments) => decide({ changed: [path], stack: FULL, comments, head: HEAD, trusted: WRITERS });
    assert.equal(go([]).pass, false, `${path}: no review`);
    assert.equal(go([PASS()]).pass, true, `${path}: a pass`);
    assert.equal(go([FAIL()]).pass, false, `${path}: a fail`);
  }
});

test("AC-162-5: WHEN it changes only near misses THEN decide passes", () => {
  const near = ["src/eslint-helpers.ts", "docs/tsconfig-notes.md", "vite.config.ts", "wrangler.jsonc", "scripts/deploy.ts", "src/budget.ts"];
  for (const path of near) assert.equal(decide({ changed: [path], stack: RECOMMENDED }).pass, true, path);
  assert.equal(decide({ changed: near, stack: RECOMMENDED }).pass, true);
});

test("#162: the issue's other protected names count at any depth and in any case; the other pack scripts don't", () => {
  for (const path of [".eslintrc.cjs", "web/.eslintignore", "eslint.base.config.mjs", "PRETTIER.config.js", ".prettierignore", "knip.json", "knip.config.ts",
    "lefthook.yaml", ".semgrep.yml", ".semgrep/rules.yml", "apps/web/.semgrep/x.yml", "TSConfig.json", "packages/a/tsconfig.base.json", "vitest.workspace.ts",
    "apps/mobile/jest.config.ts", "apps/web/playwright.config.ts", "apps/web/lighthouserc.json", "scripts/lint/lint-rules.test.ts", "scripts/migrations/rules.ts",
    "scripts/check-licenses.ts", "scripts/check-workspace-deps.js", "apps/web/scripts/budgets/bundle-graph.ts", "Scripts/PR/check.ts"]) {
    assert.equal(decide({ changed: [path], stack: RECOMMENDED }).pass, false, path);
  }
  for (const path of ["scripts/cloudflare/setup.ts", "scripts/connect/run.ts", "scripts/generate/new-route.ts", "scripts/deploy/lock.ts", "src/scripts/budgets.ts",
    "src/pr/rules.ts", "docs/knip.md", "src/lint/rules.ts", "src/check-input.ts", "vite.config.ts"]) {
    assert.equal(decide({ changed: [path], stack: RECOMMENDED }).pass, true, path);
  }
});

test("AC-162-6: full.md's weakening review names the guard's new paths", () => {
  const doc = read(".agents/skills/automation/references/full.md").split("## The weakening review")[1];
  for (const name of ["`.mcp.json`", "`eslint.config.*`", "`.prettierrc*`", "`knip.jsonc`", "`tsconfig*.json`", "`vitest.config.*`", "`playwright.config.*`",
    "`lighthouserc.*`", "`budgets/`", "`check-*`"]) {
    assert.ok(doc.includes(name), name);
  }
});

// #162 review, nice 2: the rename test above covers rule files; check files go through the same file list.
test("#162: --pr: a check file renamed away and a deleted check file both count", unixOnly, () => {
  const dir = tmp("onrails-agent-files-moved-");
  const files = [{ filename: "apps/web/lint-notes.js", previous_filename: "apps/web/eslint.config.js", status: "renamed" },
    { filename: "knip.jsonc", status: "removed" }];
  const go = (stack, comments) => {
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "stack.md"), stack);
    const p = "repos/acme/app";
    const fake = fakeGh(dir, { [`${p}/pulls/7`]: { head: { sha: HEAD }, changed_files: 2 }, [`${p}/pulls/7/files`]: files,
      [`${p}/issues/7/comments`]: comments, [`${p}/issues/7/labels`]: [], [`${p}/collaborators/owner/permission`]: { permission: "admin" } },
    { REPO: "acme/app", HEAD_SHA: HEAD });
    return spawnSync(process.execPath, [SCRIPT, "--pr", "7"], { cwd: dir, encoding: "utf8", env: fake.env });
  };
  const r = go(RECOMMENDED, []);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /apps\/web\/eslint\.config\.js/);
  assert.match(r.stderr, /knip\.jsonc/);
  assert.doesNotMatch(r.stderr, /lint-notes\.js/);
  assert.equal(go(FULL, [PASS()]).status, 0);
});

test("the script: a submodule in --files fails without a label", () => {
  const dir = tmp("onrails-agent-files-sub-");
  writeFileSync(join(dir, "files.json"), JSON.stringify([{ filename: "vendor/kit", patch: "+Subproject commit " + "d".repeat(40) }]));
  const r = spawnSync(process.execPath, [SCRIPT, "--files", join(dir, "files.json")], { encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /vendor\/kit \(a submodule\)/);
});

test("#103: Recommended: a pass comment doesn't count; only the label does", () => {
  const r = decide({ changed: RULES, stack: RECOMMENDED, comments: [PASS()], head: HEAD, trusted: WRITERS });
  assert.equal(r.pass, false);
  assert.match(r.why, /human-approved/);
  assert.doesNotMatch(r.why, /src\/app\.ts/);
});

test("#103 AC-1: Full: a writer's pass comment at the head commit passes", () => {
  assert.equal(full([PASS()]).pass, true);
});

test("#103 AC-2: Full: a pass at an older commit, a fail, or no comment fails and names the head", () => {
  for (const comments of [[PASS(OLD)], [FAIL()], []]) {
    const r = full(comments);
    assert.equal(r.pass, false, JSON.stringify(comments));
    assert.match(r.why, comments[0]?.body.includes("fail") ? new RegExp(`failed at ${HEAD}`) : new RegExp(`Weakening review: pass @ ${HEAD}`));
  }
});

test("#103 AC-2: Full: a fail at the head sticks: a later or edited pass doesn't undo it", () => {
  assert.equal(full([PASS(HEAD, "owner", "2026-11-24T10:00:00Z"), FAIL(HEAD, "owner", "2026-11-24T11:00:00Z")]).pass, false);
  assert.equal(full([FAIL(HEAD, "owner", "2026-11-24T10:00:00Z"), PASS(HEAD, "owner", "2026-11-24T12:00:00Z")]).pass, false);
  assert.match(full([FAIL(), PASS()]).why, /refuses on every level/);
});

test("#103 AC-2: Full: a fail line with words after the sha still counts; a pass line must be exact", () => {
  assert.equal(full([PASS(), say(`Weakening review: fail @ ${HEAD} (removed a test)`)]).pass, false);
  assert.equal(verdictOf(`Weakening review: fail @ ${HEAD}: the budget went up`, HEAD), "fail");
  assert.equal(verdictOf(`Weakening review: pass @ ${HEAD} (looks fine)`, HEAD), null);
});

test("#103: Full: a fail comment that was deleted, or edited to drop the fail line, no longer counts", () => {
  assert.equal(full([PASS(), say("Weakening review: (withdrawn)")]).pass, true);
});

test("#103: Full: a fail at an older commit doesn't block a pass at the new head", () => {
  assert.equal(full([FAIL(OLD), PASS()]).pass, true);
});

test("#103 AC-2: Full: one comment with both a pass and a fail line counts as a fail", () => {
  const both = say(`Weakening review: fail @ ${HEAD}\nWeakening review: pass @ ${HEAD}`);
  assert.equal(verdictOf(both.body, HEAD), "fail");
  assert.equal(full([both]).pass, false);
});

test("#103: Full: a pass from a login without write access doesn't count", () => {
  assert.equal(full([PASS(HEAD, "reader")]).pass, false);
});

test("#103: Full: a short sha or extra words on the line don't count", () => {
  assert.equal(full([say(`Weakening review: pass @ ${HEAD.slice(0, 7)}`), say(`Weakening review: pass @ ${HEAD} but see below`)]).pass, false);
});

test("#103 AC-1: the script: exit 0 on a Full pass, exit 1 on a renamed rule file with no pass", () => {
  const dir = tmp("onrails-agent-files-");
  const file = (name, text) => (writeFileSync(join(dir, name), text), join(dir, name));
  const files = file("files.json", JSON.stringify([{ filename: "notes.md", previous_filename: "AGENTS.md" }]));
  const args = (comments) => ["--files", files, "--stack", file("stack.md", FULL), "--comments", file("comments.json", JSON.stringify(comments)),
    "--head", HEAD, "--trusted", "owner"];
  const run = (a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: "utf8", env: safeEnv() });
  assert.equal(run(args([PASS()])).status, 0);
  const r = run(args([]));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /AGENTS\.md/);
});

test("#103: docs/stack.md is protected, so a pull request can't switch on Full for itself", () => {
  const r = decide({ changed: ["docs/stack.md"], stack: RECOMMENDED });
  assert.equal(r.pass, false);
  assert.match(r.why, /docs\/stack\.md/);
  assert.equal(decide({ changed: ["docs/stack-notes.md"], stack: RECOMMENDED }).pass, true);
});

test("#103 AC-2: more files than the API listed, or over 3000, fails closed", () => {
  const changed = ["-pad/1.md", "-pad/2.md"];
  assert.equal(decide({ changed, total: 2, stack: RECOMMENDED }).pass, true);
  const r = decide({ changed, total: 3001, stack: RECOMMENDED });
  assert.equal(r.pass, false);
  assert.match(r.why, /3001 files/);
  assert.equal(decide({ changed, total: 3, stack: RECOMMENDED }).pass, false, "a hidden third file");
  assert.equal(decide({ changed: [], total: 3000, labels: ["human-approved"] }).pass, false, "the label can't vouch for files nobody saw");
});

test("#103: a file name with a line break or control character fails, and isn't printed raw", () => {
  const r = decide({ changed: ["ok.md", "x\n::warning::forged"], stack: RECOMMENDED });
  assert.equal(r.pass, false);
  assert.match(r.why, /"x\\n::warning::forged"/);
});

test("#103: the head must be the event's head: a run that sees a newer head fails", () => {
  const r = full([PASS()], { expected: OLD });
  assert.equal(r.pass, false);
  assert.match(r.why, /head moved/);
  assert.equal(full([PASS()], { expected: HEAD }).pass, true);
});

const run = (id, more = {}) => ({ id, status: "completed", conclusion: "success", path: GUARD_WORKFLOW, event: "pull_request_target", ...more });

test("#103 AC-1: verify-run: the guard's latest pull_request_target run passed", () => {
  assert.equal(verifyRuns([run(1, { conclusion: "failure" }), run(2)]).pass, true);
});

test("#103 AC-2: verify-run: a check named agent-files from another workflow is refused", () => {
  const r = verifyRuns([run(1), run(2, { path: ".github/workflows/x.yml", event: "pull_request" })]);
  assert.equal(r.pass, false);
  assert.match(r.why, /x\.yml/);
});

test("#103 AC-2: verify-run: no guard run, only another event's run, a latest failure or one still running fails", () => {
  for (const runs of [[], [run(1, { event: "issue_comment" })], [run(1), run(2, { conclusion: "failure" })], [run(1, { status: "in_progress", conclusion: null })]]) {
    assert.equal(verifyRuns(runs).pass, false, JSON.stringify(runs));
  }
});

test("#103 AC-2: verify-run: a fail posted after the green run blocks the merge", () => {
  const green = [run(1)];
  assert.equal(verifyMerge(green, full([PASS()])).pass, true);
  const r = verifyMerge(green, full([PASS(HEAD, "owner", "2026-11-24T10:00:00Z"), FAIL(HEAD, "owner", "2026-11-24T11:00:00Z")]));
  assert.equal(r.pass, false);
  assert.match(r.why, /the guard fails now/);
});

test("the script: verify-run exits 0 on a real green run that still passes, 1 on a second workflow or a later fail", () => {
  const dir = tmp("onrails-verify-run-");
  const file = (name, data) => (writeFileSync(join(dir, name), typeof data === "string" ? data : JSON.stringify(data)), join(dir, name));
  const live = (comments) => ["--files", file("files.json", [{ filename: "AGENTS.md" }]), "--stack", file("stack.md", FULL),
    "--comments", file("comments.json", comments), "--head", HEAD, "--trusted", "owner"];
  const go = (runs, comments) => spawnSync(process.execPath, [SCRIPT, "verify-run", "--runs", file("runs.json", runs), ...live(comments)], { encoding: "utf8", env: safeEnv() }).status;
  assert.equal(go([run(1)], [PASS()]), 0);
  assert.equal(go([run(1), run(2, { path: ".github/workflows/fake.yml", event: "pull_request" })], [PASS()]), 1);
  assert.equal(go([run(1)], [PASS(), FAIL()]), 1, "a fail posted after the green run");
});

test("AC-132-3: main requires only the local gate's onrails/check status, never an Actions check", () => {
  assert.deepEqual(requiredChecks().map((c) => c.context), ["onrails/check"]);
  assert.equal(LOCAL_CHECK, "onrails/check");
  // A rule setup-github made before #132 required the old workflows' checks: they never report now.
  const old = [{ type: "deletion" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true,
    required_status_checks: [{ context: "checks" }, { context: "secrets" }, { context: "agent-files" }, { context: "vercel", integration_id: 8 }] } }];
  const swapped = localChecks(old);
  assert.deepEqual(swapped[1].parameters.required_status_checks, [{ context: "vercel", integration_id: 8 }, { context: "onrails/check" }], "keeps a check the kit didn't add");
  assert.equal(swapped[1].parameters.strict_required_status_checks_policy, true);
  assert.equal(localChecks(swapped), null, "already there: nothing changes");
  assert.deepEqual(localChecks([{ type: "deletion" }])[1].parameters.required_status_checks.map((c) => c.context), ["onrails/check"]);
});

test("the guard runs from the session: no pack or template ships its workflow, and its script is there", () => {
  for (const p of [".agents/skills/idea/templates/agent-files.yml", "stacks/tanstack-start/.github/workflows/agent-files.yml", "stacks/monorepo-expo/.github/workflows/agent-files.yml"]) {
    assert.throws(() => read(p), /ENOENT/, p);
  }
  // The script the workflow ran is what the session runs now; the tests above run it as a command.
  assert.ok(read(".agents/skills/coordinate/scripts/agent-files.mjs").length > 0);
});

test("#103, #132: setup-github requires onrails/check at every level, and never looks for a workflow", () => {
  const script = read(".agents/skills/name/scripts/setup-github.mjs");
  assert.match(script, /required_status_checks: requiredChecks\(\)/);
  assert.match(script, /localChecks\(/);
  assert.doesNotMatch(script, /\.github\/workflows/);
  assert.doesNotMatch(script, /FULL/, "the level never drops the check");
});

// #164: a deleted test, or one renamed away from a test name, is check code. Adding or editing one isn't.
const withFiles = (files, more = {}) => decide({ changed: changedPaths(files), deleted: deletedTests(files), stack: RECOMMENDED, head: HEAD, trusted: WRITERS, ...more });
const gone = (filename) => ({ filename, status: "removed" });

test("AC-164-1: WHEN notes.service.test.ts is removed THEN decide fails on Recommended with no label and names it as a deleted test", () => {
  const r = withFiles([gone("src/features/notes/notes.service.test.ts")]);
  assert.equal(r.pass, false);
  assert.match(r.why, /src\/features\/notes\/notes\.service\.test\.ts \(a deleted test\)/);
});

test("AC-164-1: the guard's test mode exits 1 and names the deleted test", () => {
  const dir = tmp();
  const files = join(dir, "files.json");
  writeFileSync(files, JSON.stringify([gone("src/features/notes/notes.service.test.ts")]));
  const r = spawnSync(process.execPath, [SCRIPT, "--files", files], { encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /notes\.service\.test\.ts \(a deleted test\)/);
});

test("AC-164-2: WHEN a test is renamed to a non-test name THEN decide fails; renamed to another test name THEN it passes", () => {
  assert.equal(withFiles([{ filename: "src/a.ts", previous_filename: "src/a.test.ts", status: "renamed" }]).pass, false);
  assert.equal(withFiles([{ filename: "src/b.test.ts", previous_filename: "src/a.test.ts", status: "renamed" }]).pass, true);
});

test("AC-164-3: WHEN any test-folder, spec, snapshot, template or Python test file is removed THEN decide fails", () => {
  for (const path of ["e2e/smoke.spec.ts", "apps/mobile/e2e/notes.yaml", "e2e/visual.spec.ts-snapshots/home-light-visual-phone.png",
    "scripts/generate/templates/parts/component.test.tsx.tpl", "tests/helpers.py"]) {
    assert.equal(withFiles([gone(path)]).pass, false, path);
  }
});

test("AC-164-4: WHEN a test file is only added or modified THEN decide passes", () => {
  assert.equal(withFiles([{ filename: "src/a.test.ts", status: "added" }, { filename: "e2e/smoke.spec.ts", status: "modified" }]).pass, true);
});

test("AC-164-5: WHEN a removed file is a near miss THEN decide passes", () => {
  for (const path of ["src/testing-utils.ts", "docs/test-plan.md", "src/contest.ts"]) assert.equal(withFiles([gone(path)]).pass, true, path);
});

test("AC-164-6: WHEN the level is Full and a test is deleted THEN a writer's pass at the head passes and a writer's fail fails", () => {
  const files = [gone("src/a.test.ts")];
  assert.equal(withFiles(files, { stack: FULL, comments: [PASS()] }).pass, true);
  assert.equal(withFiles(files, { stack: FULL, comments: [FAIL()] }).pass, false);
});
