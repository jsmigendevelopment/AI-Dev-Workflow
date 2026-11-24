// Tests for CI's agent-files guard (#111 review, from #103): the label passes on every level, and on
// Full automation the weakening review's pass comment at the head commit passes too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, level } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
import { tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/agent-files.mjs", import.meta.url));
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const FULL = "## Automation level\n\n- **Level:** full  <!-- recommended | full | hands-on | custom -->\n";
const RECOMMENDED = "## Automation level\n\n- **Level:** recommended\n";
const PASS = (sha, who = "OWNER") => ({ body: `Weakening review: pass @ ${sha}`, author_association: who });
const RULES = ["AGENTS.md", ".github/workflows/ci.yml", "src/app.ts"];

test("the level comes from the Level line, and is recommended when it's missing", () => {
  assert.equal(level(FULL), "full");
  assert.equal(level(RECOMMENDED), "recommended");
  assert.equal(level(""), "recommended");
});

test("no rule file changed: passes on every level", () => {
  assert.equal(decide({ changed: ["src/app.ts"], stack: RECOMMENDED }).pass, true);
});

test("the human-approved label passes on every level", () => {
  assert.equal(decide({ changed: RULES, labels: ["human-approved"], stack: RECOMMENDED }).pass, true);
  assert.equal(decide({ changed: RULES, labels: ["human-approved"], stack: FULL }).pass, true);
});

test("Recommended: a pass comment doesn't count; only the label does", () => {
  const r = decide({ changed: RULES, stack: RECOMMENDED, comments: [PASS(HEAD)], head: HEAD });
  assert.equal(r.pass, false);
  assert.match(r.why, /human-approved/);
  assert.match(r.why, /AGENTS\.md/);
  assert.doesNotMatch(r.why, /src\/app\.ts/);
});

test("Full: a pass comment at the head commit passes", () => {
  assert.equal(decide({ changed: RULES, stack: FULL, comments: [PASS(HEAD)], head: HEAD }).pass, true);
});

test("Full: a pass at an older commit, a fail comment, or none fails and names the head", () => {
  const fail = { body: `Weakening review: fail @ ${HEAD}`, author_association: "OWNER" };
  for (const comments of [[PASS(OLD)], [fail], []]) {
    const r = decide({ changed: RULES, stack: FULL, comments, head: HEAD });
    assert.equal(r.pass, false, JSON.stringify(comments));
    assert.match(r.why, new RegExp(`Weakening review: pass @ ${HEAD}`));
  }
});

test("Full: a pass comment from someone without write access doesn't count", () => {
  for (const who of ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR"]) {
    assert.equal(decide({ changed: RULES, stack: FULL, comments: [PASS(HEAD, who)], head: HEAD }).pass, false, who);
  }
});

test("Full: a short sha or extra words on the line don't count", () => {
  const short = { body: `Weakening review: pass @ ${HEAD.slice(0, 7)}`, author_association: "OWNER" };
  const extra = { body: `Weakening review: pass @ ${HEAD} but see below`, author_association: "OWNER" };
  assert.equal(decide({ changed: RULES, stack: FULL, comments: [short, extra], head: HEAD }).pass, false);
});

test("the script: exit 0 on a Full pass, exit 1 without one", () => {
  const dir = tmp("onrails-agent-files-");
  const file = (name, text) => (writeFileSync(join(dir, name), text), join(dir, name));
  const args = (comments) => ["--changed", file("changed.txt", RULES.join("\n")), "--stack", file("stack.md", FULL),
    "--comments", file("comments.json", JSON.stringify(comments)), "--head", HEAD];
  const run = (a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: "utf8" });
  assert.equal(run(args([PASS(HEAD)])).status, 0);
  const r = run(args([]));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Weakening review: pass @/);
});

test("every CI template runs the guard from the base commit", () => {
  for (const p of [".agents/skills/idea/templates/ci.yml", "stacks/tanstack-start/.github/workflows/ci.yml", "stacks/monorepo-expo/.github/workflows/ci.yml"]) {
    const yml = readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
    assert.match(yml, /git show "\$BASE:\$guard" > "\$RUNNER_TEMP\/agent-files\.mjs"/, p);
    assert.match(yml, /HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/, p);
    assert.match(yml, /issues: read/, p);
  }
});
