// The machine the process registry (procs.mjs) talks to, in one object so tests can pass a fake:
//   info(pids)  pid -> { parent, group, start, cpu, mem (KB) } for the live ones, or null when it can't tell
//   table()     every process as { pid, ppid, pgid, args }, or null
//   signal, taskkill, spawn (detached, in its own group), killSpawned, sleep, stdin, git, now
// Linux and macOS read ps; Windows reads Win32_Process through PowerShell. No dependencies.
// The master copy is scripts/procs-sys.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, constants, openSync } from "node:fs";
import { homedir } from "node:os";

/** The real machine. */
export function realSys() {
  const platform = process.platform;
  // null when the tool can't run or reports an error; "" when it found nothing (ps -p with no match exits 1, silently).
  const out = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true });
    return r.error || (r.status !== 0 && r.stderr?.trim()) ? null : r.stdout ?? "";
  };
  const pwsh = (script) => out("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  const children = new Map();
  return {
    platform, env: process.env, home: homedir(), cwd: process.cwd(), parentPid: process.ppid, selfPid: process.pid,
    now: () => Date.now(),
    git: (cwd, args) => out("git", ["-C", cwd, ...args])?.trim() || null,
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
const pidList = (pids) => [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 0);

// A zombie has exited. lstart is five words on Linux and macOS.
function posixInfo(out, pids) {
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
