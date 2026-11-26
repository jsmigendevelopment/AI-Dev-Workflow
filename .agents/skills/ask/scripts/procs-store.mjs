// Where the process registry (procs.mjs) keeps its records, and how it writes them safely.
//   <repo's main checkout>/.onrails/procs.json   for a repo: every worktree shares it, and the folder ignores itself
//   ~/.onrails/procs.json                        outside a repo (~/.ai-dev-workflow while only the old name exists)
//   ~/.onrails/procs-index.json                  each repo registry ever written, so npx onrails ps finds them all
// A registry git tracks (or that git can't answer for), another user owns or can write, or a symlink for its
// folder, its file or its logs, is never read or written: a branch or another account must not be able to hand
// the registry its records. Its folder and logs folder must be this user's too, and nobody else may write them
// (only ~/.onrails may be group-writable). The file is checked and read through one open file, so what is read
// is what passed. A repo registry must also be its repo's own, in a repo this user owns.
// No dependencies. The master copy is scripts/procs-store.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const IGNORE = "*\n";
// Never through a symlink, and never waiting on a FIFO. Windows has neither flag; there the name checks stand alone.
const READ = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** ~/.onrails, or ~/.ai-dev-workflow (its name before the rename) while only that one exists. */
export function homeDir(home = homedir()) {
  const now = join(home, ".onrails"), old = join(home, ".ai-dev-workflow");
  return !existsSync(now) && existsSync(old) ? old : now;
}

export const homeRegistry = (sys) => join(homeDir(sys.home), "procs.json");
const indexPath = (sys) => join(homeDir(sys.home), "procs-index.json");

// Each git answer once per run: the session-end hook has 3 seconds for every registry in the index.
const answers = new WeakMap();
function git(sys, dir, args) {
  const memo = answers.get(sys.git) ?? new Map();
  answers.set(sys.git, memo);
  const key = [dir, ...args].join("\0");
  if (!memo.has(key)) memo.set(key, sys.git(dir, args));
  return memo.get(key);
}

/** The registry for a folder: its repo's main checkout, so worktrees share one, else the home one. */
export function registryPath(sys, dir) {
  const common = git(sys, dir, ["rev-parse", "--git-common-dir"]);
  if (!common) return homeRegistry(sys);
  const abs = resolve(dir, common);
  return join(basename(abs) === ".git" ? dirname(abs) : abs, ".onrails", "procs.json");
}

// What's at a path without following a symlink: "missing", "link", "dir", "file" or "other".
function kind(path) {
  try {
    const s = lstatSync(path);
    return s.isSymbolicLink() ? "link" : s.isDirectory() ? "dir" : s.isFile() ? "file" : "other";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

// Why a file or folder's stat s can't be trusted, or null: another user's, or others can write it (unless chmod is
// null). Only on Linux and macOS: Windows has no POSIX owner or mode bits.
function ownerProblem(sys, s, path, chmod) {
  if (sys.platform === "win32") return null;
  if (!Number.isInteger(sys.uid)) return "this user's id can't be read, so the registry's owner can't be checked";
  if (s.uid !== sys.uid) return `${path} belongs to another user`;
  if (chmod && s.mode & 0o022) return `${path} can be written by other users: run chmod ${chmod} ${path}, which keeps what's in it`;
  return null;
}

// A folder the registry reads from or writes into: missing, or a real folder of this user's that nobody else can
// write. shared: ~/.onrails, which other kit files share, may be group-writable (docs/decisions.md row 52).
function folderProblem(sys, dir, shared = false) {
  const k = kind(dir);
  if (k === "missing") return null;
  if (k !== "dir") return `${dir} is a symlink or not a folder`;
  return ownerProblem(sys, lstatSync(dir), dir, shared ? null : "700");
}

const folders = (sys, path) => folderProblem(sys, dirname(path), path === homeRegistry(sys)) ?? folderProblem(sys, join(dirname(path), "logs"));

/**
 * Why a registry can't be trusted, or null. A symlink; a folder or file another user owns or can write; a repo registry
 * that isn't where registryPath puts it, in a repo this user owns; or a file git tracks (it came with a branch). A git
 * error counts as untrusted, never as untracked. The file is checked again, through the open file, when it is read.
 */
export function untrusted(sys, path) {
  const why = folders(sys, path);
  if (why) return why;
  const k = kind(path);
  if (!["missing", "file"].includes(k)) return `${path} is a symlink or the wrong kind of file`;
  return (k === "file" ? ownerProblem(sys, lstatSync(path), path, "600") : null) ?? gitProblem(sys, path);
}

// The home registry may sit outside any repo. Any other must be its repo's own, in a repo this user owns.
function gitProblem(sys, path) {
  const dir = dirname(path), root = dirname(dir), home = path === homeRegistry(sys);
  const inRepo = kind(root) === "dir" && git(sys, root, ["rev-parse", "--git-common-dir"]) !== null;
  if (!inRepo) return home ? null : `${path} isn't in a git repo`;
  if (!home && registryPath(sys, root) !== path) return `${path} isn't its repo's registry`;
  if (!home && sys.platform !== "win32" && lstatSync(root).uid !== sys.uid) return `the repo at ${root} belongs to another user`;
  const tracked = git(sys, root, ["ls-files", "--", basename(dir)]);
  if (tracked === null) return `git ls-files failed in ${root}, so it can't tell whether a branch wrote ${dir}`;
  return tracked ? `git tracks files in ${dir}, so a branch could have written them` : null;
}

function readIndex(sys) {
  try {
    const list = JSON.parse(readText(indexPath(sys)) ?? "{}").registries;
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch { return []; } // a broken index lists nothing; each repo still finds its own registry
}

/** Every registry to look at: this folder's, the home one, and each repo's that a record was ever added to. Trusted ones only. */
export const registries = (sys, dir) => [...new Set([registryPath(sys, dir), homeRegistry(sys), ...readIndex(sys)])]
  .filter((p) => existsSync(p) && !untrusted(sys, p));

function parse(text) {
  try {
    const procs = JSON.parse(text).procs;
    return Array.isArray(procs) ? procs.filter((r) => r && typeof r === "object") : [];
  } catch { return []; } // a broken file reads as empty; the next write replaces it
}

// Opens the registry once, checks what was opened (a regular file of this user's that nobody else can write),
// and reads that same file. The name is never opened twice: it could point somewhere else by the second time.
function read(sys, path) {
  let fd;
  try { fd = openSync(path, READ); } catch (error) {
    return error.code === "ENOENT" ? { procs: [] } : { why: `${path} can't be opened as a plain file (${error.code})` };
  }
  try {
    const s = fstatSync(fd);
    const why = s.isFile() ? ownerProblem(sys, s, path, "600") : `${path} isn't a regular file`;
    return why ? { why } : { procs: parse(readFileSync(fd, "utf8")) };
  } finally { closeSync(fd); }
}

/** The registry's records: [] when it is missing, broken or can't be trusted. sys says who reads (by default, this process). */
export const load = (path, sys = { platform: process.platform, uid: process.getuid?.() ?? null }) => read(sys, path).procs ?? [];

// Writes a file that must not exist yet, so a planted symlink is never followed. Owner-only, whatever the
// umask, or untrusted() would refuse it on the next read.
function writeNew(path, text) {
  rmSync(path, { force: true }); // removes a link itself, never its target
  writeFileSync(path, text, { flag: "wx", mode: 0o600 });
}

// A new file beside it, then a rename, which replaces the name itself, even a link planted there.
function replace(path, text) {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeNew(tmp, text);
  renameSync(tmp, path);
}

const refuse = (why) => { if (why) throw new Error(`the registry can't be used: ${why}`); };

// The registry's folder and its logs folder, owner-only. In a repo it ignores itself, so nothing in it is ever committed.
function folder(sys, path) {
  refuse(untrusted(sys, path));
  mkdirSync(join(dirname(path), "logs"), { recursive: true, mode: 0o700 });
  refuse(folders(sys, path)); // what is there now, made by this call or not
  const ignore = join(dirname(path), ".gitignore");
  if (path !== homeRegistry(sys) && readText(ignore) !== IGNORE) writeNew(ignore, IGNORE);
  return dirname(path);
}

/** A log file in the registry's folder, made ready to write. procs-sys.mjs opens it without following a symlink. */
export const logFor = (sys, path, name) => join(folder(sys, path), "logs", `${name}.log`);

// One writer at a time: a lock folder, waited on for 2 s at most; one older than 10 s is left from a crash.
function withLock(path, fn) {
  const lock = `${path}.lock`;
  for (let i = 0; ; i++) {
    try { mkdirSync(lock); break; } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try { if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { recursive: true, force: true }); } catch { /* gone already */ }
      if (i >= 40) throw new Error(`the registry is locked: ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

/** Reads, changes and writes the registry under the lock. fn gets the records and returns the new list. Throws on a registry it can't trust. */
export function update(sys, path, fn) {
  folder(sys, path);
  return withLock(path, () => {
    const { procs, why } = read(sys, path);
    refuse(why);
    const next = fn(procs);
    refuse(folders(sys, path)); // the folder the new file goes into, checked again right before it is written
    replace(path, JSON.stringify({ version: 1, procs: next }, null, 2) + "\n");
    if (path !== homeRegistry(sys)) remember(sys, path);
    return next;
  });
}

// Best effort: a registry the index misses still shows from its own repo.
function remember(sys, path) {
  try {
    const list = readIndex(sys);
    if (list.includes(path)) return;
    mkdirSync(dirname(indexPath(sys)), { recursive: true, mode: 0o700 });
    if (!folderProblem(sys, dirname(indexPath(sys)), true)) replace(indexPath(sys), JSON.stringify({ registries: [...list, path] }, null, 2) + "\n");
  } catch { /* the home folder may be read-only in a sandbox */ }
}
