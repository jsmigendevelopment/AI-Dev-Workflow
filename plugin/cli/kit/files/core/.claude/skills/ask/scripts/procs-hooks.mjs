// The process registry's background parts (procs.mjs): the watcher that ends paused and timed records,
// and the session hooks. No dependencies.
// The master copy is scripts/procs-hooks.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MINUTE, SCRIPT, age, inspect, livePids, newId, newRecord, past, sameStart, survey } from "./procs-records.mjs";
import { forget, stopRecords } from "./procs-stop.mjs";
import { load, logFor, update } from "./procs-store.mjs";

const PROCS = fileURLToPath(new URL("./procs.mjs", import.meta.url));
const WATCH_HOURS = 24;

// The watcher stops paused and timed records when their time is up, even if the session sits open for days.
// It is a record too, so stop and session end stop it, and it ends itself when no timed record is left.
export function ensureWatcher(sys, path, me) {
  const watchers = load(path).filter((r) => r.kind === "watcher");
  const live = sys.info(livePids(watchers)) ?? new Map();
  if (watchers.some((r) => sameStart(r.start, live.get(r.pid)))) return;
  const id = newId(path);
  const pid = sys.spawn([process.execPath, PROCS, "watch", "--registry", path], { cwd: dirname(path), log: logFor(sys, path, "watch") });
  if (!pid) return;
  const start = sys.info([pid])?.get(pid)?.start;
  if (!start) return void sys.killSpawned(pid); // a record without a start time is never kept
  const flags = { why: "stops paused and timed processes when their time is up", until: "no timed process is left", for: WATCH_HOURS * 60 };
  const fields = { id, kind: "watcher", pid, group: sys.platform !== "win32", start, command: "procs.mjs watch" };
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

export async function watch(sys, path) {
  const end = sys.now() + WATCH_HOURS * 60 * MINUTE;
  while (sys.now() < end && (await expire(sys, path)) > 0) await sys.sleep(MINUTE);
  update(sys, path, (procs) => procs.filter((r) => r.pid !== sys.selfPid));
  return 0;
}

export function sessionStart(sys, log, { dir, me }) {
  const stale = (survey(sys, dir, me, { prune: true }) ?? []).filter((r) => r.stale);
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
  const due = (survey(sys, dir, owner, { prune: true }) ?? []).filter((r) => r.mine || r.owner === "gone");
  for (const path of new Set(due.map((r) => r.path))) {
    const here = due.filter((r) => r.path === path);
    const reaper = sys.spawn([process.execPath, PROCS, "reap", "--registry", path, ...here.map((r) => r.id)], { cwd: dirname(path), log: logFor(sys, path, "reap") });
    if (!reaper) { await stopRecords(sys, here, { grace: 2 }); forget(sys, here); }
  }
  if (due.length) log(`Stopping ${due.length} background process(es) this session or an ended one started.`);
  return 0;
}

export async function reap(sys, path, ids, grace) {
  const recs = load(path).filter((r) => ids.includes(r.id));
  await stopRecords(sys, recs, { grace });
  update(sys, path, (procs) => procs.filter((r) => !ids.includes(r.id)));
  return 0;
}
