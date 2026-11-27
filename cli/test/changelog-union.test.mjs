// #362: CHANGELOG.md merges with git's union driver, so merging main into a branch never stops on two new lines
// under the same Unreleased heading. The kit's own .gitattributes sets it, and so does the one the web pack writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");
const UNION = /^CHANGELOG\.md merge=union$/m;
const ADDED = "## [Unreleased]\n\n### Added\n\n";

test("AC-362-1: two branches that each add a line under the same Unreleased heading merge with no conflict and keep both", () => {
  const scratch = tmp("changelog-union-");
  const dir = join(scratch, "repo");
  const noTemplates = join(scratch, "no-templates");
  for (const folder of [dir, noTemplates]) mkdirSync(folder);
  // Only the committed .gitattributes decides how CHANGELOG.md merges, as in pr-rules.mjs's SAFE_GIT and generated():
  // none of the shell's GIT_* variables (GIT_TEMPLATE_DIR, GIT_CONFIG_COUNT and the rest), no global or system config
  // or attributes file (GIT_CONFIG_NOSYSTEM doesn't cover $(prefix)/etc/gitattributes), and an empty template
  // folder, so no template's info/attributes lands in .git/.
  const shell = Object.entries(safeEnv()).filter(([name]) => !/^GIT_/i.test(name));
  const env = { ...Object.fromEntries(shell), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_ATTR_NOSYSTEM: "1" };
  const SAFE_GIT = ["-c", "core.attributesFile=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
  const git = (...args) => spawnSync("git", [...SAFE_GIT, ...args], { cwd: dir, encoding: "utf8", env });
  git("init", "-q", `--template=${noTemplates}`, "-b", "main");
  for (const file of [".gitattributes", "CHANGELOG.md"]) copyFileSync(join(REPO, file), join(dir, file));
  assert.ok(read("CHANGELOG.md").includes(ADDED), "CHANGELOG.md has an Added heading under Unreleased");
  git("add", ".");
  git("commit", "-q", "-m", "main");
  const lines = { "fix/901": "- First change from one branch (#901).", "fix/902": "- Second change from another branch (#902)." };
  for (const [branch, line] of Object.entries(lines)) {
    git("checkout", "-q", "-b", branch, "main");
    const text = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    writeFileSync(join(dir, "CHANGELOG.md"), text.replace(ADDED, `${ADDED}${line}\n`));
    git("commit", "-q", "-am", branch);
  }
  const merge = git("merge", "--no-edit", "-q", "fix/901");
  assert.equal(merge.status, 0, `fix/901 merges into fix/902 with no conflict: ${merge.stdout}${merge.stderr}`);
  const merged = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
  assert.doesNotMatch(merged, /^(<<<<<<<|=======|>>>>>>>)/m, "no conflict markers");
  const added = merged.split(ADDED)[1].split("\n### ")[0];
  for (const line of Object.values(lines)) {
    assert.equal(added.split("\n").filter((l) => l === line).length, 1, `${line} is under Unreleased > Added once`);
  }
});

test("AC-362-2: coordinate step 7 names the attribute and says to check the merged CHANGELOG once", () => {
  const step7 = read(".agents/skills/coordinate/SKILL.md").split("7. **Merge through one queue,**")[1].split("\n8. ")[0];
  assert.match(step7, /`CHANGELOG\.md merge=union`/);
  assert.match(step7, /check the merged `CHANGELOG\.md` once/);
  // One side's edit is enough: union keeps a reworded entry's old wording next to the other side's new line.
  assert.match(step7, /either side reworded an entry/);
});

test("AC-362-3: the kit's .gitattributes and the one the web pack writes into an app both merge CHANGELOG.md with union", () => {
  assert.match(read(".gitattributes"), UNION);
  assert.match(read("stacks/tanstack-start/.gitattributes"), UNION);
});
