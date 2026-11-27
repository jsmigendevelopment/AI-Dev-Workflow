// #430: every copy sync-skills.mjs makes (its COPIES list) is marked `linguist-generated` in the kit's .gitattributes,
// so pr-size.mjs counts a shared script once, in its master, however many copies it has.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COPIES } from "../../scripts/sync-skills.mjs";
import { safeEnv, unixOnly } from "./helpers.mjs";
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

test("AC-430-2: WHEN a COPIES target has no linguist-generated line THEN a kit test fails and names it", unixOnly, async () => {
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
