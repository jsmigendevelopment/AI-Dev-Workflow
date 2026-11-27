// Tests for the local merge gate from the session (#131): `agent-files.mjs gate` decides at the pinned head
// with no workflow run, and the no-Actions rule is in both AGENTS.md files. A fake gh answers the API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/agent-files.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const FULL = "## Automation level\n\n- **Level:** full  <!-- recommended | full | hands-on | custom -->\n";
const RECOMMENDED = "## Automation level\n\n- **Level:** recommended\n";
const say = (body) => ({ body, user: { login: "owner" }, updated_at: "2026-11-24T10:00:00Z" });
const PASS = () => say(`Weakening review: pass @ ${HEAD}`);
const FAIL = () => say(`Weakening review: fail @ ${HEAD}`);

test("AC-131-3: the kit repo's AGENTS.md and the one the kit installs have the no-Actions rule", () => {
  for (const file of ["AGENTS.md", "cli/kit/files/core/AGENTS.md", "plugin/cli/kit/files/core/AGENTS.md"]) {
    assert.match(read(file), /^- \*\*No GitHub Actions, at all costs\.\*\* Never add, enable or depend on a workflow\./m, file);
  }
});

// #131 item 3: the guard runs from the session before a merge, with no workflow. Item 3 has no AC ID of its own.
function gate(args, { comments = [PASS()], stack = FULL, local = null, env = {}, api = {} } = {}) {
  const dir = tmp("onrails-gate-");
  if (local) {
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "stack.md"), local);
  }
  const p = "repos/acme/app";
  const fake = fakeGh(dir, {
    [`${p}/pulls/7`]: { head: { sha: HEAD }, changed_files: 1 },
    [`${p}/pulls/7/files`]: [{ filename: "AGENTS.md" }],
    [`${p}/issues/7/comments`]: comments,
    [`${p}/issues/7/labels`]: [],
    [`${p}/collaborators/owner/permission`]: { permission: "admin" },
    [`${p}/contents/docs/stack.md`]: { content: Buffer.from(stack).toString("base64") },
    ...api,
  }, env);
  const r = spawnSync(process.execPath, [SCRIPT, "gate", ...args], { cwd: dir, encoding: "utf8", env: fake.env });
  return { ...r, calls: fake.calls() };
}

test("#131 item 3: gate passes at the pinned head with no workflow run, and reads no Actions API", unixOnly, () => {
  const r = gate(["7", "--repo", "acme/app", "--head", HEAD]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^${HEAD}: the weakening review passed`));
  assert.doesNotMatch(r.calls, /check-runs|actions\//);
});

test("#131 item 3: gate fails when the head moved, or on a fail posted after the pass", unixOnly, () => {
  const moved = gate(["7", "--repo", "acme/app", "--head", OLD]);
  assert.equal(moved.status, 1);
  assert.match(moved.stderr, /head moved/);
  assert.equal(gate(["7", "--repo", "acme/app", "--head", HEAD], { comments: [PASS(), FAIL()] }).status, 1);
});

test("#131 item 3: gate reads the level from the default branch, not the checkout it runs in", unixOnly, () => {
  const r = gate(["7", "--repo", "acme/app", "--head", HEAD], { stack: RECOMMENDED, local: FULL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /human-approved/);
});

test("#131 item 3: gate needs the pull request, the repo and the head, even with REPO set, and calls nothing without them", unixOnly, () => {
  for (const env of [{}, { REPO: "acme/app" }]) {
    for (const args of [["7", "--repo", "acme/app"], ["--repo", "acme/app", "--head", HEAD], ["7", "--head", HEAD]]) {
      const r = gate(args, { env });
      const label = `${args.join(" ")} ${JSON.stringify(env)}`;
      assert.equal(r.status, 1, label);
      assert.match(r.stderr, /gate <n> --repo <owner>\/<name> --head <sha>/, label);
      assert.equal(r.calls, "", label);
    }
  }
});

// Round 3 review, item 1: writers() no longer drops a login it couldn't check, so the guard fails closed.
test("#131 item 3: an access check with no answer fails the gate, even when it would hide a writer's fail", unixOnly, () => {
  const refused = { ghError: "gh: Access to this GitHub API path is not permitted through this proxy. (HTTP 403)" };
  const keeperFail = { ...FAIL(), user: { login: "keeper" } };
  const r = gate(["7", "--repo", "acme/app", "--head", HEAD], { comments: [PASS(), keeperFail], api: { "repos/acme/app/collaborators/keeper/permission": refused } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /Couldn't check keeper's access to acme\/app: .*not permitted through this proxy\. \(HTTP 403\).*The guard fails/);
  const own = gate(["7", "--repo", "acme/app", "--head", HEAD], {
    api: { "repos/acme/app/collaborators/owner/permission": refused, user: { login: "owner" }, "repos/acme/app": { permissions: { push: true } } },
  });
  assert.equal(own.status, 0, `the token's own login passes on the repo's permissions: ${own.stderr}`);
});

// #158: an unchecked voter's pass is dropped, and its fail still fails the guard.
test("AC-158-2: an unchecked pass beside a writer's pass passes; an unchecked fail fails", unixOnly, () => {
  const refused = { ghError: "gh: Access to this GitHub API path is not permitted through this proxy. (HTTP 403)" };
  const api = { "repos/acme/app/collaborators/keeper/permission": refused };
  const keeper = (comment) => ({ ...comment, user: { login: "keeper" } });
  const pass = gate(["7", "--repo", "acme/app", "--head", HEAD], { comments: [keeper(PASS()), PASS()], api });
  assert.equal(pass.status, 0, pass.stderr);
  const alone = gate(["7", "--repo", "acme/app", "--head", HEAD], { comments: [keeper(PASS())], api });
  assert.equal(alone.status, 1, "an unchecked pass alone counts for nothing");
  const fail = gate(["7", "--repo", "acme/app", "--head", HEAD], { comments: [PASS(), keeper(FAIL())], api });
  assert.equal(fail.status, 1, fail.stdout);
  assert.match(fail.stderr, /Couldn't check keeper's access.*guard fails until GitHub answers/i);
});
