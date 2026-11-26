// Preflight's system layer (#169): how it starts commands, finds them on PATH, stops them, and knows whether
// the person's own session has read this repo. preflight.mjs holds the probes and the output, and
// preflight-layout.mjs which folders are the repo before the read (#182).
// The master copy is scripts/preflight-sys.mjs in the kit; sync-skills.mjs copies it next to each preflight.mjs.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { hostname } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { realSys as machine } from "./procs-sys.mjs";
import { groupProblem } from "./procs-store.mjs";

// Who may write a folder preflight runs from or reads (#232). The rule is the process registry's for a repo's root
// (procs-store.mjs, row 69): this user's or root's, no write bit for others, and the group's only when the group is this
// user's alone with no ACL. The sticky bit doesn't count for the folder itself: it stops renames, not new names, such as
// a .git, a package.json or a git another user puts there. It counts for a folder above: there it stops another user from
// swapping a folder this user or root owns for one of theirs. Windows isn't checked yet (#246).
let user;
const mine = () => (user ??= machine());

/** Why another local user could write the folder at path itself (s its lstat), or null. */
function writers(sys, path, s) {
  if (s.uid !== sys.uid && s.uid !== 0) return `${path} belongs to another user`;
  if (s.mode & 0o002) return `others can write ${path}`;
  return groupProblem(sys, s, path, `the group can write ${path}`);
}

const isLink = (s) => (s.mode & constants.S_IFMT) === constants.S_IFLNK;

/**
 * Why another local user could add, rename or replace an entry in the folder at, or in a folder above it, or null.
 * child names the entry below at. The folders are looked at with lstat, so a symlink on the way counts as unsafe:
 * when this passes, the path checked is the path the system follows, and nobody else can change it.
 */
function swaps(sys, look, at, child) {
  for (; ; child = at, at = dirname(at)) {
    const s = look(at);
    if (isLink(s)) return `${at} is a symlink, which could be pointed somewhere else`;
    if (s.uid !== sys.uid && s.uid !== 0) return `${at} belongs to another user, who could swap ${child}`;
    const shared = writers(sys, at, s);
    if (shared && !(s.mode & 0o1000)) return `${at} has no sticky bit to stop a swap of ${child}, and ${shared}`;
    if (dirname(at) === at) return null;
  }
}

/** sys and lstat for a check, or a reason it can't run; null on Windows, which isn't checked yet (#246). */
function checker(platform, sys) {
  if (platform === "win32") return null;
  if (!Number.isInteger(sys.uid)) return { why: "this user's id can't be read" };
  return { look: sys.lstat ?? lstatSync };
}
const unchecked = (path, error) => `${path} can't be checked (${error.code ?? "an error"})`;

/**
 * Why another local user could write the folder at path, or swap it or a folder above it, or null when only this user
 * (or root) can. A folder that can't be checked counts as written by others. sys gives uid, gid, acl and privateGroup,
 * and a test's sys may give lstat in place of the real one.
 */
export function othersCanWrite(path, { platform = process.platform, sys = mine() } = {}) {
  const how = checker(platform, sys);
  if (!how?.look) return how?.why ?? null;
  try {
    const real = realpathSync.native(path);
    // Each folder above is checked as one that holds the folder below it, so this user or root owns each of them.
    return writers(sys, real, how.look(real)) ?? (dirname(real) === real ? null : swaps(sys, how.look, dirname(real), real));
  } catch (error) {
    return unchecked(path, error);
  }
}

/**
 * Why another local user could add, rename or replace an entry in the real folder at path, or swap a folder above it,
 * or null. A folder this user makes in it then stays the one this user made (#232). The sticky bit counts here, for
 * the folder itself too. path is never resolved: a symlink on it counts as unsafe.
 */
export function othersCanSwapIn(path, { platform = process.platform, sys = mine() } = {}) {
  const how = checker(platform, sys);
  if (!how?.look) return how?.why ?? null;
  if (!isAbsolute(path)) return `${path} isn't a full path`;
  try {
    return swaps(sys, how.look, path, "a folder made in it");
  } catch (error) {
    return unchecked(path, error);
  }
}

/** Why the entry at path isn't a plain folder this user owns and only this user can write (path not followed), or null. */
export function notOwnFolder(path, { platform = process.platform, sys = mine() } = {}) {
  const how = checker(platform, sys);
  if (!how?.look) return how?.why ?? null;
  try {
    const s = how.look(path);
    if ((s.mode & constants.S_IFMT) !== constants.S_IFDIR) return `${path} isn't a plain folder`;
    if (s.uid !== sys.uid) return `${path} belongs to another user`;
    return writers(sys, path, s);
  } catch (error) {
    return unchecked(path, error);
  }
}

/** True for a regular file this process may start. On POSIX a file without its run bit is passed over, as the shell does. */
function runnable(file, win) {
  try {
    if (!statSync(file).isFile()) return false;
    if (!win) accessSync(file, constants.X_OK);
    return true;
  } catch {
    // Missing, unreadable or not runnable: the search goes on to the next PATH entry.
    return false;
  }
}

/** The file a command name starts, found on PATH (with PATHEXT on Windows), or undefined. Nothing is run. */
function onPath(cmd, platform, env) {
  const win = platform === "win32";
  const exts = win ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").toLowerCase().split(";").filter((e) => /^\.(com|exe|bat|cmd)$/.test(e)) : [""];
  // A relative PATH entry (".", an empty one, or a bare name) is looked up from the current folder, which is the repo: skipped.
  return (env.PATH || env.Path || "").split(win ? ";" : ":").filter((dir) => dir && isAbsolute(dir))
    .flatMap((dir) => exts.map((ext) => join(dir, cmd + ext))).find((f) => runnable(f, win));
}

// No shell, ever: on Windows a shell joins the arguments into one unquoted cmd.exe line. So a command
// is found on PATH, and only a .cmd or .bat shim (npm, pnpm, yarn) goes to cmd.exe, with plain words:
// the same route as launch in the CLI's system.mjs.
/** How run starts a command, always with no shell: { file, args, verbatim? }, or null when it isn't on PATH. */
export function commandFor(cmd, args, { platform = process.platform, env = process.env, execPath = process.execPath } = {}) {
  if (cmd === "node") return { file: execPath, args };
  // Every platform starts a full path. Given a bare name, spawn searches PATH itself, relative and empty entries
  // included, and reads those from the folder the command runs in, which is the repo for the git probes.
  const found = isAbsolute(cmd) ? cmd : onPath(cmd, platform, env);
  if (!found) return null;
  if (platform !== "win32" || !/\.(bat|cmd)$/i.test(found)) return { file: found, args };
  if (args.some((a) => !/^[\w.:=/-]+$/.test(a))) throw new Error(`preflight passes only plain words to cmd.exe, not: ${args.join(" ")}`);
  // cmd.exe /s drops the outer quotes, so a path with spaces stays one word. Node's own shell mode does the same.
  // A bare "cmd.exe" would be looked up in the current folder first, so the fallback is its full path.
  const cmdExe = env.ComSpec || join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  return { file: cmdExe, args: ["/d", "/s", "/c", `""${found}" ${args.join(" ")}"`], verbatim: true };
}

/** The environment every command starts with. */
export function spawnEnv(platform, env) {
  // COREPACK_ENV_FILE=0: corepack's shim never reads a repo's .corepack.env, which can name its registry and turn off its key check.
  const out = { ...env, COREPACK_ENV_FILE: "0" };
  // A .cmd shim (pnpm, yarn) starts a bare `node`, and cmd.exe looks in the current folder first: the repo's node.cmd
  // or node.exe would run. This switch turns that search off for cmd.exe and the programs it starts.
  if (platform === "win32") out.NoDefaultCurrentDirectoryInExePath = "1";
  return out;
}

/** Stops a command and everything it started. On POSIX the command leads its own process group, so the group goes. */
function stopTree(child, platform, env) {
  if (platform === "win32") {
    const taskkill = join(env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    spawnSync(taskkill, ["/pid", String(child.pid), "/T", "/F"], { env: spawnEnv(platform, env), windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    // ESRCH: the group is already empty, which is the goal.
    if (error.code !== "ESRCH") child.kill("SIGKILL");
  }
}

/** Runs one command with a timeout. Resolves { ok, out }, or null when it isn't installed. Nothing it started outlives it. */
function runCommand(cmd, args, { cwd, timeout = 15000, config = [], env: extra = {} }, { platform, env, start }) {
  // The command is looked up on the PATH it is given (#182), so a PATH without the repo's folders holds for the lookup too.
  const given = { ...env, ...extra };
  // Git settings from the command line outrank the repo's own .git/config.
  const how = commandFor(cmd, cmd === "git" ? [...config.flatMap((c) => ["-c", c]), ...args] : args, { platform, env: given });
  if (!how) return Promise.resolve(null);
  const win = platform === "win32";
  return new Promise((done) => {
    let out = "";
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; clearTimeout(timer); done(result); } };
    const child = start(how.file, how.args, { cwd, env: spawnEnv(platform, given), shell: false, windowsVerbatimArguments: how.verbatim,
      windowsHide: true, detached: !win, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      // A version probe can start a self-install that outlives it: the whole tree goes, and the run ends now.
      stopTree(child, platform, env);
      finish({ ok: false, out: `${out.trim()}\nspawn ${cmd} ETIMEDOUT`.trim() });
    }, timeout);
    child.stdout?.on("data", (d) => { out += d; });
    child.stderr?.on("data", (d) => { out += d; });
    child.on("error", (error) => finish(error.code === "ENOENT" ? null : { ok: false, out: `${out.trim()}\n${error.message}`.trim() }));
    // Something it left running in the background goes too. Windows can't find a tree whose root has exited.
    child.on("exit", () => { if (!win) stopTree(child, platform, env); });
    child.on("close", (code) => finish({ ok: code === 0, out: out.trim() }));
  });
}

/** The real session: commands with a timeout, a PATH lookup that runs nothing, and a round trip on 127.0.0.1. */
export function realSys({ platform = process.platform, env = process.env, start = spawn } = {}) {
  return {
    env, node: process.versions.node, hostname: hostname(), platform, now: () => Date.now(),
    has: (cmd, extra = {}) => Boolean(onPath(cmd, platform, { ...env, ...extra })),
    run: (cmd, args = [], opts = {}) => runCommand(cmd, args, opts, { platform, env, start }),
    loopback: () => new Promise((done) => {
      const server = createServer((socket) => socket.end());
      const finish = (ok, detail) => { clearTimeout(timer); server.close(); done({ ok, detail }); };
      const timer = setTimeout(() => finish(false, "no answer in 3 seconds"), 3000);
      const code = (error) => (/^E[A-Z0-9_]{2,30}$/.test(String(error.code)) ? error.code : "an error");
      server.on("error", (error) => finish(false, code(error)));
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        const client = connect(port, "127.0.0.1", () => { client.end(); finish(true, `127.0.0.1:${port}`); });
        client.on("error", (error) => finish(false, code(error)));
      });
    }),
  };
}

// The read marker (#169). docs/state.md can ship with a repo, so it can't say the person's session has read it.
// The marker lives in the repo's .git folder, which git clone never copies. It names that folder's path and
// its device and inode numbers, so a .git folder unpacked from an archive with a marker in it still reads as not read.
// A linked worktree is marked by itself (#182), in its own admin folder, naming its checkout folder and .git file too.
const MARKER = "onrails-read";

/** A small regular file's text, or "". */
function small(path) {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size < 4096 ? readFileSync(path, "utf8") : "";
}
const same = (a, b) => existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b);

/** What is at path, without following a symlink: "dir", "file", "link", "other", or null for nothing. */
function kindOf(path) {
  let entry;
  try {
    entry = lstatSync(path);
  } catch {
    // Nothing there, or a folder this process can't look in: as with existsSync, that counts as nothing.
    return null;
  }
  return entry.isSymbolicLink() ? "link" : entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other";
}

// A .git file can name any folder, and a .git symlink can point at any repo's .git. So a .git file counts only for
// a linked worktree git made: its admin folder sits in <shared .git>/worktrees/, that shared .git is a real folder
// named .git (not a symlink), and the admin folder names this .git file back.
/** A linked worktree's shared .git folder and its admin folder, as real paths ({ git, admin }), or null. */
function linkedGitDir(file) {
  const own = /^gitdir: (.+)$/m.exec(small(file))?.[1]?.trim();
  if (!own) return null;
  const admin = resolve(dirname(file), own);
  const back = small(join(admin, "gitdir")).trim();
  const common = small(join(admin, "commondir")).trim();
  if (!back || !common) return null;
  const shared = resolve(admin, common);
  if (basename(shared) !== ".git" || kindOf(shared) !== "dir") return null;
  const real = realpathSync(shared);
  const home = realpathSync(admin);
  return dirname(home) === join(real, "worktrees") && same(resolve(admin, back), file) ? { git: real, admin: home } : null;
}

/** For the .git entry in the real folder at: { git, admin }, admin only for a linked worktree; or null. A .git symlink never counts. */
function ownGitDir(at) {
  const dot = join(at, ".git");
  const kind = kindOf(dot);
  // at is a real path and dot is no symlink, so dot is its own real path.
  if (kind === "dir") return { git: dot };
  return kind === "file" ? linkedGitDir(dot) : null;
}

/**
 * The real folder that holds the first .git entry of any kind at or above dir, where git's own search stops, or null.
 * It stops at a folder another user can write or swap, and trusts nothing there: they could have put that .git (#232).
 * check is othersCanWrite's options, for a test's sys.
 */
export function repoTop(dir, check = {}) {
  if (!existsSync(dir)) return null;
  for (let at = realpathSync(dir); ; at = dirname(at)) {
    if (othersCanWrite(at, check)) return null;
    if (kindOf(join(at, ".git"))) return at;
    if (dirname(at) === at) return null;
  }
}

/** The repo's shared .git folder for dir, found without running git, or null. */
export function gitDir(dir) {
  const top = repoTop(dir);
  return (top && ownGitDir(top)?.git) ?? null;
}

// A mark another user could write, or a checkout they could swap, proves nothing (#232).
/** Why another user could write or swap the checkout in the real folder top, or the folder own's mark goes in, or null. */
const markProblem = (top, own) => othersCanWrite(top) ?? othersCanWrite(own.admin ?? own.git);

// A deleted worktree's admin folder stays until `git worktree prune`, still naming the old path. A folder made at
// that path right after the delete can get the old inode number back (ext4 hands it out again at once), so a
// worktree's mark also names what a new folder can't share (#182): its .git file's inode and change time, which
// no unpacker or copy can set, and the checkout folder's birth time where the platform reports one.
/** The marker file for the checkout in the real folder top, and the text it must hold: { file, text }, or null. */
function marker(top) {
  const own = ownGitDir(top);
  if (!own) return null;
  const at = own.admin ?? own.git;
  if (markProblem(top, own)) return null;
  const stat = (path) => statSync(path, { bigint: true });
  const id = (path, ...more) => { const { dev, ino } = stat(path); return [`${path}\n${dev}:${ino}`, ...more].join(":"); };
  const dot = join(top, ".git");
  const ids = own.admin ? [id(at), id(top, born(top)), id(dot, stat(dot).ctimeNs)] : [id(at)];
  return { file: join(at, MARKER), text: `onrails read ${createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 24)}\n` };
}

/** A folder's birth time in nanoseconds, or 0 where the platform reports none (Node then gives 0, or the change time). */
function born(path) {
  const { birthtimeNs, ctimeNs } = statSync(path, { bigint: true });
  return birthtimeNs === ctimeNs ? 0n : birthtimeNs;
}

/** True when the person's own session marked this checkout read on this machine. */
export function isRead(dir) {
  const top = repoTop(dir);
  const mark = top && marker(top);
  return Boolean(mark) && small(mark.file) === mark.text;
}

/** Why --mark-read refuses dir's own checkout: another user could write or swap it, or its git folder. Else null. */
export function markRefusal(dir) {
  const top = existsSync(dir) ? realpathSync(dir) : null;
  const own = top && ownGitDir(top);
  return own ? markProblem(top, own) : null;
}

/** Writes the marker for the checkout whose .git is next to dir, never one above it. Returns the folder it marked, or null. */
export function markRead(dir) {
  const top = existsSync(dir) ? realpathSync(dir) : null;
  const mark = top && marker(top);
  if (!mark) return null;
  writeFileSync(mark.file, mark.text);
  return top;
}
