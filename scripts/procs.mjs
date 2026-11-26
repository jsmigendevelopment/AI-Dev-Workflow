#!/usr/bin/env node
// The process registry (#126): every background process an agent starts gets a record, so it is
// stopped when its task is done, when the person says pause or stop, and when the session ends.
// Where the records live: procs-store.mjs. No dependencies.
//   node procs.mjs start --why "<why>" --until "<stop condition>" [--for <minutes>] -- <command> [args...]
//        starts it in the background in its own process group; its output goes to .onrails/logs/<id>.log
//   node procs.mjs list [--mine] [--json]           age, owner and whether it's alive, CPU, memory, stale
//   node procs.mjs stop <id|mine|stale|all|pid> [--yes] [--grace <s>]   TERM to its group or tree, KILL after 5 s
//   node procs.mjs pause [<id>...]                  this session's records stay, marked paused, until
//                                                   [workflow] pause_hours (2) pass or the session ends
//   node procs.mjs resume                           back from a pause
//   node procs.mjs session-start | session-end      the hooks: warn about orphans; stop this session's records
//   node procs.mjs ps [dir] [--stop <x>] [--yes]    list and stop, for npx onrails ps
// A record's owner is the session (CLAUDE_CODE_SESSION_ID, the hook's session_id, or --owner) and the
// agent's own process (claude or codex) with its start time. Stale: it still runs, but its owner is gone,
// or its --for time or its pause has passed. A process it didn't record is stopped only after a yes, and a
// recorded PID whose start time changed belongs to someone else now, so it's left alone.
// Exit 0: done. 1: something was refused or can't be read. 2: a bad flag.
// The master copy is scripts/procs.mjs in the kit; sync-skills.mjs copies it into the ask skill and the CLI.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homeDir, load, logFor, registries, registryPath, update } from "./procs-store.mjs";
import { realSys } from "./procs-sys.mjs";

export { realSys };
const SELF = fileURLToPath(import.meta.url);
const GRACE_S = 5, PAUSE_HOURS = 2, MINUTE = 60_000, WATCH_HOURS = 24;
const SCRIPT = "node .agents/skills/ask/scripts/procs.mjs";
// The agent's own program, run directly or by node. Only a program name counts: a path in a shell's
// command line, such as .claude/worktrees/..., is not the agent.
const AGENT = /^(claude|codex)(\.exe|\.c?js|\.mjs)?$/i;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Who is asking: the session, the agent's process and a label for the list. */
export function whoAmI(sys, { owner, session } = {}) {
  const id = owner || session || sys.env.CLAUDE_CODE_SESSION_ID || null;
  const pid = findAgent(sys);
  const start = pid ? sys.info([pid])?.get(pid)?.start ?? null : null;
  return { session: id, agent: pid ? { pid, start } : null, label: sys.env.ONRAILS_THREAD || id?.slice(0, 8) || (pid ? `pid ${pid}` : "unknown") };
}

// A program's file name, from a Linux, macOS or Windows path, quoted or not.
const program = (token) => token.replace(/"/g, "").split(/[\\/]/).pop();
export const isAgent = (args = "") => args.split(/\s+/).slice(0, 2).some((t) => AGENT.test(program(t)))
  || /@anthropic-ai[\\/]claude-code[\\/]|@openai[\\/]codex[\\/]/.test(args);

function findAgent(sys) {
  const claimed = Number(sys.env.CLAUDE_PID);
  if (Number.isInteger(claimed) && claimed > 0) return claimed;
  const rows = new Map((sys.table() ?? []).map((r) => [r.pid, r]));
  for (let pid = sys.parentPid, i = 0; i < 10 && rows.has(pid); i++, pid = rows.get(pid).ppid) {
    if (isAgent(rows.get(pid).args)) return pid;
  }
  return null;
}

const sameStart = (want, have) => Boolean(have) && (!want || have.start === want);
// Session ids decide when both sides have one: one app process can host many sessions. Else the agent's process does.
const isMine = (r, me) => (me.session && r.session ? r.session === me.session
  : Boolean(me.agent && r.agent?.pid === me.agent.pid && r.agent?.start === me.agent.start));
const past = (when, now) => Boolean(when) && Date.parse(when) <= now;

/** Each record with what's true now: alive, its owner's state, mine, and why it's stale (or null). */
export function inspect(recs, live, me, now) {
  return recs.map((r) => {
    const p = live.get(r.pid);
    const alive = sameStart(r.start, p);
    const owner = !r.agent ? "unknown" : sameStart(r.agent.start, live.get(r.agent.pid)) ? "alive" : "gone";
    const stale = !alive ? null : owner === "gone" ? "its owner session is gone" : past(r.deadline, now) ? `past its time (${r.until})`
      : r.state === "paused" && past(r.pausedUntil, now) ? "its pause ran out" : null;
    return { ...r, alive, owner, stale, mine: isMine(r, me), cpu: p?.cpu, mem: p?.mem };
  });
}

const livePids = (recs) => recs.flatMap((r) => [r.pid, r.agent?.pid]);

function descendants(rows, pid) {
  const out = [];
  for (let todo = [pid]; todo.length;) {
    const kids = rows.filter((r) => r.ppid === todo[0] && !out.includes(r.pid)).map((r) => r.pid);
    out.push(...kids);
    todo = [...todo.slice(1), ...kids];
  }
  return out;
}

function signal(sys, r, tree, sig) {
  if (sys.platform === "win32") return sys.taskkill(r.pid, sig === "SIGKILL");
  if (r.group && sys.signal(-r.pid, sig)) return true;
  return [r.pid, ...tree].map((pid) => sys.signal(pid, sig)).some(Boolean);
}

/** TERM to each process's group or tree, then KILL what's still there after the grace. Live, recorded processes only. */
export async function stopRecords(sys, recs, { grace = GRACE_S } = {}) {
  const rows = sys.platform === "win32" || recs.every((r) => r.group) ? [] : sys.table() ?? [];
  const trees = new Map(recs.map((r) => [r.id, r.group ? [] : descendants(rows, r.pid)]));
  for (const r of recs) signal(sys, r, trees.get(r.id), "SIGTERM");
  let left = recs;
  for (let waited = 0; left.length && waited < grace * 1000; waited += 250) {
    await sys.sleep(250);
    const live = sys.info(left.map((r) => r.pid)) ?? new Map();
    left = left.filter((r) => sameStart(r.start, live.get(r.pid)));
  }
  for (const r of left) signal(sys, r, trees.get(r.id), "SIGKILL");
  return { stopped: recs.filter((r) => !left.includes(r)), killed: left };
}

function age(ms) {
  const m = Math.max(0, Math.floor(ms / MINUTE)), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

function row(r, now) {
  const state = r.stale ? `STALE: ${r.stale}` : r.state === "paused" ? `paused until ${r.pausedUntil}` : "running";
  const usage = [r.cpu, r.mem ? `${Math.round(r.mem / 1024)} MB` : null].filter(Boolean).join(" · ");
  const owner = r.owner === "unknown" ? r.label : `${r.label} (${r.owner})`;
  return [`- ${r.id} · ${state} · pid ${r.pid} · ${age(now - Date.parse(r.startedAt))}${usage ? ` · ${usage}` : ""} · owner ${owner}`,
    `    ${r.command} · why: ${r.why} · until: ${r.until}`].join("\n");
}

/** Reads every registry, drops records of processes that have exited, and inspects the rest. null: can't read processes. */
export function survey(sys, dir, me) {
  const all = registries(sys, dir).filter(existsSync).map((path) => ({ path, recs: load(path) }));
  const live = sys.info(all.flatMap((x) => livePids(x.recs)));
  if (!live) return null;
  return all.flatMap(({ path, recs }) => {
    const seen = inspect(recs, live, me, sys.now());
    const gone = new Set(seen.filter((r) => !r.alive).map((r) => r.id));
    if (gone.size) update(sys, path, (now) => now.filter((r) => !gone.has(r.id)));
    return seen.filter((r) => r.alive).map((r) => ({ ...r, path }));
  });
}

/** For doctor: how many records there are, and the stale ones. */
export function staleSummary(dir, { sys = realSys() } = {}) {
  const seen = survey(sys, dir, { session: null, agent: null });
  return seen ? { total: seen.length, stale: seen.filter((r) => r.stale) } : { total: 0, stale: [], unreadable: true };
}

const fail = (log, message, code = 2) => (log(message), code);
const NO_PS = "Can't read the process list here (ps failed), so nothing was changed.";

function list(sys, log, { dir, me, mine, json, hint }) {
  const seen = survey(sys, dir, me);
  if (!seen) return fail(log, NO_PS, 1);
  const shown = mine ? seen.filter((r) => r.mine) : seen;
  if (json) return log(JSON.stringify(shown, null, 2)), 0;
  if (!shown.length) return log(mine ? "Nothing this session started is running." : "Nothing registered is running."), 0;
  log(`${mine ? "This session's" : "Registered"} background processes (${shown.length}):`);
  for (const r of shown) log(row(r, sys.now()));
  const stale = shown.filter((r) => r.stale).length;
  if (stale) log(`Stale: ${stale}. Stop them: ${hint}`);
  return 0;
}

function newRecord(sys, me, flags, fields) {
  return {
    id: fields.id, kind: fields.kind ?? "process", pid: fields.pid, group: fields.group, start: fields.start ?? null,
    command: fields.command, why: flags.why, until: flags.until, deadline: flags.for ? iso(sys.now() + Number(flags.for) * MINUTE) : null,
    state: "running", pausedUntil: null, session: me.session, agent: me.agent, label: me.label, startedAt: iso(sys.now()), cwd: sys.cwd, log: fields.log ?? null,
  };
}

function newId(path) {
  const taken = new Set(load(path).map((r) => r.id));
  for (;;) { const id = `p${randomBytes(2).toString("hex")}`; if (!taken.has(id)) return id; }
}

function start(sys, log, { path, me, flags, command }) {
  if (!flags.why || !flags.until) return fail(log, "Give every background process a reason and a stop condition: --why \"...\" --until \"...\"");
  if (flags.for !== undefined && !(Number(flags.for) > 0)) return fail(log, "--for takes minutes, more than 0");
  if (!command.length) return fail(log, "Name the command after --: start --why ... --until ... -- pnpm dev");
  const id = newId(path);
  const logFile = logFor(sys, path, id);
  const pid = sys.spawn(command, { cwd: sys.cwd, log: logFile });
  if (!pid) return fail(log, `Couldn't start ${command[0]}. Is it installed and on PATH?`, 1);
  const fields = { id, pid, group: sys.platform !== "win32", start: sys.info([pid])?.get(pid)?.start, command: command.join(" "), log: logFile };
  update(sys, path, (procs) => [...procs, newRecord(sys, me, flags, fields)]);
  if (flags.for) ensureWatcher(sys, path, me);
  log(`${id} · pid ${pid} · output: ${logFile}`);
  return 0;
}

// Asks before it stops a PID it didn't record. A person's yes, or --yes after one, is the only way past.
async function stopUnregistered(sys, log, pid, { yes, ask }) {
  const p = sys.info([pid])?.get(pid);
  if (!p) return fail(log, `No running process has PID ${pid}.`, 1);
  const ok = yes || (ask && /^y(es)?$/i.test(await ask(`PID ${pid} isn't in the registry: onRails didn't start it. Stop it anyway? [y/N] `)));
  if (!ok) return fail(log, `Left PID ${pid} alone: onRails didn't start it. Ask the person first. After a yes: ${SCRIPT} stop ${pid} --yes`, 1);
  const { killed } = await stopRecords(sys, [{ id: `pid ${pid}`, pid, start: p.start, group: false }]);
  log(killed.length ? `Killed PID ${pid} after the grace.` : `Stopped PID ${pid}.`);
  return 0;
}

function pick(seen, target) {
  if (target === "mine") return seen.filter((r) => r.mine);
  if (target === "stale") return seen.filter((r) => r.stale);
  if (target === "all") return seen;
  return seen.filter((r) => r.id === target || String(r.pid) === target);
}

function forget(sys, recs) {
  for (const path of new Set(recs.map((r) => r.path))) update(sys, path, (procs) => procs.filter((r) => !recs.some((x) => x.id === r.id && x.path === path)));
}

async function stop(sys, log, ctx) {
  const { dir, me, target, flags, ask } = ctx;
  if (!target) return fail(log, "Say what to stop: an id, mine, stale, all, or a PID");
  const seen = survey(sys, dir, me);
  if (!seen) return fail(log, NO_PS, 1);
  const picked = pick(seen, target);
  if (!picked.length && /^\d+$/.test(target)) return stopUnregistered(sys, log, Number(target), { yes: flags.yes, ask });
  if (!picked.length && !["mine", "stale", "all"].includes(target)) return fail(log, `No record ${target}. See them all: ${ctx.listCmd}`, 1);
  const grace = flags.grace ? Number(flags.grace) : GRACE_S;
  const { stopped, killed } = await stopRecords(sys, picked, { grace });
  forget(sys, picked);
  for (const r of stopped) log(`Stopped ${r.id}: ${r.command}`);
  for (const r of killed) log(`Killed ${r.id} after ${grace} s: ${r.command}`);
  // The proof: what's still running. An agent sees its own; the person, from the CLI, sees everything.
  return list(sys, log, { ...ctx, mine: !ctx.cli && !["all", "stale"].includes(target) });
}

function pauseHours(sys, dir) {
  const root = sys.git(dir, ["rev-parse", "--show-toplevel"]) || dir;
  for (const p of [join(root, "docs", "profile.toml"), join(homeDir(sys.home), "profile.toml")]) {
    let text = null;
    try { text = readFileSync(p, "utf8"); } catch { continue; } // no profile there: try the next one
    const body = text.split(/^\[workflow\]\s*$/m)[1]?.split(/^\[/m)[0];
    const n = Number(body?.match(/^\s*pause_hours\s*=\s*([\d.]+)/m)?.[1]);
    if (n > 0) return n;
  }
  return PAUSE_HOURS;
}

// Writes a change to each picked record, in whichever registry holds it. Returns the paths it changed.
function mark(sys, picked, change) {
  const paths = [...new Set(picked.map((r) => r.path))];
  for (const path of paths) update(sys, path, (procs) => procs.map((r) => (picked.some((x) => x.id === r.id && x.path === path) ? { ...r, ...change } : r)));
  return paths;
}

function pause(sys, log, ctx) {
  const { dir, me, args } = ctx;
  const seen = survey(sys, dir, me);
  if (!seen) return fail(log, NO_PS, 1);
  const until = iso(sys.now() + pauseHours(sys, dir) * 60 * MINUTE);
  const picked = seen.filter((r) => r.kind !== "watcher" && (args.length ? args.includes(r.id) : r.mine));
  for (const path of mark(sys, picked, { state: "paused", pausedUntil: until })) ensureWatcher(sys, path, me);
  log(picked.length ? `Paused ${picked.length}. Each stops at ${until} or when this session ends. Resume: ${SCRIPT} resume` : "Nothing of this session's to pause.");
  return list(sys, log, { ...ctx, mine: true });
}

function resume(sys, log, { dir, me }) {
  const seen = survey(sys, dir, me);
  if (!seen) return fail(log, NO_PS, 1);
  const picked = seen.filter((r) => r.mine && r.state === "paused");
  mark(sys, picked, { state: "running", pausedUntil: null });
  log(`Resumed ${picked.length}.`);
  return 0;
}

// The watcher stops paused and timed records when their time is up, even if the session sits open for days.
// It is a record too, so stop and session end stop it, and it ends itself when no timed record is left.
function ensureWatcher(sys, path, me) {
  const watchers = load(path).filter((r) => r.kind === "watcher");
  const live = sys.info(watchers.map((r) => r.pid)) ?? new Map();
  if (watchers.some((r) => sameStart(r.start, live.get(r.pid)))) return;
  const id = newId(path);
  const pid = sys.spawn([process.execPath, SELF, "watch", "--registry", path], { cwd: dirname(path), log: logFor(sys, path, "watch") });
  if (!pid) return;
  const flags = { why: "stops paused and timed processes when their time is up", until: "no timed process is left", for: WATCH_HOURS * 60 };
  const fields = { id, kind: "watcher", pid, group: sys.platform !== "win32", start: sys.info([pid])?.get(pid)?.start, command: "procs.mjs watch" };
  update(sys, path, (procs) => [...procs, newRecord(sys, me, flags, fields)]);
}

/** One pass of the watcher: stops what's past its time or pause. Returns how many timed records are left. */
export async function expire(sys, path) {
  const recs = load(path).filter((r) => r.kind !== "watcher");
  const live = sys.info(livePids(recs));
  if (!live) return 0;
  const seen = inspect(recs, live, {}, sys.now());
  const due = seen.filter((r) => r.alive && (past(r.deadline, sys.now()) || (r.state === "paused" && past(r.pausedUntil, sys.now()))));
  await stopRecords(sys, due);
  const gone = new Set([...due, ...seen.filter((r) => !r.alive)].map((r) => r.id));
  update(sys, path, (procs) => procs.filter((r) => !gone.has(r.id)));
  return seen.filter((r) => r.alive && !gone.has(r.id) && (r.deadline || r.pausedUntil)).length;
}

async function watch(sys, path) {
  const end = sys.now() + WATCH_HOURS * 60 * MINUTE;
  while (sys.now() < end && (await expire(sys, path)) > 0) await sys.sleep(MINUTE);
  update(sys, path, (procs) => procs.filter((r) => r.pid !== sys.selfPid));
  return 0;
}

function sessionStart(sys, log, { dir, me }) {
  const stale = (survey(sys, dir, me) ?? []).filter((r) => r.stale);
  if (!stale.length) return 0;
  log("### Background processes left running (the process registry)");
  for (const r of stale) log(`- ${r.id} · ${r.command} · ${age(sys.now() - Date.parse(r.startedAt))} · ${r.stale}`);
  log(`onRails started them. Stop them now with \`${SCRIPT} stop stale\`, and say so in your first reply.`);
  return 0;
}

// Codex caps SessionEnd hooks at 3 seconds, too short for the grace. So a detached reaper does TERM, the wait
// and KILL, and ends on its own. /clear ends a session too: the next one has a new id and couldn't stop these.
async function sessionEnd(sys, log, { dir, me }) {
  let hook = {};
  try { hook = JSON.parse((await sys.stdin()) || "{}"); } catch { hook = {}; } // run by hand: no hook input
  const owner = { ...me, session: hook.session_id || me.session };
  const due = (survey(sys, dir, owner) ?? []).filter((r) => r.mine || r.owner === "gone");
  for (const path of new Set(due.map((r) => r.path))) {
    const here = due.filter((r) => r.path === path);
    const reaper = sys.spawn([process.execPath, SELF, "reap", "--registry", path, ...here.map((r) => r.id)], { cwd: dirname(path), log: logFor(sys, path, "reap") });
    if (!reaper) { await stopRecords(sys, here, { grace: 2 }); forget(sys, here); }
  }
  if (due.length) log(`Stopping ${due.length} background process(es) this session or an ended one started.`);
  return 0;
}

async function reap(sys, path, ids, grace) {
  const recs = load(path).filter((r) => ids.includes(r.id));
  const live = sys.info(livePids(recs)) ?? new Map();
  await stopRecords(sys, recs.filter((r) => sameStart(r.start, live.get(r.pid))), { grace });
  update(sys, path, (procs) => procs.filter((r) => !ids.includes(r.id)));
  return 0;
}

const VALUE = new Set(["--why", "--until", "--for", "--owner", "--grace", "--registry", "--stop"]);
const BOOL = new Set(["--mine", "--json", "--yes"]);

function parse(argv) {
  const flags = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") return { flags, rest, command: argv.slice(i + 1) };
    if (VALUE.has(a)) {
      if (argv[i + 1] === undefined) return { error: `${a} needs a value` };
      flags[a.slice(2)] = argv[++i];
    } else if (BOOL.has(a)) flags[a.slice(2)] = true;
    else if (a.startsWith("-")) return { error: `Unknown option: ${a}` };
    else rest.push(a);
  }
  return { flags, rest, command: [] };
}

const USAGE = "Usage: procs.mjs start --why \"...\" --until \"...\" [--for <min>] -- <command> | list [--mine] [--json] | stop <id|mine|stale|all|pid> [--yes] | pause [<id>...] | resume | session-start | session-end";

/** Runs one command. sys is the machine, log prints a line, ask(question) asks the person (the CLI passes a terminal). */
export async function main(argv, { sys = realSys(), log = console.log, ask } = {}) {
  const { error, flags, rest, command } = parse(argv);
  if (error) return fail(log, `${error}\n${USAGE}`);
  let [cmd, ...args] = rest;
  const cli = cmd === "ps";
  if (cli) [cmd, args] = [flags.stop ? "stop" : "list", [flags.stop]];
  const dir = cli ? resolve(sys.cwd, rest[1] ?? ".") : sys.cwd;
  const path = flags.registry ?? registryPath(sys, dir);
  const me = whoAmI(sys, { owner: flags.owner });
  const ctx = { dir, path, me, flags, args, command, target: args[0], ask, cli, mine: flags.mine, json: flags.json,
    hint: cli ? "npx onrails ps --stop stale" : `${SCRIPT} stop stale`, listCmd: cli ? "npx onrails ps" : `${SCRIPT} list` };
  switch (cmd) {
    case "start": return start(sys, log, ctx);
    case "list": return list(sys, log, ctx);
    case "stop": return stop(sys, log, ctx);
    case "pause": return pause(sys, log, ctx);
    case "resume": return resume(sys, log, ctx);
    case "session-start": return sessionStart(sys, log, ctx);
    case "session-end": return sessionEnd(sys, log, ctx);
    case "watch": return watch(sys, path);
    case "reap": return reap(sys, path, args, flags.grace ? Number(flags.grace) : GRACE_S);
    default: return fail(log, USAGE);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  // A hook must never fail the session, so session-start and session-end always exit 0.
  const hook = ["session-start", "session-end"].includes(process.argv[2]);
  try { process.exitCode = await main(process.argv.slice(2)); } catch (error) {
    if (!hook) throw error;
    console.error(`procs.mjs ${process.argv[2]}: ${error.message}`);
  }
  if (hook) process.exitCode = 0;
}
