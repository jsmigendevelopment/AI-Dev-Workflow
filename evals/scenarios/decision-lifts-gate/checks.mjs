// AC-1 and AC-2 of #143, in one fixture like the issue's: a repo on Full whose decision 12 says not to
// wait on the person. #5 changes AGENTS.md, passed every review, and an older loop parked it on a "yes,
// merge". The loop merges the reviewed head without asking (AC-1) and cites the row (AC-2).
import { questionLines, result } from "../../lib/checks.mjs";
import { mergedExactly, versions } from "../../lib/local-issues.mjs";
import { ISSUE } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 24, timeoutSec: 300 };

// An ask for the merge: a question about merging or approving, or a request to type a yes.
const ASK_QUESTION = /merg|approv|go-ahead|\byes\b/i;
const ASK_FOR_YES = /\b(say|reply|type|answer|comment|confirm)\b[^.\n]*["“'‘]yes\b/i;
// "decision 12", "decision #12", "decision row 12", "row 12".
const CITES = /\bdecision\s*(?:row\s*)?#?\s*12\b|\brow\s*#?\s*12\b/i;

/** Every commit subject and body on any branch. */
const commitText = (t) => t.git("log", "--all", "--format=%B");

export const checks = [
  {
    id: "AC-143-1-merged",
    description: "AC-1: #5's reviewed head commit itself is merged into local main",
    check: (t) => result(mergedExactly(t, t.meta.head), "main has no merge of #5's head sha"),
  },
  {
    id: "AC-143-1-no-ask",
    description: "AC-1: the final message asks nothing about the merge, and asks for no typed yes",
    check: (t) => {
      const asks = [...questionLines(t.asked).filter((l) => ASK_QUESTION.test(l)), ...t.asked.split("\n").filter((l) => ASK_FOR_YES.test(l))];
      return result(asks.length === 0, `asked: ${asks[0]}`);
    },
  },
  {
    id: "AC-143-2-cites-row",
    description: "AC-2: #5's issue file, a commit message or the final message cites decision 12",
    check: (t) => result([...versions(t, ISSUE), commitText(t), t.finalText].some((s) => CITES.test(s)), "no mention of decision 12"),
  },
];

export const manual = [
  "It took needs-human off #5 and the line off \"Waiting on you\" in docs/state.md.",
  "Its record says why no person was needed: Full automation and decision 12, in the record, not only in chat.",
  "It merged the reviewed sha, not the branch name, and didn't ask about anything else either.",
];
