// The process registry's background parts (procs.mjs): the watcher that ends paused and timed records,
// and the session hooks. No dependencies.
// The master copy is scripts/procs-hooks.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MINUTE, SCRIPT, age, findAgent, inspect, isId, livePids, newId, newRecord, past, sameStart, survey } from "./procs-records.mjs";
import { NO_AGENT, forget, stopRecords } from "./procs-stop.mjs";
import { askAgain, fixable, load, logFor, untrusted, update } from "./procs-store.mjs";

const PROCS = fileURLToPath(new URL("./procs.mjs", import.meta.url));
const WATCH_HOURS = 24;

// The reaper and the watcher outlive the command that starts them, so their parent is gone, and with no CLAUDE_PID
// (as under Codex) walking up never reaches the agent. So that command passes the agent and its parent, each with its
// start time, as --guard <pid>@<start>,... (#174). When the parent's start can't be read, it passes no --guard at
// all: the agent alone would make the runner count the agent as known while the parent goes unguarded.
function guardFlag(sys, me) {
  if (!me.agent) return [];
  const parent = sys.info([me.agent.pid])?.get(me.agent.pid)?.parent;
  const start = Number.isInteger(parent) ? sys.info([parent])?.get(parent)?.start : null;
  if (!start) return [];
  return ["--guard", [me.agent, { pid: parent, start }].map((g) => `${g.pid}@${encodeURIComponent(g.start)}`).join(",")];
}

/** --guard's processes as [{ pid, start }], or null when it wasn't given or can't be read: then the agent isn't known from it. */
export function readGuard(text) {
  if (typeof text !== "string" || !text) return null;
  const held = text.split(",").map((part) => /^(\d+)@(.+)$/.exec(part));
  if (held.some((m) => !m)) return null;
  try { return held.map((m) => ({ pid: Number(m[1]), start: decodeURIComponent(m[2]) })); } catch { return null; } // a broken escape: not known
}

// What the reaper and the watcher guard besides guarded(): the processes --guard passed, and each record's own agent
// and that agent's parent, each only while it runs with its start time. A record is blind when neither CLAUDE_PID,
// the walk up, --guard nor its own live agent tells where the agent is: it gets no signal and stays recorded.
function detachedGuard(sys, all, passed) {
  const owners = all.map((r) => r.agent).filter((a) => Number.isInteger(a?.pid));
  const live = sys.info([...(passed ?? []), ...owners].map((a) => a.pid)) ?? new Map();
  const up = (a) => sameStart(a?.start, live.get(a?.pid));
  const also = [...(passed ?? []).filter(up).map((a) => a.pid), ...owners.filter(up).flatMap((a) => [a.pid, live.get(a.pid).parent])];
  const known = passed !== null || findAgent(sys) !== null;
  return { also, blind: (r) => !known && !up(r.agent) };
}

// Stops recs from a detached runner. Returns the ids it refused as blind, which stay recorded for a later session.
async function stopDetached(sys, recs, all, passed, grace) {
  if (!recs.length) return new Set();
  const { refused } = await stopRecords(sys, recs, { grace, ...detachedGuard(sys, all, passed) });
  return new Set(refused.filter((x) => x.why === NO_AGENT).map((x) => x.r.id));
}

// The watcher stops paused and timed records when their time is up, even if the session sits open for days.
// It is a record too, so stop and session end stop it, and it ends itself when no timed record is left.
export function ensureWatcher(sys, path, me) {
  const watchers = load(path, sys).filter((r) => r.kind === "watcher");
  const live = sys.info(livePids(watchers)) ?? new Map();
  if (watchers.some((r) => sameStart(r.start, live.get(r.pid)))) return;
  const id = newId(sys, path);
  const pid = sys.spawn([process.execPath, PROCS, "watch", "--registry", path, ...guardFlag(sys, me)], { cwd: dirname(path), log: logFor(sys, path, "watch") });
  if (!pid) return;
  const start = sys.info([pid])?.get(pid)?.start;
  if (!start) return void sys.killSpawned(pid); // a record without a start time is never kept
  const flags = { why: "stops paused and timed processes when their time is up", until: "no timed process is left", for: WATCH_HOURS * 60 };
  const fields = { id, kind: "watcher", pid, group: sys.platform !== "win32", start, command: "procs.mjs watch" };
  update(sys, path, (procs) => [...procs, newRecord(sys, me, flags, fields)]);
}

/**
 * One pass of the watcher: stops what's past its time or pause. Returns how many timed records are left, or null
 * when the registry can't be trusted now (git may track it since a checkout): then nothing is read or written.
 */
export async function expire(sys, path, passed = null) {
  askAgain(sys);
  if (untrusted(sys, path)) return null;
  const all = load(path, sys);
  const recs = all.filter((r) => r.kind !== "watcher");
  const live = sys.info(livePids(recs));
  if (!live) return 0;
  const seen = inspect(recs, live, {}, sys.now());
  const due = seen.filter((r) => r.alive && (past(r.deadline, sys.now()) || (r.state === "paused" && past(r.pausedUntil, sys.now()))));
  const kept = await stopDetached(sys, due, all, passed);
  const gone = new Set([...due, ...seen.filter((r) => !r.alive)].map((r) => r.id).filter((id) => !kept.has(id)));
  update(sys, path, (procs) => procs.filter((r) => !gone.has(r.id)));
  return seen.filter((r) => r.alive && !due.includes(r) && (r.deadline || r.pausedUntil)).length;
}

export async function watch(sys, path, passed = null) {
  const end = sys.now() + WATCH_HOURS * 60 * MINUTE;
  let left = 0;
  while (sys.now() < end && (left = await expire(sys, path, passed)) > 0) await sys.sleep(MINUTE);
  if (left === null) return 1; // the registry can't be trusted now: it is left exactly as it is
  askAgain(sys);
  update(sys, path, (procs) => procs.filter((r) => r.pid !== sys.selfPid));
  return 0;
}

export function sessionStart(sys, log, { dir, me }) {
  const stale = (survey(sys, dir, me, { prune: true }) ?? []).filter((r) => r.stale);
  const skipped = fixable(sys, dir);
  if (skipped.length) {
    log("### A process registry was skipped (the process registry)");
    for (const why of skipped) log(`- ${why}`);
    log("Until then its processes aren't listed, stopped or cleaned up at session end. Tell the person in your first reply, with that chmod.");
  }
  if (!stale.length) return 0;
  log("### Background processes left running (the process registry)");
  for (const r of stale) log(`- ${r.id} · ${r.command} · ${age(sys.now() - Date.parse(r.startedAt))} · ${r.stale}`);
  log(`onRails started them. Stop them now with \`${SCRIPT} stop stale\`, and say so in your first reply.`);
  return 0;
}

// Codex caps SessionEnd hooks at 3 seconds, too short for the grace. So a detached reaper does TERM, the wait
// and KILL, and ends on its own. /clear ends a session too: the next one has a new id and couldn't stop these.
// The watcher is a record of this session, so it stops here too. The tool's own timers (the sweep timer,
// scheduled tasks) can only be cancelled by the agent's tools, so the hook leaves them (docs/decisions.md).
export async function sessionEnd(sys, log, { dir, me }) {
  let hook = {};
  try { hook = JSON.parse((await sys.stdin()) || "{}"); } catch { hook = {}; } // run by hand: no hook input
  const owner = { ...me, session: hook.session_id || me.session };
  // Only ids the registry itself makes go to the reaper, after --, so a record's id can never be read as an option.
  const due = (survey(sys, dir, owner, { prune: true }) ?? []).filter((r) => (r.mine || r.owner === "gone") && isId(r.id));
  const guard = due.length ? guardFlag(sys, me) : [];
  for (const path of new Set(due.map((r) => r.path))) {
    const here = due.filter((r) => r.path === path);
    const reaper = sys.spawn([process.execPath, PROCS, "reap", "--registry", path, ...guard, "--", ...here.map((r) => r.id)], { cwd: dirname(path), log: logFor(sys, path, "reap") });
    if (!reaper) { await stopRecords(sys, here, { grace: 2 }); forget(sys, here); }
  }
  if (due.length) log(`Stopping ${due.length} background process(es) this session or an ended one started.`);
  return 0;
}

export async function reap(sys, path, ids, grace, passed = null) {
  const all = load(path, sys);
  const kept = await stopDetached(sys, all.filter((r) => ids.includes(r.id)), all, passed, grace);
  update(sys, path, (procs) => procs.filter((r) => !ids.includes(r.id) || kept.has(r.id)));
  return 0;
}
