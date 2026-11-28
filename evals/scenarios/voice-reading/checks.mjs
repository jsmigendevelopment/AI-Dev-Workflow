// AC-2 of #457: with `input = "voice"`, "use 10 stack start" is read by sound as TanStack Start, and the agent goes on
// without asking. Every check reads an action, a question or a file, never the agent's wording about itself.
import { result } from "../../lib/checks.mjs";
import { STACK } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 16, timeoutSec: 240 };

const ASK_TOOL = /^AskUserQuestion$|ask.*(?:user|question|human)|user.?input|confirm/i;
// A run of the script: a command that starts with `node`, then the script's path. Reading the file isn't running it.
const VOICE = /^\s*node\s+\S*voice\.mjs\b/;
const MISHEARD = /10\s*stack|stack\s+start|tan\s*stack/i;
// Correcting or remarking on the wording, which the rule forbids.
const COMMENT = /did you mean|you meant|misheard|mis-?transcri|dictation (?:error|mistake)|typo|auto-?correct|speech[- ]to[- ]text/i;

export const checks = [
  {
    id: "AC-457-2-reads-setting",
    description: "It ran `node ... voice.mjs`, the once-per-session read of the input setting and the glossary",
    check: (t) => result(t.bash.some((c) => VOICE.test(c)), "no `node ... voice.mjs` command"),
  },
  {
    id: "AC-457-2-no-question",
    description: "No ask tool was called, and no question in the final message is about the dictated words or the framework",
    check: (t) => {
      const tool = t.toolUses.find((u) => ASK_TOOL.test(u.name));
      if (tool) return result(false, `called ${tool.name}`);
      // By sentence, so "TanStack Start is in the file. Want a database next?" asks about neither.
      const asked = t.asked.split(/(?<=[.?!])\s+|\n/).filter((s) => s.includes("?") && MISHEARD.test(s));
      return result(!asked.length, `asked: ${asked.join(" / ")}`);
    },
  },
  {
    id: "AC-457-2-tanstack-start",
    description: "docs/stack.md names TanStack Start and no longer says \"10 stack\"",
    check: (t) => {
      const stack = t.read("docs/stack.md") ?? "";
      if (stack === STACK) return result(false, "docs/stack.md is unchanged");
      return result(/TanStack Start/.test(stack) && !/10\s*stack/i.test(stack), `docs/stack.md says: ${stack.replace(/\s+/g, " ").slice(0, 160)}`);
    },
  },
  {
    id: "AC-457-2-no-comment-on-wording",
    description: "The final message doesn't correct or remark on the wording (\"did you mean\", \"misheard\", \"typo\")",
    check: (t) => result(!COMMENT.test(t.finalText), `the final message says: ${t.finalText.match(COMMENT)?.[0]}`),
  },
];

export const manual = [
  "It chose TanStack Start because the sounds fit: the stack file reads naturally, with no note about the wording.",
  "A typist who writes \"10 stack\" isn't covered here: this run's profile says voice.",
];
