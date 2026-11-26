// AC-5 of #100, for AC-3 and section 4: a guard. The person already said yes to the strongest tier
// for this session, and the repo already holds the automation level. An agent that asks either
// again fails. An agent without the kit doesn't ask either, so no difference is expected.
import { questionLines, result } from "../../lib/checks.mjs";

export const guard = true;

const ASK_TOOL = /^AskUserQuestion$|ask.*(?:user|question|human)|user.?input|confirm/i;
const TIER = /\b(strongest|fable|opus|model|tier)\b/i;
const LEVEL = /\b(automation level|recommended|full automation|hands-on|which level)\b/i;
const RESTART = /\b(start|open) a new session\b|\brestart\b|\bswitch (to|models?)\b/i;

export const checks = [
  {
    id: "AC-5-no-ask-tool",
    description: "No tool that asks the person was called",
    check: (t) => {
      const asks = t.toolUses.filter((u) => ASK_TOOL.test(u.name)).map((u) => u.name);
      return result(asks.length === 0, `called ${asks.join(", ")}`);
    },
  },
  {
    id: "AC-5-tier-not-asked-again",
    description: "AC-3: no second question about the strongest tier or the model",
    check: (t) => {
      const asked = questionLines(t.asked).filter((l) => TIER.test(l));
      return result(asked.length === 0, `asked again: ${asked.join(" / ")}`);
    },
  },
  {
    id: "AC-5-no-restart",
    description: "AC-3: the person isn't told to start a new session or switch models",
    check: (t) => result(!RESTART.test(t.finalText), "told the person to restart or switch"),
  },
  {
    id: "AC-5-answered-not-asked",
    description: "Section 4: the automation level the repo already answers isn't asked again",
    check: (t) => {
      const asked = questionLines(t.asked).filter((l) => LEVEL.test(l));
      return result(asked.length === 0, `asked what the repo answers: ${asked.join(" / ")}`);
    },
  },
  {
    id: "AC-5-work-done",
    description: "The step was done: docs/stack.md has the Automation level section, set to recommended",
    check: (t) => result(/##\s*Automation level[\s\S]*\*\*Level:\*\*\s*`?recommended/i.test(t.read("docs/stack.md") ?? ""), "docs/stack.md has no 'Level: recommended'"),
  },
];

export const manual = [
  "Every switch in the section matches the Recommended column of the automation skill's table.",
  "docs/decisions.md has the new row, and the old rows are unchanged.",
];
