// Where the process registry (procs.mjs) keeps its records, and how it writes them safely.
//   <repo's main checkout>/.onrails/procs.json   for a repo: every worktree shares it, and the folder ignores itself
//   ~/.onrails/procs.json                        outside a repo (~/.ai-dev-workflow while only the old name exists)
//   ~/.onrails/procs-index.json                  each repo registry ever written, so npx onrails ps finds them all
// A registry git tracks (or that git can't answer for), another user owns or can write, or a symlink for its
// folder, its file or its logs, is never read or written: a branch or another account must not be able to hand
// the registry its records. Its folder and logs folder must be this user's too, and nobody else may write them
// (only ~/.onrails may be group-writable). The file is checked and read through one open file, so what is read
// is what passed, and so is the index. A repo registry must also be its repo's own, in a repo this user owns
// whose root only this user can write (docs/decisions.md row 69). On Windows the owner and who may write come from
// the ACL. Its records count only when the file holds its own inode, which update() writes into it: a patch, an
// unpacked archive or a copy is a new file, so its records read as none (#174, row 106). Inode numbers are reused, so
// the mark is a filter, not a proof: each record still needs a live process with the same start time.
// No dependencies. The master copy is scripts/procs-store.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { randomBytes } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const IGNORE = "*\n";
// Never through a symlink, and never waiting on a FIFO. Windows has neither flag; there the name checks stand alone.
const READ = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const MAX_BYTES = 1 << 20; // far more than any registry or index holds

/** ~/.onrails, or ~/.ai-dev-workflow (its name before the rename) while only that one exists. */
export function homeDir(home = homedir()) {
  const now = join(home, ".onrails"), old = join(home, ".ai-dev-workflow");
  return !existsSync(now) && existsSync(old) ? old : now;
}

export const homeRegistry = (sys) => join(homeDir(sys.home), "procs.json");
const indexPath = (sys) => join(homeDir(sys.home), "procs-index.json");

// Each git answer, and each Windows ACL (a PowerShell start), once per command: the session-end hook has 3 seconds
// for every registry in the index. The watcher runs for hours, so it forgets them before each pass: a branch
// checked out since may track the registry.
const answers = new WeakMap();
/** Forgets git's and the ACL reader's answers, so the next check asks again. procs.mjs calls it once per command, the watcher once per pass. */
export const askAgain = (sys) => { for (const fn of [sys.git, sys.winAcl]) if (fn) answers.delete(fn); };
function remembered(fn, key, ask) {
  const memo = answers.get(fn) ?? new Map();
  answers.set(fn, memo);
  if (!memo.has(key)) memo.set(key, ask());
  return memo.get(key);
}
const git = (sys, dir, args) => remembered(sys.git, [dir, ...args].join("\0"), () => sys.git(dir, args));
const winAcl = (sys, path) => (sys.winAcl ? remembered(sys.winAcl, path, () => sys.winAcl(path)) : null);

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

// Why a file or folder's stat s can't be trusted, or null: another user's, or it has one of the write bits
// (the group's and others' by default), which chmod clears. Windows has no POSIX owner or mode bits: its ACL is read.
function ownerProblem(sys, s, path, chmod, bits = 0o022) {
  if (sys.platform === "win32") return aclProblem(sys, path);
  if (!Number.isInteger(sys.uid)) return "this user's id can't be read, so the registry's owner can't be checked";
  if (s.uid !== sys.uid) return `${path} belongs to another user`;
  if (s.mode & bits) return `${path} can be written by other users: run chmod ${chmod} ${path}, which keeps what's in it`;
  return null;
}

// On Windows: owned by this user (or SYSTEM or Administrators), and no other account may write it. A folder made
// directly under C:\ lets every signed-in user write, and what is made inside it inherits that (#174).
function aclProblem(sys, path) {
  const acl = winAcl(sys, path);
  if (!acl) return `who can write ${path} can't be read, so its owner can't be checked`;
  if (!acl.owned) return `${path} belongs to another account`;
  if (!acl.writers.length) return null;
  return `${path} can be written by other accounts (${acl.writers.join(", ")}): keep the repo in your user folder, or take their write access away`;
}

// A folder the registry reads from or writes into: missing, or a real folder of this user's, right where its
// name says, that nobody else can write. shared: ~/.onrails, which other kit files share, may be group-writable,
// never world-writable (docs/decisions.md row 67).
function folderProblem(sys, dir, shared = false) {
  const k = kind(dir);
  if (k === "missing") return null;
  if (k !== "dir") return `${dir} is a symlink or not a folder`;
  if (sys.platform !== "win32" && realpathSync(dir) !== join(realpathSync(dirname(dir)), basename(dir))) return `${dir} isn't the folder its name says`;
  return shared ? ownerProblem(sys, lstatSync(dir), dir, "o-w", 0o002) : ownerProblem(sys, lstatSync(dir), dir, "700");
}

// The repo root holds the name .onrails, so whoever can write it can put any folder there. Others never; the group
// only with the sticky bit, or when it is this user's own group with no one else in it and the root has no ACL:
// with one, the group bits are its mask, so a named user may write too (docs/decisions.md row 69). On Windows, its ACL.
function rootProblem(sys, root) {
  if (sys.platform === "win32") return aclProblem(sys, root);
  const s = lstatSync(root);
  if (s.uid !== sys.uid) return `the repo at ${root} belongs to another user`;
  if (s.mode & 0o002) return `others can write the repo at ${root}: run chmod o-w ${root}`;
  if (!(s.mode & 0o020) || s.mode & 0o1000) return null;
  const why = `the group can write the repo at ${root}`, fix = `run chmod g-w ${root}`;
  if (s.gid !== sys.gid) return `${why}, and it isn't this user's alone: ${fix}`;
  if (sys.acl?.(root) !== false) return `${why}, and it has an ACL, or whether it has one can't be told: ${fix}`;
  return sys.privateGroup?.(s.gid) === true ? null : `${why}, and it isn't this user's alone: ${fix}`;
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
  const why = home ? null : rootProblem(sys, root);
  if (why) return why;
  const tracked = git(sys, root, ["ls-files", "--", basename(dir)]);
  if (tracked === null) return `git ls-files failed in ${root}, so it can't tell whether a branch wrote ${dir}`;
  return tracked ? `git tracks files in ${dir}, so a branch could have written them` : null;
}

// Opens a file once, checks what was opened (a regular file of this user's that nobody else can write, and not
// huge) and reads that same file. The name is never opened twice: it could point somewhere else by the second time.
// { text, inode } (text null when it is missing) or { why }. groupOk: a file only the group can write is still read,
// and its text comes with the why.
function readChecked(sys, path, groupOk = false) {
  let fd;
  try { fd = openSync(path, READ); } catch (error) {
    return error.code === "ENOENT" ? { text: null } : { why: `${path} can't be opened as a plain file (${error.code})` };
  }
  try {
    const s = fstatSync(fd);
    const shape = !s.isFile() ? `${path} isn't a regular file` : s.size > MAX_BYTES ? `${path} is over ${MAX_BYTES} bytes` : null;
    if (shape) return { why: shape };
    const why = ownerProblem(sys, s, path, "600");
    const read = !why || (groupOk && !ownerProblem(sys, s, path, "600", 0o002));
    return read ? { why, text: readFileSync(fd, "utf8"), inode: String(fstatSync(fd, { bigint: true }).ino) } : { why };
  } finally { closeSync(fd); }
}

// The index's entries, and why it can't be trusted, if so. An untrusted one lists nothing, and the next write
// replaces it; each repo still finds its own registry. kept: one only the group can write, as main wrote it under
// a 002 umask before #156, still gives its entries, so the write that fixes it keeps them (docs/decisions.md row 70).
function readIndex(sys, kept = false) {
  const path = indexPath(sys);
  const folderWhy = folderProblem(sys, dirname(path), true);
  if (folderWhy) return { list: [], why: folderWhy };
  const { text, why } = readChecked(sys, path, kept);
  try {
    const list = JSON.parse(text ?? "{}").registries;
    return { list: Array.isArray(list) ? list.filter((p) => typeof p === "string") : [], why };
  } catch { return { list: [], why }; } // not JSON: the same as no index
}

const candidates = (sys, dir) => [...new Set([registryPath(sys, dir), homeRegistry(sys), ...readIndex(sys).list])].filter((p) => existsSync(p));

/** Every registry to look at: this folder's, the home one, and each repo's that a record was ever added to. Trusted ones only. */
export const registries = (sys, dir) => candidates(sys, dir).filter((p) => !untrusted(sys, p));

/** Why each registry, or the index, skipped only for a mode this user can fix with chmod was skipped: a list names them, so none hides in silence. */
export const fixable = (sys, dir) => [...new Set([...candidates(sys, dir).map((p) => untrusted(sys, p)), readIndex(sys).why])]
  .filter((why) => why?.includes("run chmod"));

// Only the records of a file whose mark is its own inode: update() writes it into the file. A patch, an unpacked
// archive or a copy makes a new file, so its records read as none, and the next write replaces them; moving the
// folder keeps the inode. A new file can get a freed inode number back, and then its mark matches: the start time
// check is what still stands (#174, docs/decisions.md row 106).
function parse(text, inode) {
  try {
    const data = JSON.parse(text);
    if (data?.inode !== inode) return [];
    return Array.isArray(data.procs) ? data.procs.filter((r) => r && typeof r === "object") : [];
  } catch { return []; } // a broken file reads as empty; the next write replaces it
}

function read(sys, path) {
  const { text, why, inode } = readChecked(sys, path);
  return why ? { why } : { procs: text === null ? [] : parse(text, inode) };
}

/** The registry's records: [] when it is missing, broken or can't be trusted. sys says who reads (by default, this process). */
export const load = (path, sys = { platform: process.platform, uid: process.getuid?.() ?? null }) => read(sys, path).procs ?? [];

// Writes a file that must not exist yet, so a planted symlink is never followed. Owner-only, whatever the
// umask, or untrusted() would refuse it on the next read. make(inode) gives the text: the new file's own inode.
function writeNew(path, make) {
  rmSync(path, { force: true }); // removes a link itself, never its target
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, make(String(fstatSync(fd, { bigint: true }).ino))); } finally { closeSync(fd); }
}

// A new file beside it, then a rename, which replaces the name itself, even a link planted there, and keeps the inode.
function replace(path, make) {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeNew(tmp, make);
  renameSync(tmp, path);
}

const refuse = (why) => { if (why) throw new Error(`the registry can't be used: ${why}`); };

// The registry's folder and its logs folder, owner-only. In a repo it ignores itself, so nothing in it is ever committed.
function folder(sys, path) {
  refuse(untrusted(sys, path));
  mkdirSync(join(dirname(path), "logs"), { recursive: true, mode: 0o700 });
  refuse(folders(sys, path)); // what is there now, made by this call or not
  const ignore = join(dirname(path), ".gitignore");
  if (path !== homeRegistry(sys) && readText(ignore) !== IGNORE) writeNew(ignore, () => IGNORE);
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
    replace(path, (inode) => JSON.stringify({ version: 1, inode, procs: next }, null, 2) + "\n");
    if (path !== homeRegistry(sys)) remember(sys, path);
    return next;
  });
}

// Best effort: a registry the index misses still shows from its own repo.
function remember(sys, path) {
  try {
    const { list, why } = readIndex(sys, true);
    if (list.includes(path) && !why) return;
    mkdirSync(dirname(indexPath(sys)), { recursive: true, mode: 0o700 });
    const next = [...new Set([...list, path])];
    if (!folderProblem(sys, dirname(indexPath(sys)), true)) replace(indexPath(sys), () => JSON.stringify({ registries: next }, null, 2) + "\n");
  } catch { /* the home folder may be read-only in a sandbox */ }
}
