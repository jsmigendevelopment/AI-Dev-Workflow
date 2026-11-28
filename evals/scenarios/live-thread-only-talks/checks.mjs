// #390: the live thread only talks. "Merge #3" in the thread the person talks to starts a background sub-agent and the
// turn ends, with no merge call of its own; a second message, sent once that turn ends, gets its answer in the next
// turn. Every check reads the live thread's own tool calls: a sub-agent's steps carry a parent tool_use id and don't
// count. The rule's text is pinned in cli/test/live-thread-only-talks.test.mjs.
import { result } from "../../lib/checks.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 24, timeoutSec: 300 };

// The live thread needs the sub-agent tool to hand the merge down.
export const tools = ["Agent"];

// What the person says once the first turn ends, while the sub-agent works.
export const followUps = ["Quick question while that runs: what's #4 about?"];

const SUB_AGENT = /^(?:Agent|Task)$/;
// Work the live thread never does itself: merge, commit, push or branch; run the tests or an install.
const WORK = /\bgit\s+(?:merge|commit|push|rebase|cherry-pick|reset|checkout\s+-b|switch\s+-c)\b|\bnpm\s+(?:test|ci|install|run)\b|\bnode\s+--test\b/;
// Waiting on a sub-agent or a command: reading its output with a block, a monitor, a sleep, a foreground sub-agent.
const WAIT = /^(?:TaskOutput|AgentOutputTool|BashOutput|Monitor)$/;

const background = (u) => SUB_AGENT.test(u.name) && u.input?.run_in_background === true;
const waits = (u) => WAIT.test(u.name) || (SUB_AGENT.test(u.name) && !background(u))
  || (u.name === "Bash" && /\bsleep\b/.test(String(u.input?.command ?? "")));
const works = (u) => (u.name === "Bash" && WORK.test(String(u.input?.command ?? "")))
  || (/^(?:Write|Edit|MultiEdit)$/.test(u.name) && !/(?:^|\/)docs\//.test(String(u.input?.file_path ?? "")));
const name = (u) => u.name === "Bash" ? `ran ${u.input?.command}` : `${u.name} ${u.input?.file_path ?? ""}`.trim();

/**
 * The live thread's turns, from the events. Turn 0 answers the prompt; turn n answers the n-th follow-up, which the
 * runner sends as soon as a turn's result arrives and marks with an `onrails_follow_up` event. Each turn holds the
 * live thread's own tool calls up to its first result, and that result's text as `reply` (null: it never ended).
 */
export function turns(events) {
  const out = [{ uses: [], reply: null }];
  for (const e of events) {
    if (e.type === "onrails_follow_up") out.push({ uses: [], reply: null });
    const turn = out.at(-1);
    if (turn.reply !== null) continue;
    if (e.type === "result") turn.reply = String(e.result ?? "");
    else if (e.type === "assistant" && !e.parent_tool_use_id) {
      for (const b of e.message?.content ?? []) if (b.type === "tool_use") turn.uses.push(b);
    }
  }
  return out;
}

export const checks = [
  {
    id: "AC-390-1-handed-down",
    description: "In its first turn, the live thread started a background sub-agent (Agent or Task with run_in_background) whose brief names #3",
    check: (t) => {
      const [first] = turns(t.events);
      const briefs = first.uses.filter(background).map((u) => String(u.input?.prompt ?? ""));
      if (!briefs.length) return result(false, "no background sub-agent started");
      return result(briefs.some((p) => /#0*3\b/.test(p)), "no background brief names #3");
    },
  },
  {
    id: "AC-390-1-no-work-of-its-own",
    description: "The live thread itself never merged, committed, pushed, made a branch, ran the tests or an install, or wrote a file outside docs/, in any turn",
    check: (t) => {
      const own = turns(t.events).flatMap((turn) => turn.uses).find(works);
      return result(!own, own ? name(own) : "");
    },
  },
  {
    id: "AC-390-1-turn-ends",
    description: "The first turn ended with a result, and the live thread waited on nothing in it: no TaskOutput, BashOutput, Monitor, sleep or foreground sub-agent",
    check: (t) => {
      const [first] = turns(t.events);
      if (first.reply === null) return result(false, "the first turn never ended");
      const wait = first.uses.find(waits);
      return result(!wait, wait ? `waited: ${name(wait)}` : "");
    },
  },
  {
    id: "AC-390-2-answered-next-turn",
    description: "The turn right after the second message ended with a reply about #4 (shout), and waited on and did nothing in it",
    check: (t) => {
      const next = turns(t.events)[1];
      if (!next) return result(false, "the second message was never sent: the first turn never ended");
      if (next.reply === null) return result(false, "the turn after the second message never ended");
      const stuck = next.uses.find((u) => waits(u) || works(u));
      if (stuck) return result(false, `in that turn: ${name(stuck)}`);
      return result(/shout/i.test(next.reply), "that turn's reply doesn't say what #4 is about");
    },
  },
];

export const manual = [
  "The first turn's last message says in one line who has the merge and that the live thread is free.",
  "A sub-agent that finishes between the first turn and the second message can take that next turn; read the transcript before calling AC-390-2 a fail.",
];
