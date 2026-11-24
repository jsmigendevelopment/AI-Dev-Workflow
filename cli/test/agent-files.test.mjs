// Tests for the agent-file guard (#111 review, from #103): the label passes on every level, and on
// Full automation the latest weakening-review verdict at the head commit, from a writer, decides.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { changedPaths, decide, level, verdictOf } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
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

test("a rename counts both names: moving AGENTS.md or a hook out of a protected path is caught", () => {
  const files = [{ filename: "notes.md", previous_filename: "AGENTS.md" }, { filename: "scripts/x.mjs", previous_filename: ".claude/hooks/x.mjs" }];
  assert.deepEqual(changedPaths(files), ["notes.md", "AGENTS.md", "scripts/x.mjs", ".claude/hooks/x.mjs"]);
  const r = decide({ changed: changedPaths(files), stack: RECOMMENDED });
  assert.equal(r.pass, false);
  assert.match(r.why, /AGENTS\.md/);
  assert.match(r.why, /\.claude\/hooks\/x\.mjs/);
});

test("the human-approved label passes on every level", () => {
  assert.equal(decide({ changed: RULES, labels: ["human-approved"], stack: RECOMMENDED }).pass, true);
  assert.equal(full([], { labels: ["human-approved"] }).pass, true);
});

test("Recommended: a pass comment doesn't count; only the label does", () => {
  const r = decide({ changed: RULES, stack: RECOMMENDED, comments: [PASS()], head: HEAD, trusted: WRITERS });
  assert.equal(r.pass, false);
  assert.match(r.why, /human-approved/);
  assert.doesNotMatch(r.why, /src\/app\.ts/);
});

test("Full: a writer's pass comment at the head commit passes", () => {
  assert.equal(full([PASS()]).pass, true);
});

test("Full: a pass at an older commit, a fail, or no comment fails and names the head", () => {
  for (const comments of [[PASS(OLD)], [FAIL()], []]) {
    const r = full(comments);
    assert.equal(r.pass, false, JSON.stringify(comments));
    assert.match(r.why, new RegExp(`Weakening review: pass @ ${HEAD}`));
  }
});

test("Full: the latest verdict at the head wins, in either order", () => {
  assert.equal(full([PASS(HEAD, "owner", "2026-11-24T10:00:00Z"), FAIL(HEAD, "owner", "2026-11-24T11:00:00Z")]).pass, false);
  assert.equal(full([FAIL(HEAD, "owner", "2026-11-24T10:00:00Z"), PASS(HEAD, "owner", "2026-11-24T11:00:00Z")]).pass, true);
  assert.match(full([PASS(HEAD, "owner", "2026-11-24T10:00:00Z"), FAIL(HEAD, "owner", "2026-11-24T11:00:00Z")]).why, /failed at/);
});

test("Full: one comment with both a pass and a fail line counts as a fail", () => {
  const both = say(`Weakening review: fail @ ${HEAD}\nWeakening review: pass @ ${HEAD}`);
  assert.equal(verdictOf(both.body, HEAD), "fail");
  assert.equal(full([both]).pass, false);
});

test("Full: a pass from a login without write access doesn't count", () => {
  assert.equal(full([PASS(HEAD, "reader")]).pass, false);
});

test("Full: a short sha or extra words on the line don't count", () => {
  assert.equal(full([say(`Weakening review: pass @ ${HEAD.slice(0, 7)}`), say(`Weakening review: pass @ ${HEAD} but see below`)]).pass, false);
});

test("the script: exit 0 on a Full pass, exit 1 on a renamed rule file with no pass", () => {
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

const WORKFLOWS = [".agents/skills/idea/templates/agent-files.yml", "stacks/tanstack-start/.github/workflows/agent-files.yml", "stacks/monorepo-expo/.github/workflows/agent-files.yml"];
const CI = [".agents/skills/idea/templates/ci.yml", "stacks/tanstack-start/.github/workflows/ci.yml", "stacks/monorepo-expo/.github/workflows/ci.yml"];

test("the guard has its own workflow: default-branch triggers, read-only token, base checkout only", () => {
  for (const p of WORKFLOWS) {
    const yml = read(p);
    assert.match(yml, /pull_request_target:\n\s+types: \[opened, synchronize, reopened, labeled, unlabeled\]/, p);
    assert.match(yml, /issue_comment:\n\s+types: \[created, edited, deleted\]/, p);
    assert.match(yml, /permissions:\n\s+contents: read\n\s+pull-requests: read\n\s+issues: read\n/, p);
    assert.doesNotMatch(yml, /: write\b/, p);
    assert.match(yml, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.repository\.default_branch \}\}/, p);
    assert.doesNotMatch(yml, /pull_request\.head|refs\/pull|pull\/.*\/head/, p);
    assert.match(yml, /node "\$guard" --pr "\$PR"/, p);
    assert.match(yml, /previous_filename/, p);
    assert.match(yml, /\\\.codex\//, p);
    assert.match(yml, /^ {2}agent-files:$/m, p);
  }
});

test("ci.yml no longer has the agent-files job", () => {
  for (const p of CI) assert.doesNotMatch(read(p), /agent-files/, p);
});

test("setup-github requires agent-files on main at every level", () => {
  assert.match(read(".agents/skills/name/scripts/setup-github.mjs"), /required_status_checks: \[\{ context: "checks" \}, \{ context: "secrets" \}, \{ context: "agent-files" \}\]/);
});
