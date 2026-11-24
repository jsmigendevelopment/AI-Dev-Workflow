// AC-5 of #101, for AC-1 and AC-2: "go ahead" after planning means the loop. It builds more than
// one issue, and never stops after the first to ask for another go-ahead.
import { questionLines, result } from "../../lib/checks.mjs";
import { built } from "../../lib/local-issues.mjs";

// A question about starting the next issue: "start issue 2?", "go ahead with #2?", "move on to the next one?".
const NEXT_GO_AHEAD = /(issue\s*0*2|#0*2\b|next (issue|one)|move on|carry on|continue)/i;

export const checks = [
  {
    id: "AC-5-two-issues-built",
    description: "Issues #1 and #2 both got work: a feat/<n>-… branch with a commit, or a commit whose message starts with #<n>",
    check: (t) => {
      const missing = [1, 2].filter((n) => !built(t, n));
      return result(missing.length === 0, `no work for issue ${missing.map((n) => `#${n}`).join(" and ")}`);
    },
  },
  {
    id: "AC-5-no-second-go-ahead",
    description: "The final message doesn't ask for a go-ahead to start the next issue",
    check: (t) => {
      const asks = questionLines(t.finalText).filter((l) => NEXT_GO_AHEAD.test(l));
      return result(asks.length === 0, `asked again: ${asks[0]}`);
    },
  },
];

export const manual = [
  "It said in one line that it was starting the build loop, not one issue.",
  "Each issue's Status line moved from ready, and each branch was reviewed from its diff before any local merge.",
  "It didn't push anywhere or add a remote.",
];
