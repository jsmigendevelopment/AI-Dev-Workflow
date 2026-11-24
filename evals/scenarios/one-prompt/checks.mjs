// AC-5 of #111: on Full automation, /idea with a pitch reaches the first issue without asking the
// person anything. Auto grill writes the full review, marks every pick "AI pick, not reviewed",
// sends an FYI with its link and goes on: naming, the stack, the pyramid, then the issues.
import { questionLines, result } from "../../lib/checks.mjs";

// The whole kickoff writes many files: the default 12 turns can't reach an issue.
export const limits = { maxTurns: 60, timeoutSec: 600 };

const REVIEWS = ["kickoff/review.md", "docs/review.md"];
const NOT_REVIEWED = /AI pick, not reviewed/i;
const FYI = /notify\.mjs\b[^\n]*--level[= ]fyi\b/;
const AC_ID = /\bAC-\d+-\d+\b/;
const WHEN_THEN = /\bWHEN\b[\s\S]*\bTHEN\b/;

const review = (t) => REVIEWS.map((p) => (t.exists(p) ? t.read(p) : "")).find(Boolean) ?? "";
const issueFiles = (t) => t.newFiles().filter((p) => /^docs\/issues\/(?!README).+\.md$/i.test(p));

export const checks = [
  {
    id: "AC-5-asks-nothing",
    description: "The final message asks the person nothing, and no AskUserQuestion was tried",
    check: (t) => {
      const asked = questionLines(t.asked);
      return result(asked.length === 0, `asked: ${asked[0]}`);
    },
  },
  {
    id: "AC-5-review-not-reviewed",
    description: "The review (kickoff/review.md or docs/review.md) has its door blocks and marks the picks \"AI pick, not reviewed\"",
    check: (t) => {
      const text = review(t);
      if (!text) return result(false, "no review.md in kickoff/ or docs/");
      return result(/^###\s+Door:/im.test(text) && NOT_REVIEWED.test(text), "no '### Door:' block, or no \"AI pick, not reviewed\"");
    },
  },
  {
    id: "AC-5-fyi-sent",
    description: "An FYI was sent through notify.mjs --level fyi",
    check: (t) => result(t.bash.some((c) => FYI.test(c)), "no notify.mjs --level fyi call"),
  },
  {
    id: "AC-5-first-issue",
    description: "A first issue file in docs/issues/ has a WHEN/THEN check with an AC ID",
    check: (t) => {
      const files = issueFiles(t);
      if (!files.length) return result(false, "no issue file in docs/issues/");
      const good = files.some((p) => { const text = t.read(p) ?? ""; return AC_ID.test(text) && WHEN_THEN.test(text); });
      return result(good, `no AC ID with WHEN/THEN in ${files.join(", ")}`);
    },
  },
];

export const manual = [
  "Its first line named the level (Full) and the grill (auto), and it went on.",
  "Every seed answer the pitch didn't give is a guess marked \"AI pick, not reviewed\", first in the FYI.",
  "docs/decisions.md has \"Wireframes: AI pick, not reviewed\" with a hash, and docs/stack.md marks its rows the same way.",
  "It wrote no app code before the issues, and the loop started (or it said why it couldn't).",
];
