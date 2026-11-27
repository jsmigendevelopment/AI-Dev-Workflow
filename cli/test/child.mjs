// #229: the only way a test starts a child. Each call checks the child's env against that spawn's own working folder
// (this process's when none is given), so a relative or empty PATH item is read where the child really starts.
// Same names and arguments as node:child_process; the safe-PATH scan flags a test file that imports that instead.
import * as cp from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkPath } from "./safe-path-preload.mjs";

// The options object: the last argument when args were left out, as node:child_process reads it.
function checked(args, options) {
  const opts = Array.isArray(args) ? options : args;
  // A URL cwd, which node:child_process takes too, is checked as the folder it names.
  const cwd = opts?.cwd === undefined ? process.cwd() : opts.cwd instanceof URL ? fileURLToPath(opts.cwd) : String(opts.cwd);
  checkPath(opts?.env ?? process.env, cwd);
}

/** node:child_process spawnSync, after checking the child's env in its own working folder. */
export function spawnSync(command, args, options) {
  checked(args, options);
  return cp.spawnSync(command, args, options);
}

/** node:child_process spawn, after checking the child's env in its own working folder. */
export function spawn(command, args, options) {
  checked(args, options);
  return cp.spawn(command, args, options);
}

/** node:child_process execFileSync, after checking the child's env in its own working folder. */
export function execFileSync(file, args, options) {
  checked(args, options);
  return cp.execFileSync(file, args, options);
}
