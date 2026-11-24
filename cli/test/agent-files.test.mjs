// Tests for the agent-file guard (#117, from #103): the label passes on every level, and on Full
// automation a writer's weakening-review pass at the head commit passes unless a fail exists there.
// #103 AC-1: on Full, a rule change merges after the review with no person step.
// #103 AC-2: a weakening the review finds refuses the merge on every level.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUARD_WORKFLOW, changedPaths, decide, level, verdictOf, verifyRuns } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
import { addAgentFiles, requiredChecks } from "../../.agents/skills/name/scripts/required-checks.mjs";
import { tmp } from "./helpers.mjs";

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

test("#103: the human-approved label passes on every level", () => {
  assert.equal(decide({ changed: RULES, labels: ["human-approved"], stack: RECOMMENDED }).pass, true);
  assert.equal(full([], { labels: ["human-approved"] }).pass, true);
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
    assert.match(r.why, new RegExp(`Weakening review: pass @ ${HEAD}`));
  }
});

test("#103 AC-2: Full: a fail at the head sticks: a later or edited pass doesn't undo it", () => {
  assert.equal(full([PASS(HEAD, "owner", "2026-11-24T10:00:00Z"), FAIL(HEAD, "owner", "2026-11-24T11:00:00Z")]).pass, false);
  assert.equal(full([FAIL(HEAD, "owner", "2026-11-24T10:00:00Z"), PASS(HEAD, "owner", "2026-11-24T12:00:00Z")]).pass, false);
  assert.match(full([FAIL(), PASS()]).why, /a fail sticks/);
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
  const run = (a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: "utf8" });
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

test("#103 AC-2: verify-run: no guard run, only an issue_comment run, a latest failure or one still running fails", () => {
  for (const runs of [[], [run(1, { event: "issue_comment" })], [run(1), run(2, { conclusion: "failure" })], [run(1, { status: "in_progress", conclusion: null })]]) {
    assert.equal(verifyRuns(runs).pass, false, JSON.stringify(runs));
  }
});

test("the script: verify-run --runs exits 0 on a real green run and 1 on a second agent-files workflow", () => {
  const dir = tmp("onrails-verify-run-");
  const file = (runs) => (writeFileSync(join(dir, "runs.json"), JSON.stringify(runs)), join(dir, "runs.json"));
  const go = (runs) => spawnSync(process.execPath, [SCRIPT, "verify-run", "--runs", file(runs)], { encoding: "utf8" }).status;
  assert.equal(go([run(1)]), 0);
  assert.equal(go([run(1), run(2, { path: ".github/workflows/fake.yml", event: "pull_request" })]), 1);
});

test("slice 0: agent-files is required only once its workflow is on the default branch", () => {
  assert.deepEqual(requiredChecks(false).map((c) => c.context), ["checks", "secrets"]);
  assert.deepEqual(requiredChecks(true).map((c) => c.context), ["checks", "secrets", "agent-files"]);
  const rules = [{ type: "deletion" }, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: requiredChecks(false) } }];
  assert.equal(addAgentFiles(rules, false), null, "no workflow yet: nothing added");
  const added = addAgentFiles(rules, true);
  assert.deepEqual(added[1].parameters.required_status_checks.map((c) => c.context), ["checks", "secrets", "agent-files"]);
  assert.equal(added[1].parameters.strict_required_status_checks_policy, true);
  assert.equal(addAgentFiles(added, true), null, "already there: nothing changes");
  assert.deepEqual(addAgentFiles([{ type: "deletion" }], true)[1].parameters.required_status_checks.map((c) => c.context), ["checks", "secrets", "agent-files"]);
});

const WORKFLOWS = [".agents/skills/idea/templates/agent-files.yml", "stacks/tanstack-start/.github/workflows/agent-files.yml", "stacks/monorepo-expo/.github/workflows/agent-files.yml"];
const CI = [".agents/skills/idea/templates/ci.yml", "stacks/tanstack-start/.github/workflows/ci.yml", "stacks/monorepo-expo/.github/workflows/ci.yml"];

test("the guard has its own workflow: default-branch triggers, read-only token, base checkout only", () => {
  for (const p of WORKFLOWS) {
    const yml = read(p);
    assert.match(yml, /pull_request_target:\n\s+types: \[opened, synchronize, reopened, edited, labeled, unlabeled\]/, p);
    assert.match(yml, /issue_comment:\n\s+types: \[created, edited, deleted\]/, p);
    assert.match(yml, /permissions:\n\s+contents: read\n\s+pull-requests: read\n\s+issues: read\n/, p);
    assert.doesNotMatch(yml, /: write\b/, p);
    assert.match(yml, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n/, p);
    assert.match(yml, /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/, p);
    assert.match(yml, /\$total" -gt 3000/, p);
    assert.match(yml, /docs\/stack\\\.md\$/, p);
    assert.doesNotMatch(yml, /ref: .*head|refs\/pull|pull\/.*\/head/, p);
    assert.match(yml, /node "\$guard" --pr "\$PR"/, p);
    assert.match(yml, /previous_filename/, p);
    assert.match(yml, /\\\.codex\//, p);
    assert.match(yml, /^ {2}agent-files:$/m, p);
  }
});

test("ci.yml no longer has the agent-files job", () => {
  for (const p of CI) assert.doesNotMatch(read(p), /agent-files/, p);
});

test("#103: setup-github requires agent-files at every level, once the workflow exists", () => {
  const script = read(".agents/skills/name/scripts/setup-github.mjs");
  assert.match(script, /required_status_checks: requiredChecks\(hasGuard\)/);
  assert.match(script, /addAgentFiles\(/);
  assert.doesNotMatch(script, /FULL/, "the level never drops the check");
});
