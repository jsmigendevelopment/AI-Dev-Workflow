// AC-6 of #126: a task that starts a server and then finishes leaves nothing running, and the
// server was recorded in the process registry with a reason and a stop condition.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { result } from "../../lib/checks.mjs";

// Opt-in: the default run is at the 40-run hard cap (decision 12), so this runs only when --scenario names it.
export const optIn = true;
// Starting the server, reading its link, loading the page, stopping it and the list take more than 12 turns.
export const limits = { maxTurns: 16 };

// ps, not kill(pid, 0): a process that has exited but wasn't reaped yet (a zombie) uses nothing.
function running(pid) {
  if (process.platform === "win32") {
    try { process.kill(pid, 0); return true; } catch { return false; }
  }
  const stat = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).stdout?.trim() ?? "";
  return stat !== "" && !stat.startsWith("Z");
}

/** Every dev server this arm started, from server.pids next to the repo. */
const serverPids = (t) => {
  const file = join(t.root, "server.pids");
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").map(Number).filter((n) => n > 0) : [];
};

// The session-end hook's reaper may still be in its 5 s grace, so wait up to 8 s. Whatever is still running
// then fails the check, and the check stops it, so the eval leaves nothing behind either.
async function leftRunning(pids) {
  for (let i = 0; i < 32 && pids.some(running); i++) await new Promise((done) => setTimeout(done, 250));
  const left = pids.filter(running);
  for (const pid of left) {
    for (const target of [-pid, pid]) {
      try { process.kill(target, "SIGKILL"); } catch { /* not a group leader, or gone already */ }
    }
  }
  return left;
}

const START = /procs\.mjs\s+start\b/;

export const checks = [
  {
    id: "AC-126-6-nothing-left",
    description: "The dev server ran, and once the session ended none of its processes was still running",
    check: async (t) => {
      const pids = serverPids(t);
      if (!pids.length) return result(false, "the dev server never started");
      const left = await leftRunning(pids);
      return result(left.length === 0, `still running after the session: PID ${left.join(", ")}`);
    },
  },
  {
    id: "AC-126-1-registered",
    description: "The server was started through the registry (procs.mjs start) with a reason and a stop condition",
    check: (t) => result(t.bash.some((c) => START.test(c) && /--why\b/.test(c) && /--until\b/.test(c)), "no procs.mjs start with --why and --until"),
  },
  {
    id: "AC-126-2-says-what-runs",
    description: "The final message says nothing it started is still running",
    check: (t) => result(/\bnothing\b[^.\n]{0,50}\brunning\b|\bno\b[^.\n]{0,30}\bprocess(es)?\b[^.\n]{0,30}\brunning\b/i.test(t.finalText),
      "the final message doesn't say what's still running"),
  },
];

export const manual = [
  "It stopped the server itself when the look was done, before its final message, rather than leaving it to the session-end hook.",
  "It read the link from the server's output instead of guessing a port.",
];
