// #360: the kit's own repo records Full automation in docs/stack.md (decision 259-1). The agent-file guard, run as
// `gate` from main, reads the level from main's docs/stack.md, so on a pull request that changes a skill it asks for
// a writer's weakening-review pass instead of a label. In the kit repo the one code review writes that line
// (decision 28). The test feeds the repo's real docs/stack.md to the real script through the fake gh, as main's file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { level } from "../../.agents/skills/coordinate/scripts/agent-files.mjs";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const SCRIPT = join(REPO, ".agents/skills/coordinate/scripts/agent-files.mjs");
const STACK = join(REPO, "docs/stack.md");
const stack = () => (existsSync(STACK) ? readFileSync(STACK, "utf8") : null);
const read = (path) => readFileSync(join(REPO, path), "utf8");
const HEAD = "c".repeat(40);
const P = "repos/acme/kit";
const PASS = { body: `Code review: approve @ ${HEAD}\nNeeds the person: no\nWeakening review: pass @ ${HEAD}`, user: { login: "writer" } };

// `gate` on a pull request that changes a skill. Main's docs/stack.md is the repo's own; none in the repo is the 404
// the contents API gives for a missing file.
function gate(comments) {
  const text = stack();
  const main = text === null ? {} : { [`${P}/contents/docs/stack.md`]: { type: "file", encoding: "base64", path: "docs/stack.md", content: Buffer.from(text).toString("base64") } };
  const fake = fakeGh(tmp("onrails-gh-"), { // gh outside the folder it runs in (#274)
    [`${P}/pulls/9`]: { head: { sha: HEAD }, base: { sha: "e".repeat(40), ref: "main" }, changed_files: 1 },
    [`${P}/pulls/9/files`]: [{ filename: ".agents/skills/pr-review/SKILL.md", status: "modified" }],
    [`${P}/issues/9/comments`]: comments,
    [`${P}/issues/9/labels`]: [],
    [`${P}/collaborators/writer/permission`]: { permission: "write" },
    ...main,
  });
  return spawnSync(process.execPath, [SCRIPT, "gate", "9", "--repo", "acme/kit", "--head", HEAD], { cwd: tmp("onrails-gate-kit-"), encoding: "utf8", env: fake.env });
}

test("AC-360-1: WHEN main has docs/stack.md with Level full and the kit's review switches THEN gate passes a skill change with a writer's weakening pass, and fails one without it", unixOnly, () => {
  const passed = gate([PASS]);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, new RegExp(`the weakening review passed at ${HEAD}`));
  const missing = gate([]);
  assert.equal(missing.status, 1, missing.stdout);
  assert.match(missing.stderr, new RegExp(`Weakening review: pass @ ${HEAD}`));
  assert.match(missing.stderr, /\.agents\/skills\/pr-review\/SKILL\.md/);
  assert.doesNotMatch(missing.stderr, /need the human-approved label/);
  const text = stack();
  assert.equal(level(text), "full", "the guard reads Full from it");
  for (const line of ["- **Loop:** on", "- **Merges, risky lane:** agents", "- **Overnight loop:** on", "- **Ping level:** blockers",
    "- **Code reviews per pull request:** one", "- **Weakening review:** written by the one code review"]) {
    assert.ok(text.includes(line), `docs/stack.md has "${line}"`);
  }
});

test("AC-360-2: WHEN docs/stack.md is read THEN it says Full, cites decisions 259-1 and 28, and says the one code review writes the weakening line", () => {
  const text = stack() ?? "";
  assert.match(text, /- \*\*Level:\*\* full/);
  assert.match(text, /decision 259-1/);
  assert.match(text, /decision 28\b/);
  assert.match(text, /the one code review writes the `Weakening review:` line/);
});

test("AC-360-3: WHEN pr-review is read THEN, where docs/stack.md says so, as in the kit's own repo, the code review writes the Weakening review line", () => {
  const skill = read(".agents/skills/pr-review/SKILL.md");
  assert.match(skill, /\*\*`docs\/stack\.md` says the one code review writes the weakening line\*\* \(the kit's own repo, decision 28\)/);
  assert.match(skill, /`Weakening review: pass @ <full head sha>`/);
});

test("AC-474-1: WHEN the Weakening review bullet in docs/stack.md is read THEN the one code review writes the line on every pull request, not only on a protected-file one", () => {
  const bullet = (stack() ?? "").split("\n").find((line) => line.startsWith("- **Weakening review:**")) ?? "";
  assert.match(bullet, /the one code review writes the `Weakening review:` line in its verdict comment/);
  assert.match(bullet, /on every pull request/);
  assert.doesNotMatch(bullet, /On a pull request that changes a file the guard protects/);
  assert.match(bullet, /`Weakening review: pass @ <full head sha>`/);
  assert.match(bullet, /`Weakening review: fail @ <sha>`/);
  assert.match(bullet, /The guard reads only that line on Full/);
});
