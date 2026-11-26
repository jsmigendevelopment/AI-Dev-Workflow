// #191: a test never runs the person's real claude or codex, which can sit next to Node (an npm global install).
// A PATH holds only the test's fakes, a copy of node and the system folders. A copy, never a symlink: Linux resolves
// a symlink for process.execPath, which leads back to Node's own folder.
// #197: `npm test` loads this file with `node --require` before anything else, in the test runner and in every test
// file's process, so a file that never imports helpers.mjs, and code that spawns while a file loads, run with the
// safe PATH too. `--require`, not `--import`: Node 22's runner skips `--import` in its own process, and that process
// makes the run's one copy of node. helpers.mjs imports this file, so a test file run alone gets it as well.
import { copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { findCommand } from "../src/system.mjs";

/** Matches every casing of the PATH key (PATH, Path, path). */
export const PATH_KEY = /^path$/i;
// ONRAILS_TEST_SYSTEM_DIRS replaces the system folders, so a test can put a claude there (#197). They are checked
// like any other PATH entry.
const SYSTEM = process.env.ONRAILS_TEST_SYSTEM_DIRS?.split(delimiter) ??
  (process.platform === "win32" ? [join(process.env.SystemRoot ?? "C:\\Windows", "System32")] : ["/usr/bin", "/bin"]);
const TOOLS = ["claude", "codex"].flatMap((name) => [name, `${name}.cmd`, `${name}.exe`]);
// The run's copy of node, named by the process that made it, so each process it starts uses it too (#197).
const SHARED = "ONRAILS_TEST_NODE";

/** The real paths of this test's fakes, the only claude or codex a PATH may hold. */
export const fakes = new Set();

/**
 * Throws if a folder on any PATH key of env (PATH, Path, path) holds a claude or codex that isn't one of this test's
 * fakes. Relative entries are read from cwd. Returns env, so a hand-built env is checked where it's made.
 */
export function checkPath(env, cwd = process.cwd()) {
  for (const [key, value] of Object.entries(env)) {
    if (!PATH_KEY.test(key) || typeof value !== "string") continue;
    for (const entry of value.split(delimiter).filter(Boolean)) {
      for (const name of TOOLS) {
        const file = resolve(cwd, entry, name);
        if (existsSync(file) && !fakes.has(realpathSync(file))) throw new Error(`${file} on the child's ${key} isn't one of this test's fakes`);
      }
    }
  }
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
  process.on("exit", () => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return { file, dir };
}

const shared = process.env[SHARED];
const made = shared && existsSync(shared) ? null : copyNode();

/** This run's copy of node: the one the process that started this one made, or this process's own. */
export const ownNode = made?.file ?? shared;

/** A safe PATH: the given folders of fakes, then the copy of node (with npm and npx), then the system folders. */
export function safePath(...dirs) {
  return checkPath({ PATH: [...dirs, dirname(ownNode), ...SYSTEM].join(delimiter) }).PATH;
}

// This process's own PATH is safe too, so code it runs in-process (doctor's probes) and a child that inherits the env
// never find the real tools. A throw here ends the process before any `after()` runs, so the copy goes first (#197).
let path;
try {
  path = safePath();
} catch (error) {
  if (made) rmSync(made.dir, { recursive: true, force: true, maxRetries: 3 });
  throw error;
}
for (const name of Object.keys(process.env).filter((key) => PATH_KEY.test(key))) delete process.env[name];
process.env.PATH = path;
process.env[SHARED] = ownNode;
