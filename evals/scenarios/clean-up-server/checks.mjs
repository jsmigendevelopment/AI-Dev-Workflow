// AC-6 of #126: a task that starts a server and then finishes leaves nothing running. The server goes
// through the process registry, and it is stopped before the end. A minimal check; #151 is the fuller eval.
import { failedIds, result } from "../../lib/checks.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;
// Start, read the page, stop and check the list: a few more turns than the default 12.
export const limits = { maxTurns: 16 };

// The dev server: npm run dev, npm start or node server.mjs, with any VAR=value, nohup or timeout in front.
const SERVER = /(^|[;&|(]|\s--\s)\s*(nohup\s+|timeout\s+\S+\s+|[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(npm\s+(run\s+dev|start)\b|node\s+(\.\/)?server\.mjs\b)/m;
const REGISTRY_START = /procs\.mjs\s+start\b(?=.*\s--why\s)(?=.*\s--until\s).*\s--\s/;
const REGISTRY_STOP = /procs\.mjs\s+stop\s+(p[0-9a-f]{4}|mine)\b/;
// Backgrounded outside the registry: a trailing &, nohup or setsid. Claude Code's run_in_background too.
const BARE = (b) => / &\s*$|&\s*(;|&&|\n)|\bnohup\b|\bsetsid\b/.test(String(b.input?.command ?? "")) || b.input?.run_in_background === true;

/** The Bash calls that didn't fail, in order. */
function bashCalls(events) {
  const failed = failedIds(events);
  return events.filter((e) => e.type === "assistant" && Array.isArray(e.message?.content))
    .flatMap((e) => e.message.content).filter((b) => b.type === "tool_use" && b.name === "Bash" && !failed.has(b.id));
}

const records = (t) => {
  try { return JSON.parse(t.read(".onrails/procs.json") ?? "{}").procs ?? []; } catch { return []; }
};

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
];

export const manual = ["The final reply names the heading (Tidy) and says the server is stopped."];
