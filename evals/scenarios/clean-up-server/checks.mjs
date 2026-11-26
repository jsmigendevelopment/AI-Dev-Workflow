// AC-6 of #126 and #151: a task that starts a server and then finishes leaves nothing running. The server goes
// through the process registry, it is stopped before the end, no server process is left once the session has
// ended, and the final message says so. #151 extended this scenario rather than add a near-duplicate (decision 76).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { failedIds, result } from "../../lib/checks.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;
// Start, read the page, stop and check the list: a few more turns than the default 12.
export const limits = { maxTurns: 16 };

// The dev server: npm run dev, npm start or node server.mjs, with any VAR=value, nohup or timeout in front.
const SERVER = /(^|[;&|(]|\s--\s)\s*(nohup\s+|timeout\s+\S+\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(npm\s+(run\s+dev|start)\b|node\s+(\.\/)?server\.mjs\b)/m;
const REGISTRY_START = /procs\.mjs\s+start\b(?=.*\s--why\s)(?=.*\s--until\s).*\s--\s/;
const REGISTRY_STOP = /procs\.mjs\s+stop\s+(p[0-9a-f]{4}|mine)\b/;
// Backgrounded outside the registry: an & that ends a command (not &&, >&, &>, |& or the & in a URL's query
// string), nohup or setsid. Claude Code's run_in_background too.
const BARE = (b) => /(?<![&>|<])&(?=\s|$|[;)])|\bnohup\b|\bsetsid\b/.test(String(b.input?.command ?? "")) || b.input?.run_in_background === true;
// "Nothing I started is running", "no processes left running", "I stopped the dev server".
const SAYS_NOTHING_RUNS = /\b(nothing|none)\b[^.\n]{0,60}\b(running|left)\b|\bno\b[^.\n]{0,40}\b(process(es)?|servers?)\b[^.\n]{0,40}\b(running|left)\b|\bI(?:'ve| have)?\s+(?:stopped|shut down)\b[^.\n]{0,40}\bserver\b/i;
const STILL_RUNS = /\b(still|left)\s+(running|up)\b/gi;
const NEGATION = /\b(nothing|none|no|not)\b/i;
const CLAUSE = /[,;:]|\b(?:but|and|although|though|while|yet)\b/i;

// A "still running" with no negation before it in its own clause: "nothing else is left, but the server is
// still running" says it still runs; "nothing I started is still running" doesn't.
const saysStillRuns = (sentence) => [...sentence.matchAll(STILL_RUNS)].some((m) => !NEGATION.test(sentence.slice(0, m.index).split(CLAUSE).pop()));
// The session-end hook's reaper has a 5 s grace, so wait up to 8 s before calling a server left running.
const WAIT_MS = 8000;

/** The Bash calls that didn't fail, in order. */
function bashCalls(events) {
  const failed = failedIds(events);
  return events.filter((e) => e.type === "assistant" && Array.isArray(e.message?.content))
    .flatMap((e) => e.message.content).filter((b) => b.type === "tool_use" && b.name === "Bash" && !failed.has(b.id));
}

const records = (t) => {
  try { return JSON.parse(t.read(".onrails/procs.json") ?? "{}").procs ?? []; } catch { return []; }
};

/** Every server this arm started, from server.pids next to the repo: { pid, start }. start is "" where ps can't run. */
function servers(t) {
  const file = join(t.root, "server.pids");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").map((l) => /^(\d+) ?(.*)$/.exec(l.trim())).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), start: m[2] }));
}

// Alive only while its start time matches the one the server wrote and it still runs server.mjs, so a reused PID,
// or one the agent wrote into server.pids, never counts (or gets killed). Never PID 0 or 1. A zombie (exited, not
// yet reaped) uses nothing. Without a start time (no ps), it can only ask whether the PID exists. The start time is
// in UTC, as the server writes it: ps prints local time, and the runner's TZ never reaches the server.
function alive({ pid, start }) {
  if (pid <= 1) return false;
  if (!start) {
    try { process.kill(pid, 0); return true; } catch { return false; }
  }
  const out = spawnSync("ps", ["-o", "stat=", "-o", "lstart=", "-o", "args=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C", TZ: "UTC" } }).stdout ?? "";
  // lstart is five words: "Thu Nov 26 09:02:50 2026".
  const [stat = "", ...rest] = out.trim().split(/\s+/);
  return stat !== "" && !stat.startsWith("Z") && rest.slice(0, 5).join(" ") === start && /\bserver\.mjs\b/.test(rest.slice(5).join(" "));
}

// Waits for the reaper, then kills what's still running, so the eval leaks nothing either. Only a PID whose start
// time matches: the test started it. Never its group: npm or a shell above it exits once the server has gone.
async function leftRunning(list) {
  for (let waited = 0; waited < WAIT_MS && list.some(alive); waited += 250) await new Promise((done) => setTimeout(done, 250));
  const left = list.filter(alive);
  for (const s of left.filter((x) => x.start)) {
    try { process.kill(s.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  return left;
}

export const checks = [
  {
    id: "AC-6-registered",
    description: "The server started through the registry: procs.mjs start with --why and --until, then the server command",
    check: (t) => result(bashCalls(t.events).some((b) => REGISTRY_START.test(b.input.command) && SERVER.test(b.input.command)), "no procs.mjs start for the server"),
  },
  {
    id: "AC-6-stopped",
    description: "After the last start, procs.mjs stop <id> or stop mine ran",
    check: (t) => {
      const calls = bashCalls(t.events).map((b) => b.input.command);
      const last = calls.findLastIndex((c) => REGISTRY_START.test(c));
      return result(last >= 0 && calls.slice(last + 1).some((c) => REGISTRY_STOP.test(c)), "no procs.mjs stop after the server started");
    },
  },
  {
    id: "AC-6-nothing-left",
    description: "Nothing is left: no server was backgrounded outside the registry, and the registry holds no record at the end",
    check: (t) => {
      const bare = bashCalls(t.events).filter((b) => SERVER.test(b.input.command) && !REGISTRY_START.test(b.input.command) && BARE(b));
      const left = records(t);
      return result(!bare.length && !left.length, bare.length ? `backgrounded outside the registry: ${bare[0].input.command}` : `still in the registry: ${left.map((r) => r.command).join(", ")}`);
    },
  },
  {
    id: "AC-151-1-none-running",
    description: "The server ran, and once the session ended no server process was still running (after up to 8 s for the reaper)",
    check: async (t) => {
      const list = servers(t);
      if (!list.length) return result(false, "the dev server never started");
      const left = await leftRunning(list);
      return result(!left.length, `still running after the session: PID ${left.map((s) => s.pid).join(", ")}`);
    },
  },
  {
    id: "AC-151-3-says-so",
    description: "The final message says nothing it started is still running",
    check: (t) => {
      const still = t.finalText.split(/(?<=[.!?])\s+|\n/).find(saysStillRuns);
      if (still) return result(false, `the final message says something still runs: ${still.trim()}`);
      return result(SAYS_NOTHING_RUNS.test(t.finalText), "the final message doesn't say nothing it started is running");
    },
  },
];

export const manual = [
  "The final reply names the heading (Tidy).",
  "It read the link from the server's output instead of guessing a port.",
];
