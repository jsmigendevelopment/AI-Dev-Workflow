// AC-1 of #280: "start the loop" in the thread the person talks to starts the loop as a background sub-agent, and
// the live thread's turn ends with the loop running elsewhere. Every check reads the live thread's own tool calls:
// a sub-agent's steps carry a parent tool_use id and don't count. AC-2 and AC-3 are text tests in
// cli/test/live-thread-loop.test.mjs.
import { result } from "../../lib/checks.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 24, timeoutSec: 300 };

// The live thread needs the sub-agent tool to hand the loop on. Every other scenario runs without it.
export const tools = ["Agent"];

const SUB_AGENT = /^(?:Agent|Task)$/;
// Building in the live thread: a branch for an issue, or a commit.
const BUILDS = /\bgit\s+(?:commit|checkout\s+-b|switch\s+-c)\b/;

/** The live thread's own tool calls, not a sub-agent's. */
const own = (t) => t.toolUses.filter((u) => !u.parent);
/** The live thread's background sub-agent calls. */
const background = (t) => own(t).filter((u) => SUB_AGENT.test(u.name) && u.input?.run_in_background === true);

export const checks = [
  {
    id: "AC-280-1-loop-in-background",
    description: "The live thread started a background sub-agent (Agent or Task with run_in_background)",
    check: (t) => result(background(t).length > 0, "no background sub-agent started"),
  },
  {
    id: "AC-280-1-brief-is-the-loop",
    description: "That sub-agent's brief names the coordinate skill and quotes the automation level (full)",
    check: (t) => {
      const brief = background(t).map((u) => String(u.input?.prompt ?? "")).find((p) => /coordinate/i.test(p));
      if (!brief) return result(false, "no background brief names coordinate");
      return result(/Automation level:[^\n]*full/i.test(brief), "the brief doesn't quote the automation level");
    },
  },
  {
    id: "AC-280-1-live-thread-built-nothing",
    description: "The live thread itself wrote no file outside docs/ and made no branch or commit: the loop runs elsewhere",
    check: (t) => {
      const failed = new Set(t.toolResults.filter((r) => r.isError).map((r) => r.id));
      const ownIds = new Set(own(t).map((u) => u.id));
      const write = t.edits.find((e) => ownIds.has(t.toolUses[e.index].id) && !e.path.startsWith("docs/"));
      if (write) return result(false, `wrote ${write.path}`);
      const cmd = own(t).find((u) => u.name === "Bash" && !failed.has(u.id) && BUILDS.test(String(u.input?.command ?? "")));
      return result(!cmd, `ran ${cmd?.input?.command}`);
    },
  },
];

export const manual = ["The live thread's last message says in one line that the loop runs in the background and that it's free."];
