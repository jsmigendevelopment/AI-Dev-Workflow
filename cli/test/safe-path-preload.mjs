// #191: a test never runs the person's real claude or codex, which can sit next to Node (an npm global install).
// A PATH holds only the test's fakes, a copy of node and the system folders. A copy, never a symlink: Linux resolves
// a symlink for process.execPath, which leads back to Node's own folder.
// #197: `npm test` loads this file with `node --require` before anything else, in the test runner and in every test
// file's process, so a file that never imports helpers.mjs, and code that spawns while a file loads, run with the
// safe PATH too. `--require`, not `--import`: Node 22's runner skips `--import` in its own process, and that process
// makes the run's one copy of node. helpers.mjs imports this file, so a test file run alone gets it as well.
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { findCommand } from "../src/system.mjs";

/** Matches every casing of the PATH key (PATH, Path, path). */
export const PATH_KEY = /^path$/i;
// ONRAILS_TEST_SYSTEM_DIRS replaces the system folders, so a test can put a claude there (#197). They are checked
// like any other PATH entry. Only absolute folders: an empty or relative one is read from the folder each child runs
// in, which no check here can see, so it stops the run before any copy is made or any test runs.
const SYSTEM = systemDirs(process.env.ONRAILS_TEST_SYSTEM_DIRS);
const TOOLS = ["claude", "codex"].flatMap((name) => [name, `${name}.cmd`, `${name}.exe`]);
// The run's copy of node, named by the process that made it, so each process it starts uses it too (#197).
const SHARED = "ONRAILS_TEST_NODE";

function systemDirs(given) {
  if (given === undefined) return process.platform === "win32" ? [join(process.env.SystemRoot ?? "C:\\Windows", "System32")] : ["/usr/bin", "/bin"];
  const dirs = given.split(delimiter);
  const bad = dirs.filter((dir) => !isAbsolute(dir));
  if (bad.length > 0) throw new Error(`ONRAILS_TEST_SYSTEM_DIRS takes only absolute folders, not ${bad.map((dir) => JSON.stringify(dir)).join(", ")}`);
  return dirs;
}

/** The real paths of this test's fakes, the only claude or codex a PATH may hold. */
export const fakes = new Set();

/**
 * Throws if a folder on any PATH key of env (PATH, Path, path) holds a claude or codex that isn't one of this test's
 * fakes. Relative entries are read from cwd, the child's working folder (this process's when not given). An empty item
 * (an empty PATH, `a::b`, a separator at either end) is the child's working folder too: checked there when cwd is
 * given, and a failure when it isn't. Returns env, so a hand-built env is checked where it's made.
 */
export function checkPath(env, cwd) {
  let empty;
  for (const [key, value] of Object.entries(env)) {
    if (!PATH_KEY.test(key) || typeof value !== "string") continue;
    for (const entry of value.split(delimiter)) {
      // Thrown after the loop, so a real claude on another key is the error a test sees first.
      if (entry === "" && cwd === undefined) {
        empty ??= key;
        continue;
      }
      for (const name of TOOLS) {
        const file = resolve(cwd ?? process.cwd(), entry, name);
        if (existsSync(file) && !fakes.has(realpathSync(file))) throw new Error(`${file} on the child's ${key} isn't one of this test's fakes`);
      }
    }
  }
  if (empty) throw new Error(`the child's ${empty} has an empty item, read as a working folder no one named: pass its cwd`);
  return env;
}

// A new copy of node, with npm and npx next to it, removed when this process exits. npm's own scripts are found on
// the shell's PATH, so their `#!/usr/bin/env node` starts the copy (#182's real runs start npm). Never a folder of
// them: claude can sit there too.
function copyNode() {
  const dir = mkdtempSync(join(tmpdir(), "onrails-node-"));
  const file = join(dir, basename(process.execPath));
  copyFileSync(process.execPath, file);
  const npm = process.platform === "win32" ? [] : ["npm", "npx"].map((name) => [name, findCommand(name)]).filter(([, found]) => found);
  for (const [name, found] of npm) symlinkSync(realpathSync(found), join(dir, name));
  const remove = () => rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  process.on("exit", remove);
  return { file, dir, remove };
}

const shared = process.env[SHARED];
const made = shared && existsSync(shared) ? null : copyNode();

/** This run's copy of node: the one the process that started this one made, or this process's own. */
export const ownNode = made?.file ?? shared;

/**
 * Removes the copy this process made, if it made one. A test file run alone that throws while it loads ends with no
 * `exit` event on Node 22 (exit code 7), so helpers.mjs calls this from that throw's monitor (#229).
 */
export const removeOwnNode = () => made?.remove();

/** A safe PATH: the given folders of fakes, then the copy of node (with npm and npx), then the system folders. */
export function safePath(...dirs) {
  return checkPath({ PATH: [...dirs, dirname(ownNode), ...SYSTEM].join(delimiter) }).PATH;
}

// This process's own PATH is safe too, so code it runs in-process (doctor's probes) and a child that inherits the env
// never find the real tools. A throw here ends the process before any `after()` runs; the `exit` handler copyNode()
// set still runs then, and removes the copy (#197, AC-197-2).
const path = safePath();
for (const name of Object.keys(process.env).filter((key) => PATH_KEY.test(key))) delete process.env[name];
process.env.PATH = path;
process.env[SHARED] = ownNode;
