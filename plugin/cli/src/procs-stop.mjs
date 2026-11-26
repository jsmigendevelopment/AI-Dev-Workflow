// How the process registry (procs.mjs) stops a process: one check before every signal, then TERM to its
// group or tree, and KILL after the grace to what's left. The registry is a file, so no record is trusted
// as written: it never signals anything it didn't start. No dependencies.
// The master copy is scripts/procs-stop.mjs in the kit; sync-skills.mjs copies it next to procs.mjs.
import { findAgent, sameStart } from "./procs-records.mjs";
import { update } from "./procs-store.mjs";

export const GRACE_S = 5;
export const NO_LIST = "the process list can't be read";

/** The PIDs nothing may signal: this process, its parent and the agent. */
export const guarded = (sys) => new Set([sys.selfPid, sys.parentPid, findAgent(sys)].filter(Number.isInteger));

/** What a record must be before any process is looked at: a PID of its own, not ours, and a start time. Why not, or null. */
export function floor(r, guard) {
  if (!Number.isInteger(r.pid) || r.pid <= 1) return `PID ${r.pid} can't be a process onRails started`;
  if (guard.has(r.pid) || r.pid === r.agent?.pid) return `PID ${r.pid} is this script, its parent or the agent`;
  if (typeof r.start !== "string" || !r.start) return "it has no start time, so a reused PID can't be told apart";
  return null;
}

/**
 * Why a record must not be signalled, or null. Run right before every signal, on every record read from disk:
 * the floor, then the live process p: running, the same start time, and for a group signal, its own group's leader.
 */
export function refusal(r, p, { guard, platform }) {
  const why = floor(r, guard);
  if (why) return why;
  if (!p) return "it isn't running";
  if (!sameStart(r.start, p)) return "its PID belongs to another process now";
  if (r.group && platform !== "win32" && p.group !== r.pid) return "it doesn't lead its own process group";
  return null;
}

function descendants(rows, pid, guard) {
  const out = [];
  for (let todo = [pid]; todo.length;) {
    const kids = rows.filter((r) => r.ppid === todo[0] && r.pid > 1 && !guard.has(r.pid) && !out.includes(r.pid)).map((r) => r.pid);
    out.push(...kids);
    todo = [...todo.slice(1), ...kids];
  }
  return out;
}

function signal(sys, r, tree, sig) {
  if (sys.platform === "win32") return sys.taskkill(r.pid, sig === "SIGKILL");
  if (r.group) return sys.signal(-r.pid, sig);
  return [r.pid, ...tree].map((pid) => sys.signal(pid, sig)).some(Boolean);
}

// Another process is still in the group. Its leader has exited, but a group's id isn't reused while it has members.
const members = (rows, r) => rows.some((x) => x.pgid === r.pid && x.pid !== r.pid);

// The records with something left: the leader, the same process, or for a group, a member.
function remaining(sys, recs) {
  const live = sys.info(recs.map((r) => r.pid)) ?? new Map();
  const leaderless = recs.filter((r) => r.group && sys.platform !== "win32" && !sameStart(r.start, live.get(r.pid)));
  const rows = leaderless.length ? sys.table() ?? [] : [];
  return recs.filter((r) => sameStart(r.start, live.get(r.pid)) || (leaderless.includes(r) && members(rows, r)));
}

// KILL after the grace, each record checked again first. Returns the records it was sent to.
function kill(sys, left, ctx) {
  const live = sys.info(left.map((r) => r.pid)) ?? new Map();
  const rows = sys.platform === "win32" ? [] : sys.table() ?? [];
  return left.filter((r) => {
    const p = live.get(r.pid);
    const ok = p ? !refusal(r, p, ctx) : r.group && !floor(r, ctx.guard) && members(rows, r);
    if (ok) signal(sys, r, r.group ? [] : descendants(rows, r.pid, ctx.guard), "SIGKILL");
    return ok;
  });
}

/**
 * TERM to each process's group or tree, then KILL what's still there after the grace.
 * Returns { stopped, killed, refused: [{ r, why }] }. A refused record gets no signal at all.
 */
export async function stopRecords(sys, recs, { grace = GRACE_S } = {}) {
  const ctx = { guard: guarded(sys), platform: sys.platform };
  const live = sys.info(recs.map((r) => r.pid).filter(Number.isInteger));
  const refused = recs.map((r) => ({ r, why: live ? refusal(r, live.get(r.pid), ctx) : NO_LIST })).filter((x) => x.why);
  const ok = recs.filter((r) => !refused.some((x) => x.r === r));
  const rows = sys.platform === "win32" || ok.every((r) => r.group) ? [] : sys.table() ?? [];
  for (const r of ok) signal(sys, r, r.group ? [] : descendants(rows, r.pid, ctx.guard), "SIGTERM");
  let left = ok;
  for (let waited = 0; left.length && waited < grace * 1000; waited += 250) {
    await sys.sleep(250);
    left = remaining(sys, left);
  }
  const killed = left.length ? kill(sys, left, ctx) : [];
  return { stopped: ok.filter((r) => !killed.includes(r)), killed, refused };
}

/** Drops records from whichever registry holds each. */
export function forget(sys, recs) {
  for (const path of new Set(recs.map((r) => r.path))) update(sys, path, (procs) => procs.filter((r) => !recs.some((x) => x.id === r.id && x.path === path)));
}
