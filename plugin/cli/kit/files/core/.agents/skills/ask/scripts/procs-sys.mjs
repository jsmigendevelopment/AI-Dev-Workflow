// The machine the process registry (procs.mjs) talks to, in one object so tests can pass a fake:
//   info(pids)  pid -> { parent, group, start, cpu, mem (KB) } for the live ones, or null when it can't tell
//   table()     every process as { pid, ppid, pgid, args }, or null
//   signal, taskkill, spawn (detached, in its own group), killSpawned, sleep, stdin, now
//   git(dir, args) its output, "" for nothing, null when git failed · uid, gid this user's ids (null on Windows)
//   privateGroup(gid) true when this user is the group's one member, false when not, null when it can't tell
//   acl(path) true when the path has a POSIX ACL, false when it has none, null when it can't tell
//   winAcls(paths) on Windows a Map of each path to { owned, writers, movers }: whether this user (or the admins) owns
//   it, every other account that can write it, and every other one that can rename, remove or replace what is in it;
//   null for a path it can't tell. All in one PowerShell start (#248). null off Windows
//   fsType(path) on Linux the file system a real folder is on, from /proc/self/mountinfo (null when it can't tell);
//   undefined elsewhere
// Linux and macOS read ps; Windows reads Win32_Process through PowerShell. No dependencies.
// The master copy is scripts/procs-sys.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, constants, existsSync, openSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";

/**
 * The real machine. platform is for tests: the checks that only Linux can answer. run(cmd, args, opts) is how a tool
 * (git, ps, powershell.exe, taskkill, or a full path) runs, with spawnSync's answer. By default it is spawnSync, which
 * looks a bare name up through PATH from the current folder, as before. fullPath is true only for a run that starts a
 * full path it found itself: doctor's, which skips any copy a project ships and goes through cmd.exe for a Windows
 * .cmd shim (#185, #215). So fullPath without a run throws: spawnSync would start a bare git in the target folder (#174).
 */
export function realSys({ platform = process.platform, run, fullPath = false } = {}) {
  if (fullPath && !run) throw new Error("realSys: fullPath needs the run that found the full path");
  run ??= spawnSync;
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
  // On Windows every process comes from one PowerShell start, kept until something can change it: a signal, a spawn
  // or a wait. info() and table() both read it, so a command that does neither starts PowerShell once for them (#248).
  let procs;
  const snapshot = () => (procs ??= { rows: windowsProcs(pwsh(WIN_PROCS)) }).rows;
  return {
    platform, env: process.env, home: homedir(), cwd: process.cwd(), parentPid: process.ppid, selfPid: process.pid, uid: process.getuid?.() ?? null,
    gid: process.getgid?.() ?? null,
    // Linux's user private groups only: on macOS the primary group is staff, which every user shares.
    privateGroup: (gid) => (platform !== "linux" ? null : soleMember(gid, userName(), groupSources(out, strict, gid))),
    // Only Linux is asked: there the tools are known. Anywhere else it can't tell, so the caller refuses.
    acl: (path) => (platform !== "linux" ? null : hasAcl(aclSources(strict, path))),
    // The paths go in the environment, one per line, never in the command line, so no quoting can change the script.
    // A path with a line break can't go in the list, so it can't be told. A block counts only when it ends, so output
    // cut short, or a start that failed, leaves only the paths it didn't finish as "can't tell" (#248).
    winAcls(paths) {
      if (platform !== "win32") return null;
      const list = paths.filter((p) => !/[\r\n]/.test(p));
      const r = list.length ? run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WIN_ACL],
        { encoding: "utf8", timeout: 15000, windowsHide: true, env: { ...process.env, ONRAILS_ACL_PATH: list.join("\n") } }) : null;
      const got = winBatch(r?.stdout, list);
      return new Map(paths.map((p) => [p, got.get(p) ?? null]));
    },
    // Read each time: a small file, and a mount can change while the watcher runs.
    fsType: (path) => (platform !== "linux" ? undefined : mountType(readOrNull("/proc/self/mountinfo"), path)),
    now: () => Date.now(),
    // Its output, "" when it found nothing, or null when git failed in any way: a failure is never "nothing found".
    // A bare git is looked up from the spawn's working folder (a relative PATH entry; on Windows that folder first),
    // so it gets -C and runs from the current folder: never one a repo in the index commits. A full path run takes
    // the folder as its working folder instead, so only plain words reach cmd.exe for a Windows .cmd git (#215).
    git(dir, args) {
      const where = fullPath ? { cwd: dir } : {};
      const r = run("git", fullPath ? args : ["-C", dir, ...args], { ...where, encoding: "utf8", timeout: 15000, windowsHide: true });
      return r.error || r.status !== 0 ? null : r.stdout.trim();
    },
    info: (pids) => (platform === "win32" ? windowsInfo(snapshot(), pids) : posixInfo(out, pids)),
    table: () => (platform === "win32" ? snapshot()?.map(({ pid, ppid, args }) => ({ pid, ppid, pgid: null, args })) ?? null : posixTable(out)),
    signal(pid, sig) { procs = undefined; try { process.kill(pid, sig); return true; } catch { return false; } },
    taskkill: (pid, force) => { procs = undefined; return out("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])]) !== null; },
    spawn(argv, opts) {
      procs = undefined;
      const child = spawnDetached(platform, argv, opts);
      if (child?.pid) children.set(child.pid, child);
      return child?.pid ?? null;
    },
    // Through the child's own handle: once it has exited, Node sends nothing, so a reused PID is never hit.
    killSpawned: (pid) => { procs = undefined; return children.get(pid)?.kill("SIGKILL") ?? false; },
    sleep: (ms) => { procs = undefined; return new Promise((done) => setTimeout(done, ms)); },
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

/**
 * The file system type of the mount that holds path (a real path, with no symlink in it), from the text of
 * /proc/self/mountinfo: the longest mount point that is path or a folder above it, the last one listed when one is
 * mounted over another. null for no text, or no line that holds it. Mount points escape a space as \040 (#231).
 */
export function mountType(text, path) {
  let type = null, longest = -1;
  for (const line of (text ?? "").split("\n")) {
    const [left, right] = line.split(" - ");
    const point = left.split(" ")[4]?.replace(/\\([0-7]{3})/g, (_, n) => String.fromCharCode(parseInt(n, 8)));
    const fs = right?.split(" ")[0];
    if (!point || !fs) continue;
    const holds = path === point || path.startsWith(point.endsWith("/") ? point : `${point}/`);
    if (holds && point.length >= longest) [type, longest] = [fs, point.length];
  }
  return type;
}

// The ACL of each path in $env:ONRAILS_ACL_PATH, one per line: this user's SID once, then for path i "path i", the
// owner's SID, "nodacl" for a null DACL (everyone has full access), one line per rule, "<Allow|Deny> <SID> <rights>",
// and "end i"; or "fail i" when it can't be read. A rule that is inherit-only grants nothing on the path itself (as
// the one under C:\ that lets every user change what they make there); what inherits it is read with its own ACL.
// Single quotes only: the script goes through Windows' command-line quoting as one argument.
const WIN_ACL = ["$ErrorActionPreference = 'Stop'", "$t = [System.Security.Principal.SecurityIdentifier]",
  "'user ' + [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value", "$i = 0",
  "foreach ($p in ($env:ONRAILS_ACL_PATH -split [char]10)) { 'path ' + $i; try { $a = Get-Acl -LiteralPath $p; 'owner ' + $a.GetOwner($t).Value; "
  + "if ($a.GetSecurityDescriptorSddlForm('Access') -match 'NO_ACCESS_CONTROL') { 'nodacl' }; foreach ($r in $a.GetAccessRules($true, $true, $t)) { "
  + "if (-not ($r.PropagationFlags -band 2)) { '{0} {1} {2}' -f $r.AccessControlType, $r.IdentityReference.Value, [long]$r.FileSystemRights } }; "
  + "'end ' + $i } catch { 'fail ' + $i }; $i++ }"].join("; ");
// Any right that changes what is in it, who may, or that it is there: write or append data (make files or folders),
// write attributes, delete a child or itself, change its ACL or owner, and generic all or write.
const WIN_WRITE = 0x2 | 0x4 | 0x10 | 0x40 | 0x100 | 0x10000 | 0x40000 | 0x80000 | 0x10000000 | 0x40000000;
// What lets another account rename, remove or replace what is in a folder, or the folder itself: delete a child or
// itself, change its ACL or owner, and generic all. Making a new entry isn't one: it can't take a name that is there.
const WIN_MOVE = 0x40 | 0x10000 | 0x40000 | 0x80000 | 0x10000000;
// Accounts that may write besides this user: SYSTEM, Administrators, CREATOR OWNER and OWNER RIGHTS (they stand for
// the owner) and TrustedInstaller. They can already do anything on the machine. The owner may be this user, SYSTEM or
// Administrators, which an elevated session makes the owner of what it creates.
const WIN_TRUSTED = ["S-1-5-18", "S-1-5-32-544", "S-1-3-0", "S-1-3-4", "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"];
const WIN_OWNERS = ["S-1-5-18", "S-1-5-32-544", WIN_TRUSTED[4]];
const SID = /^S-1(-\d+)+$/;

/**
 * One path's ACL from its PowerShell output: { owned, writers }, owned when this user, SYSTEM, Administrators or
 * TrustedInstaller owns the path, writers every other account an Allow rule gives a right in mask (a deny is ignored:
 * it can't take away another rule's grant to someone else). null for output it doesn't know, so the caller refuses.
 */
export function winAccess(text, mask = WIN_WRITE) {
  let user = null, owner = null;
  const writers = new Set();
  for (const line of (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [word, sid, rights, ...more] = line.split(" ");
    if (line === "nodacl") writers.add("S-1-1-0");
    else if (more.length || !SID.test(sid ?? "")) return null;
    else if (word === "user" && rights === undefined) user = sid;
    else if (word === "owner" && rights === undefined) owner = sid;
    else if (!["Allow", "Deny"].includes(word) || !/^-?\d+$/.test(rights ?? "")) return null;
    else if (word === "Allow" && (Number(rights) >>> 0) & mask) writers.add(sid);
  }
  if (!user || !owner) return null;
  return { owned: [user, ...WIN_OWNERS].includes(owner), writers: [...writers].filter((s) => s !== user && !WIN_TRUSTED.includes(s)) };
}

/**
 * winAcls() from its PowerShell output for paths: a Map of each path whose block ended to { owned, writers, movers },
 * or null for a block it doesn't know. A path whose block is missing, failed or didn't end is left out.
 */
export function winBatch(text, paths) {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trim()), user = lines.find((l) => l.startsWith("user "));
  const got = new Map();
  let at = null, block = [];
  for (const line of user ? lines : []) {
    const [word, n, ...more] = line.split(" ");
    if (["path", "end", "fail"].includes(word) && !more.length && /^\d+$/.test(n ?? "")) {
      if (word === "end" && n === at && paths[Number(n)] !== undefined) got.set(paths[Number(n)], winRights([user, ...block].join("\n")));
      [at, block] = word === "path" ? [n, []] : [null, []];
    } else if (at !== null) block.push(line);
  }
  return got;
}

function winRights(text) {
  const write = winAccess(text), move = winAccess(text, WIN_MOVE);
  return write && move ? { ...write, movers: move.writers } : null;
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

// Every process, "<pid>|<parent>|<start>|<bytes>|<cpu s>|<command line>". Single quotes only, as in WIN_ACL.
const WIN_PROCS = "Get-CimInstance Win32_Process | ForEach-Object { '{0}|{1}|{2}|{3}|{4}|{5}' -f $_.ProcessId, $_.ParentProcessId, "
  + "$(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') }), $_.WorkingSetSize, "
  + "[math]::Round(($_.KernelModeTime + $_.UserModeTime) / 1e7), $(if ($_.CommandLine) { $_.CommandLine } else { $_.Name }) }";

/** The Windows process list from WIN_PROCS's output: [{ pid, ppid, start, cpu, mem, args }], or null when it failed. */
export function windowsProcs(text) {
  if (text === null) return null;
  return text.split(/\r?\n/).map((l) => /^(\d+)\|(\d+)\|([^|]*)\|(\d*)\|(\d*)\|(.*)$/.exec(l.trim())).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), start: m[3], cpu: `${m[5]} s CPU`, mem: Math.round(Number(m[4]) / 1024), args: m[6] }));
}

function windowsInfo(rows, pids) {
  const list = new Set(pidList(pids));
  if (!list.size) return new Map();
  if (!rows) return null;
  return new Map(rows.filter((r) => list.has(r.pid)).map(({ pid, ppid, start, cpu, mem }) => [pid, { parent: ppid, group: null, start, cpu, mem }]));
}
