// The fake machine the process registry's tests run on (procs*.test.mjs): ps, kill and spawn without
// touching a real process. Every signal it is asked to send is recorded, so a test can prove none was.
import { chmodSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/procs.mjs";
import { load, registryPath } from "../src/procs-store.mjs";
import { logger, put, tmp } from "./helpers.mjs";

export const NOW = Date.parse("2026-11-26T10:00:00Z");
export const MIN = 60_000;
export const AGENT = 500; // the agent's own process (claude) in the fake
export const SCRIPT = fileURLToPath(new URL("../../.agents/skills/ask/scripts/procs.mjs", import.meta.url));
export const repoFile = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

// A fake machine. procs: { pid: { args, parent, group, start, onTerm: "exit" | "stay" } }. Every signal is recorded.
// hidden: what it spawns exits at once, so ps never sees it. privateGroup: what it answers when asked whether this
// user is the only member of a group (true, false, or null for "can't tell"). acl: what it answers when asked
// whether a folder has a POSIX ACL (true, false for none, or null for "can't tell"). winAcl(path): the fake Windows
// ACL reader, { owned, writers } or null; by default every path is this user's and no other account can write it.
// Its writers are its movers too (#248), unless it gives movers of its own.
// fsType(path): the file system a folder is on, as /proc/self/mountinfo names it (#231); ext4 by default.
// lstat(path): what the walk to a registry's folder sees (#231); the real lstat by default, so a test can give a
// folder or a link another owner without root's chown. home: the home folder, a new temp folder by default.
export function fakeSys({ platform = "linux", env = { CLAUDE_CODE_SESSION_ID: "s-1", CLAUDE_PID: String(AGENT) }, procs = {}, git = () => null, stdin = "", hidden = false, privateGroup = false, acl = false, winAcl = () => ({ owned: true, writers: [] }), fsType = () => "ext4", lstat = lstatSync, home = tmp("procs-home-") } = {}) {
  let clock = NOW, next = 7000;
  const live = new Map();
  const put1 = (pid, p) => live.set(pid, { parent: 1, group: pid, start: `start-${pid}`, args: "node x", cpu: "0.0% CPU", mem: 2048, onTerm: "exit", ...p });
  put1(AGENT, { args: "/opt/claude-code/bin/claude" });
  for (const [pid, p] of Object.entries(procs)) put1(Number(pid), p);
  const calls = [];
  const end = (pid, sig) => { if (sig === "SIGKILL" || live.get(pid)?.onTerm === "exit") live.delete(pid); };
  return {
    platform, env, home, cwd: tmp("procs-cwd-"), parentPid: 900, selfPid: 999, uid: process.getuid?.() ?? null, gid: process.getgid?.() ?? null, calls, live,
    privateGroup: () => privateGroup,
    acl: () => acl,
    winAcls: (paths) => new Map(paths.map((p) => { const a = winAcl(p); return [p, a && { movers: a.writers, ...a }]; })),
    fsType: (path) => fsType(path),
    lstat: (path) => lstat(path),
    now: () => clock, advance: (ms) => { clock += ms; },
    git: (dir, args) => git(dir, args),
    info: (pids) => new Map(pids.filter((p) => live.has(p)).map((p) => [p, live.get(p)])),
    table: () => [...live].map(([pid, p]) => ({ pid, ppid: p.parent, pgid: p.group, args: p.args })),
    signal(pid, sig) {
      calls.push(`kill ${pid} ${sig}`);
      const hit = pid < 0 ? [...live].filter(([, p]) => p.group === -pid).map(([p]) => p) : live.has(pid) ? [pid] : [];
      for (const p of hit) end(p, sig);
      return hit.length > 0;
    },
    taskkill(pid, force) { calls.push(`taskkill /PID ${pid} /T${force ? " /F" : ""}`); if (live.has(pid)) end(pid, force ? "SIGKILL" : "SIGTERM"); return true; },
    spawn(argv) {
      const pid = next++;
      calls.push(`spawn ${argv.join(" ")}`);
      if (!hidden) put1(pid, { args: argv.join(" ") });
      return pid;
    },
    killSpawned(pid) { calls.push(`killSpawned ${pid}`); live.delete(pid); return true; },
    sleep: async (ms) => { clock += ms; },
    stdin: async () => stdin,
  };
}

// git for a folder in a repo whose common dir is .git: ls-files answers `ls`, "" for nothing tracked, null for a failure.
export const inRepo = (ls) => (dir, args) => (args.includes("--git-common-dir") ? ".git" : args[0] === "ls-files" ? ls : null);

export const run = async (sys, argv, extra = {}) => {
  const log = logger();
  const code = await main(argv, { sys, log, ...extra });
  return { code, out: log.text() };
};
export const startDev = (sys, more = []) => run(sys, ["start", "--why", "show the person #12", "--until", "the person leaves", ...more, "--", "pnpm", "dev"]);
export const records = (sys) => load(registryPath(sys, sys.cwd));
// Every signal the fake machine was asked to send: kill and taskkill, not spawn.
export const signals = (sys) => sys.calls.filter((c) => /^(kill|taskkill) /.test(c));
// A record made by another session: its agent process is `agent`, alive or not. Owner-only, as the registry
// writes it, so a umask that lets the group write doesn't make the store refuse it.
export function seed(sys, rec) {
  put(sys.home, ".onrails/procs.json", JSON.stringify({ version: 1, procs: [...records(sys), {
    kind: "process", group: true, why: "w", until: "u", deadline: null, state: "running", pausedUntil: null, label: "other",
    startedAt: new Date(NOW - 3 * 24 * 60 * MIN).toISOString(), session: "s-old", agent: { pid: 600, start: "start-600" }, ...rec,
  }] }));
  chmodSync(join(sys.home, ".onrails", "procs.json"), 0o600);
  stamp(join(sys.home, ".onrails", "procs.json"));
}

/**
 * Marks a registry a test wrote by hand as one a session wrote, the way update() writes it: the file's own inode
 * inside it (#174). Rewritten in place, so the inode and the mode stay.
 */
export function stamp(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...data, inode: String(statSync(path, { bigint: true }).ino) }));
}

// A stale record of another session's, for the live PID 4000 (#231's tests, in procs-shared*.test.mjs).
export const STALE = { id: "p0bad", kind: "process", pid: 4000, start: "start-4000", group: true, command: "pnpm dev", why: "w", until: "u",
  session: "s-old", agent: { pid: 600, start: "start-600" }, startedAt: new Date(NOW).toISOString() };

/** Runs a command, then the reaper session-end would start, as the real one does. */
export async function runAll(sys, argv) {
  const r = await run(sys, argv);
  const reaper = sys.calls.find((c) => / reap --registry /.test(c));
  if (reaper) await run(sys, reaper.split(" ").slice(3));
  return r;
}

/** Whether PID 4000, STALE's, got a signal. */
export const stopped = (sys) => signals(sys).some((c) => / -?4000 /.test(`${c} `));

/**
 * A repo at dir whose registry holds STALE, private and marked as a session marks it, so only the check under test
 * may refuse it.
 */
export function repoAt(dir, more = {}) {
  const sys = fakeSys({ procs: { 4000: {} }, git: inRepo(""), stdin: '{"session_id":"s-1"}', ...more });
  mkdirSync(join(dir, ".onrails", "logs"), { recursive: true, mode: 0o700 });
  sys.cwd = dir;
  const file = join(dir, ".onrails", "procs.json");
  writeFileSync(file, JSON.stringify({ version: 1, procs: [STALE] }), { mode: 0o600 });
  stamp(file);
  return sys;
}

/** A machine whose home folder holds STALE in ~/.onrails, and an index naming a repo's registry with another (PID 4001). */
export function homeWith(more = {}) {
  const sys = fakeSys({ procs: { 4000: {}, 4001: {} }, stdin: '{"session_id":"s-1"}', ...more });
  seed(sys, STALE);
  const repo = tmp("procs-repo-");
  const file = join(repo, ".onrails", "procs.json");
  mkdirSync(join(repo, ".onrails", "logs"), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ version: 1, procs: [{ ...STALE, id: "p0b0b", pid: 4001, start: "start-4001" }] }), { mode: 0o600 });
  stamp(file);
  writeFileSync(join(sys.home, ".onrails", "procs-index.json"), JSON.stringify({ registries: [file] }), { mode: 0o600 });
  sys.git = (dir, args) => (!dir.startsWith(repo) ? null : args.includes("--git-common-dir") ? join(repo, ".git") : args[0] === "ls-files" ? "" : null);
  return sys;
}

/** homeWith, with the home folder inside a folder of its own: sys.home's parent, which only this user can write. */
export function homeUnder(more = {}) {
  const home = join(tmp("procs-above-"), "home");
  mkdirSync(home, { mode: 0o700 });
  return homeWith({ ...more, home });
}

/** An lstat for fakeSys: the real one, except that path shows uid as its owner. */
export const ownedBy = (path, uid) => (p) => Object.assign(lstatSync(p), p === path ? { uid } : {});

/** Which of homeWith's two records got a signal: the home registry's and the index's. */
export const hit = (sys) => ({ home: signals(sys).some((c) => / -?4000( |$)/.test(c)), index: signals(sys).some((c) => / -?4001( |$)/.test(c)) });
