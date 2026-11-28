// #430: every copy sync-skills.mjs makes (its COPIES list) is marked `linguist-generated` in the kit's .gitattributes,
// so pr-size.mjs counts a shared script once, in its master, however many copies it has. And `--check`, which keeps
// each copy equal to its master, still fails on a copy out of sync however the script is started.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COPIES } from "../../scripts/sync-copies.mjs";
import { safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { SCRIPTS, checkout, git } from "./pr-rules-fakes.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const KIT_ATTRIBUTES = readFileSync(join(REPO, ".gitattributes"), "utf8");
const posix = (path) => path.split(sep).join("/");
const PAIRS = COPIES.map(([master, copy]) => [posix(master), posix(copy)]);
const MASTERS = [...new Set(PAIRS.map(([master]) => master))];
const TARGETS = PAIRS.map(([, copy]) => copy);
const lines = (n) => Array.from({ length: n }, (_, i) => `// line ${i}`).join("\n") + "\n";

/** The paths `attributes`, committed as main's .gitattributes, mark `linguist-generated`, as pr-size.mjs reads them. */
async function marked(attributes, paths) {
  const dir = checkout(attributes);
  const { generated } = await import(pathToFileURL(join(dir, SCRIPTS, "pr-size.mjs")).href);
  return generated(paths, "HEAD");
}

/** pr-size.mjs --base main, on a branch that adds `extra` lines to each of `paths`, on top of the kit's .gitattributes. */
function sizeOf(paths, extra) {
  const dir = checkout(KIT_ATTRIBUTES);
  git(dir, "branch", "-M", "main");
  git(dir, "switch", "-q", "-c", "fix/9-shared");
  for (const path of paths) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    // Appended, so the coordinate scripts the checkout runs (command-for.mjs is a copy too) keep working.
    writeFileSync(file, (existsSync(file) ? readFileSync(file, "utf8") : "") + lines(extra));
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "branch");
  return spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "--base", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
}

test("AC-430-1: WHEN a PR changes a shared script THEN pr-size.mjs counts its lines once, in the master file", unixOnly, () => {
  // #428's case: one 231-line script with two copies counted 693 lines.
  const week = ["scripts/insights-week.mjs", ".agents/skills/coordinate/scripts/insights-week.mjs", "cli/src/insights-week.mjs"];
  const one = sizeOf(week, 231);
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /HEAD against main: 231 changed lines counted, 462 not counted/);
  assert.match(one.stdout, /Biggest files:\n {2}231\tscripts\/insights-week\.mjs\n?$/);
  // Every master and every copy at once: only the masters count.
  const all = sizeOf([...MASTERS, ...TARGETS], 3);
  assert.match(all.stdout, new RegExp(`: ${MASTERS.length * 3} changed lines counted, ${TARGETS.length * 3} not counted`), all.stdout + all.stderr);
});

// The folders sync-skills.mjs --check reads, relative to the repo.
const SYNCED = ["scripts", "guide", ".agents/skills", ".claude/skills", ".github/ISSUE_TEMPLATE", "plugin/skills", "cli/src", "templates/research-library"];
const symlinks = { skip: process.platform === "win32" ? "making a symlink needs extra rights on Windows" : false };

test("#430 round 1, must 1: sync-skills.mjs --check fails on a copy out of sync, started through a symlinked file or folder", symlinks, () => {
  const scratch = tmp("onrails-sync-link-");
  const repo = join(scratch, "repo");
  for (const folder of SYNCED) cpSync(join(REPO, folder), join(repo, folder), { recursive: true });
  const check = (script, cwd) => spawnSync(process.execPath, [script, "--check"], { cwd, encoding: "utf8", env: safeEnv() });
  assert.equal(check(join(repo, "scripts", "sync-skills.mjs"), repo).status, 0, "the copied repo starts in sync");
  appendFileSync(join(repo, "cli", "src", "insights-week.mjs"), "// out of sync\n");
  symlinkSync(join(repo, "scripts", "sync-skills.mjs"), join(scratch, "sync.mjs"));
  symlinkSync(repo, join(scratch, "link"), "dir");
  const runs = {
    "the script itself": [join(repo, "scripts", "sync-skills.mjs"), repo],
    "a symlinked file": [join(scratch, "sync.mjs"), repo],
    "a symlinked repo folder": [join(scratch, "link", "scripts", "sync-skills.mjs"), join(scratch, "link")],
  };
  for (const [name, [script, cwd]] of Object.entries(runs)) {
    const r = check(script, cwd);
    assert.equal(r.status, 1, `${name}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /differs: cli\/src\/insights-week\.mjs \(master: scripts\/insights-week\.mjs\)/, name);
  }
});

test("AC-430-2: WHEN a COPIES target has no linguist-generated line THEN a kit test fails and names it", async () => {
  const unmarked = async (paths) => {
    const set = await marked(KIT_ATTRIBUTES, paths);
    return paths.filter((path) => !set.has(path));
  };
  const missing = await unmarked(TARGETS);
  assert.deepEqual(missing, [], `.gitattributes doesn't mark these sync-skills copies linguist-generated: ${missing.join(", ")}`);
  // A copy added to COPIES without a line is named.
  assert.deepEqual(await unmarked([...TARGETS, "cli/src/new-copy.mjs"]), ["cli/src/new-copy.mjs"]);
  // The masters still count.
  const masters = await marked(KIT_ATTRIBUTES, MASTERS);
  assert.deepEqual([...masters], [], "a master is marked linguist-generated, so its lines wouldn't count");
});
