// The machine the process registry (procs.mjs) talks to, in one object so tests can pass a fake:
//   info(pids)  pid -> { parent, group, start, cpu, mem (KB) } for the live ones, or null when it can't tell
//   table()     every process as { pid, ppid, pgid, args }, or null
//   signal, taskkill, spawn (detached, in its own group), killSpawned, sleep, stdin, now
//   git(dir, args) its output, "" for nothing, null when git failed · uid, gid this user's ids (null on Windows)
//   privateGroup(gid) true when this user is the group's one member, false when not, null when it can't tell
//   acl(path) true when the path has a POSIX ACL, false when it has none, null when it can't tell
// Linux and macOS read ps; Windows reads Win32_Process through PowerShell. No dependencies.
// The master copy is scripts/procs-sys.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, constants, existsSync, openSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { isAbsolute } from "node:path";

/**
 * The real machine. platform is for tests: the checks that only Linux can answer. which(name) turns a bare tool name
 * (git, ps, powershell.exe, taskkill) into the file to run, or null when none may run: doctor passes its own PATH
 * search, which skips copies a project ships (#185). By default the name goes through PATH, as before.
 */
export function realSys({ platform = process.platform, which = (name) => name } = {}) {
  // A tool that may not run fails the way a missing one does.
  const run = (cmd, args, opts) => {
    const file = isAbsolute(cmd) ? cmd : which(cmd);
    return file ? spawnSync(file, args, opts) : { error: new Error(`${cmd} not found`) };
  };
  // null when the tool can't run or reports an error; "" when it found nothing (ps -p with no match exits 1, silently).
  const out = (cmd, args) => {
    const r = run(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true });
    return r.error || (r.status !== 0 && r.stderr?.trim()) ? null : r.stdout ?? "";
  };
  // Its output only when it exits 0, in the C locale so the text is the same everywhere; null for any failure.
  const strict = (cmd, args) => {
    const r = run(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true, env: { ...process.env, LC_ALL: "C" } });
    return r.error || r.status !== 0 ? null : r.stdout;
  };
  const pwsh = (script) => out("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  const children = new Map();
  return {
    platform, env: process.env, home: homedir(), cwd: process.cwd(), parentPid: process.ppid, selfPid: process.pid, uid: process.getuid?.() ?? null,
    gid: process.getgid?.() ?? null,
    // Linux's user private groups only: on macOS the primary group is staff, which every user shares.
    privateGroup: (gid) => (platform !== "linux" ? null : soleMember(gid, userName(), groupSources(out, strict, gid))),
    // Only Linux is asked: there the tools are known. Anywhere else it can't tell, so the caller refuses.
    acl: (path) => (platform !== "linux" ? null : hasAcl(aclSources(strict, path))),
    now: () => Date.now(),
    // Its output, "" when it found nothing, or null when git failed in any way: a failure is never "nothing found".
    git(cwd, args) {
      const r = run("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 15000, windowsHide: true });
      return r.error || r.status !== 0 ? null : r.stdout.trim();
    },
    info: (pids) => (platform === "win32" ? windowsInfo(pwsh, pids) : posixInfo(out, pids)),
    table: () => (platform === "win32" ? windowsTable(pwsh) : posixTable(out)),
    signal(pid, sig) { try { process.kill(pid, sig); return true; } catch { return false; } },
    taskkill: (pid, force) => out("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])]) !== null,
    spawn(argv, opts) {
      const child = spawnDetached(platform, argv, opts);
      if (child?.pid) children.set(child.pid, child);
      return child?.pid ?? null;
    },
    // Through the child's own handle: once it has exited, Node sends nothing, so a reused PID is never hit.
    killSpawned: (pid) => children.get(pid)?.kill("SIGKILL") ?? false,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    stdin: readStdin,
  };
}

const readOrNull = (path) => { try { return readFileSync(path, "utf8"); } catch { return null; } };
const userName = () => { try { return userInfo().username; } catch { return null; } };
// A system tool by its full path, never through PATH, which a project could put first.
const tool = (name) => [`/usr/bin/${name}`, `/bin/${name}`].find((p) => existsSync(p)) ?? null;

function groupSources(out, strict, gid) {
  const getent = tool("getent");
  return { group: readOrNull("/etc/group"), passwd: readOrNull("/etc/passwd"), getent: getent ? out(getent, ["group", String(gid)]) : null,
    getentPasswd: getent ? strict(getent, ["passwd"]) : undefined };
}

/**
 * Whether user is the one member of group gid: the group is named after the user, lists no one else, and is no
 * other user's primary group. group and passwd are /etc/group and /etc/passwd, getent is `getent group <gid>`
 * (each null when it can't be read), getentPasswd is `getent passwd`: undefined when there's no getent, null when
 * it failed. null when it can't tell (no source has the group, or the users can't be listed), so the caller refuses.
 */
export function soleMember(gid, user, { group, passwd, getent, getentPasswd }) {
  const rows = (text) => (text ?? "").split("\n").map((l) => l.trim().split(":")).filter((f) => f.length >= 4);
  const entries = [...rows(group), ...rows(getent)].filter((f) => f[2] === String(gid));
  if (!user || !entries.length) return null;
  if (entries.some((f) => f[0] !== user || f[3].split(",").some((m) => m && m !== user))) return false;
  // Directory users (LDAP and the like) are only in getent's list. No list at all: it can't tell.
  if (getentPasswd === null || (passwd === null && getentPasswd === undefined)) return null;
  return ![...rows(passwd), ...rows(getentPasswd)].some((f) => f[3] === String(gid) && f[0] !== user);
}

// getfacl when it is there, else GNU ls, whose --version says so.
function aclSources(strict, path) {
  const getfacl = tool("getfacl");
  if (getfacl) return { getfacl: strict(getfacl, ["--skip-base", "--absolute-names", "--", path]) };
  const ls = tool("ls");
  return ls ? { ls: strict(ls, ["-ld", "--", path]), lsVersion: strict(ls, ["--version"]) } : {};
}

/**
 * Whether a path has a POSIX ACL. getfacl is `getfacl --skip-base --absolute-names` (null when it failed), which
 * prints nothing for a path with none; or ls is GNU `ls -ld`, whose mode ends in + for a path with one, and
 * lsVersion its `--version`. true or false; null for no tool, an error, another ls, or output it doesn't know.
 */
export function hasAcl({ getfacl, ls, lsVersion }) {
  if (getfacl !== undefined) {
    const text = getfacl?.trim();
    return text === "" ? false : text?.startsWith("# file: ") ? true : null;
  }
  if (typeof ls !== "string" || !lsVersion?.startsWith("ls (GNU coreutils)")) return null;
  const mode = /^[-dlbcps][-rwxsStT]{9}([+.]?)\s/.exec(ls);
  return mode ? mode[1] === "+" : null;
}

// Append, create, and never through a symlink (Windows has no O_NOFOLLOW; the store checks the folder there).
const LOG_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0);

// Its own process group (a session leader on Linux and macOS), output to the log, and it outlives this script.
// The log's folder is made by procs-store.mjs, which refuses a symlink there.
function spawnDetached(platform, argv, { cwd, log }) {
  const fd = openSync(log, LOG_FLAGS, 0o600);
  try {
    const opts = { cwd, detached: true, stdio: ["ignore", fd, fd], windowsHide: true };
    // A Windows .cmd shim (pnpm, npm) starts only through the shell, so it gets one quoted line.
    const child = platform === "win32" ? spawn(argv.map(winQuote).join(" "), { ...opts, shell: true }) : spawn(argv[0], argv.slice(1), opts);
    child.on("error", () => {}); // a missing program leaves child.pid unset, which the caller reports
    child.unref();
    return child;
  } finally { closeSync(fd); }
}

// The hook's JSON. Half a second at most, so a runner that never closes stdin can't hold up the cleanup.
function readStdin() {
  return new Promise((done) => {
    if (process.stdin.isTTY) return done("");
    let text = "";
    const finish = () => { clearTimeout(timer); process.stdin.destroy(); done(text); };
    const timer = setTimeout(finish, 500);
    process.stdin.on("data", (chunk) => { text += chunk; }).on("end", finish).on("error", finish);
  });
}

const winQuote = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
// ps and PowerShell fail the whole query on a PID out of range, so one bad record would hide every other one.
const PID_MAX = 2147483647;
const pidList = (pids) => [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 0 && p <= PID_MAX);

/** info() on Linux and macOS, from ps run through out(cmd, args). A zombie has exited. lstart is five words. */
export function posixInfo(out, pids) {
  const list = pidList(pids);
  if (!list.length) return new Map();
  const cols = ["pid", "ppid", "pgid", "stat", "pcpu", "rss", "lstart"].flatMap((c) => ["-o", `${c}=`]);
  const text = out("ps", [...cols, "-p", list.join(",")]);
  if (text === null) return null;
  const map = new Map();
  for (const t of text.split("\n").map((l) => l.trim().split(/\s+/)).filter((t) => t.length >= 11 && !t[3].startsWith("Z"))) {
    map.set(Number(t[0]), { parent: Number(t[1]), group: Number(t[2]), start: t.slice(6, 11).join(" "), cpu: `${t[4]}% CPU`, mem: Number(t[5]) });
  }
  return map;
}

function posixTable(out) {
  const text = out("ps", ["-A", "-o", "pid=", "-o", "ppid=", "-o", "pgid=", "-o", "args="]);
  if (text === null) return null;
  return text.split("\n").map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/.exec(l)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), args: m[4] }));
}

// Single quotes only: the script goes through Windows' command-line quoting as one argument.
function windowsInfo(pwsh, pids) {
  const list = pidList(pids);
  if (!list.length) return new Map();
  const filter = list.map((p) => `ProcessId=${p}`).join(" OR ");
  const text = pwsh(`Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { '{0}|{1}|{2}|{3}|{4}' -f $_.ProcessId, $_.ParentProcessId, $_.CreationDate.ToUniversalTime().ToString('o'), $_.WorkingSetSize, [math]::Round(($_.KernelModeTime + $_.UserModeTime) / 1e7) }`);
  if (text === null) return null;
  const map = new Map();
  for (const [pid, parent, start, bytes, cpu] of text.split(/\r?\n/).filter(Boolean).map((l) => l.trim().split("|"))) {
    map.set(Number(pid), { parent: Number(parent), group: null, start, cpu: `${cpu} s CPU`, mem: Math.round(Number(bytes) / 1024) });
  }
  return map;
}

function windowsTable(pwsh) {
  const text = pwsh("Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}|{2}' -f $_.ProcessId, $_.ParentProcessId, $(if ($_.CommandLine) { $_.CommandLine } else { $_.Name }) }");
  if (text === null) return null;
  return text.split(/\r?\n/).map((l) => /^(\d+)\|(\d+)\|(.*)$/.exec(l.trim())).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), pgid: null, args: m[3] }));
}
