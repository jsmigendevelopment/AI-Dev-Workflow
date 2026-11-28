// #362: CHANGELOG.md merges with git's union driver, so merging main into a branch never stops on two new lines
// under the same Unreleased heading. The kit's own .gitattributes sets it, and so does the one the web pack writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");
const UNION = /^CHANGELOG\.md merge=union$/m;
const UNRELEASED = "## [Unreleased]\n\n";
const ADDED = `${UNRELEASED}### Added\n\n`;

// AC-362-1's logic, run on the given .gitattributes text. extraEnv sets HOME and the like, so AC-399-1 can plant a global ignore file.
function assertUnionMerge(attributes, extraEnv = {}) {
  const scratch = tmp("changelog-union-");
  const dir = join(scratch, "repo");
  const noTemplates = join(scratch, "no-templates");
  for (const folder of [dir, noTemplates]) mkdirSync(folder);
  // Only the committed .gitattributes decides how CHANGELOG.md merges, as in pr-rules.mjs's SAFE_GIT and generated():
  // none of the shell's GIT_* variables (GIT_TEMPLATE_DIR, GIT_CONFIG_COUNT and the rest), no global or system config
  // or attributes file (GIT_CONFIG_NOSYSTEM doesn't cover $(prefix)/etc/gitattributes), and an empty template
  // folder, so no template's info/attributes lands in .git/. GIT_CONFIG_GLOBAL doesn't stop git reading the global ignore
  // file ($XDG_CONFIG_HOME/git/ignore), which could make `add` skip CHANGELOG.md (#399), so core.excludesFile=/dev/null does.
  const shell = Object.entries(safeEnv()).filter(([name]) => !/^GIT_/i.test(name));
  const env = { ...Object.fromEntries(shell), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_ATTR_NOSYSTEM: "1", ...extraEnv };
  const SAFE_GIT = ["-c", "core.attributesFile=/dev/null", "-c", "core.excludesFile=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
  const git = (...args) => spawnSync("git", [...SAFE_GIT, ...args], { cwd: dir, encoding: "utf8", env });
  // A setup step that fails or does nothing must not turn into a pass.
  const setup = (...args) => {
    const run = git(...args);
    assert.equal(run.status, 0, `git ${args.join(" ")} exits 0: ${run.stdout}${run.stderr}`);
  };
  setup("init", "-q", `--template=${noTemplates}`, "-b", "main");
  writeFileSync(join(dir, ".gitattributes"), attributes);
  // Right after a release, versions.mjs leaves Unreleased empty, so the copy gets an Added heading when it has none
  // (decision 475-1). The merge below still runs on the real file's text and the real .gitattributes.
  const real = read("CHANGELOG.md");
  assert.ok(real.includes(UNRELEASED), "CHANGELOG.md has an Unreleased heading");
  const start = real.includes(ADDED) ? real : real.replace(UNRELEASED, ADDED);
  // Guards the copy's setup: the branches below edit at ADDED, so an ADDED that stops starting with UNRELEASED fails here.
  assert.ok(start.includes(ADDED), "the copy has an Added heading under Unreleased");
  writeFileSync(join(dir, "CHANGELOG.md"), start);
  setup("add", ".");
  setup("commit", "-q", "-m", "main");
  const lines = { "fix/901": "- First change from one branch (#901).", "fix/902": "- Second change from another branch (#902)." };
  for (const [branch, line] of Object.entries(lines)) {
    setup("checkout", "-q", "-b", branch, "main");
    const text = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    writeFileSync(join(dir, "CHANGELOG.md"), text.replace(ADDED, `${ADDED}${line}\n`));
    setup("commit", "-q", "-am", branch);
  }
  const merge = git("merge", "--no-edit", "-q", "fix/901");
  assert.equal(merge.status, 0, `fix/901 merges into fix/902 with no conflict: ${merge.stdout}${merge.stderr}`);
  const merged = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
  assert.doesNotMatch(merged, /^(<<<<<<<|=======|>>>>>>>)/m, "no conflict markers");
  const added = merged.split(ADDED)[1].split(/\n#{2,3} /)[0];
  for (const line of Object.values(lines)) {
    assert.equal(added.split("\n").filter((l) => l === line).length, 1, `${line} is under Unreleased > Added once`);
  }
}

test("AC-362-1: two branches that each add a line under the same Unreleased heading merge with no conflict and keep both", () => {
  assertUnionMerge(read(".gitattributes"));
});

test("AC-399-1: a global ignore file that lists *.md doesn't hide a missing union line, so AC-362-1 fails without it and passes with it", () => {
  const home = tmp("changelog-union-home-");
  mkdirSync(join(home, ".config", "git"), { recursive: true });
  writeFileSync(join(home, ".config", "git", "ignore"), "*.md\n");
  const global = { HOME: home, XDG_CONFIG_HOME: join(home, ".config") };
  const withUnion = read(".gitattributes");
  const withoutUnion = withUnion.replace(UNION, "");
  assert.notEqual(withoutUnion, withUnion, "the copy without the union line differs from the real file");
  assert.throws(() => assertUnionMerge(withoutUnion, global), /fix\/901 merges into fix\/902 with no conflict/);
  assertUnionMerge(withUnion, global);
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
