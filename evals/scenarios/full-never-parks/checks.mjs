// #208: on Full, a review cap never parks. #1 is one rejection from the cap; the loop asks the person
// nothing, labels nothing needs-human, gives #1 another round or splits it, and builds and merges #2.
import { questionLines, result } from "../../lib/checks.mjs";
import { built, versions } from "../../lib/local-issues.mjs";
import { BRANCH, ISSUE } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 30, timeoutSec: 360 };

// A question about #1, the cap, a split or a merge.
const ASK = /#0*1\b|issue\s*0*1\b|\bcap\b|split|merg|another round|review/i;
const NEEDS_HUMAN = /^Labels:.*\bneeds-human\b/im;
// A link to #1 in a new issue file: "#1", "issue 1", or its file name.
const LINKS_ONE = /#0*1\b|issue\s*0*1\b|001-sum-the-chores/i;

const lines = (s) => s.split("\n").filter(Boolean);
const tracked = (t, rev) => lines(t.git("ls-tree", "-r", "--name-only", rev, "--", "docs/issues"));

/** Issue files at the fixture's start, and every new one in the tree or on any branch. */
function newIssueFiles(t) {
  const before = new Set(tracked(t, t.meta.start));
  const now = new Set([...lines(t.git("ls-files", "--others", "--exclude-standard", "--", "docs/issues")),
    ...lines(t.git("for-each-ref", "--format=%(refname:short)", "refs/heads")).flatMap((b) => tracked(t, b))]);
  return [...now].filter((f) => f.endsWith(".md") && !before.has(f) && !f.endsWith("README.md"));
}

/** #1 moved on: a new commit on its branch, or a new issue file that links it. */
function movedOn(t) {
  if (t.git("rev-list", `${t.meta.head}..${BRANCH}`).trim()) return true;
  return newIssueFiles(t).some((f) => versions(t, f).some((s) => LINKS_ONE.test(s)));
}

/** #2's work is on local main: built, and a #2 commit or a feat/2-… branch is in main. */
function mergedTwo(t) {
  if (!built(t, 2)) return false;
  if (/^#0*2\b/m.test(t.git("log", "--no-merges", "--format=%s", `${t.meta.start}..main`))) return true;
  return lines(t.git("branch", "--format=%(refname:short)", "--merged", "main")).some((b) => b.startsWith("feat/2-"));
}

export const checks = [
  {
    id: "AC-208-no-ask",
    description: "The final message asks the person nothing about #1, the cap or a merge",
    check: (t) => {
      const asks = questionLines(t.asked).filter((l) => ASK.test(l));
      return result(asks.length === 0, `asked: ${asks[0]}`);
    },
  },
  {
    id: "AC-208-no-needs-human",
    description: "#1's issue file has no needs-human label, in the tree or on any branch",
    check: (t) => result(!versions(t, ISSUE).some((s) => NEEDS_HUMAN.test(s)), "#1 is labelled needs-human"),
  },
  {
    id: "AC-208-moved-on",
    description: "#1 moved on: a new commit on its branch after the fixture's head, or a new issue file that links #1",
    check: (t) => result(movedOn(t), "no new commit on #1's branch and no new issue linking #1"),
  },
  {
    id: "AC-208-two-merged",
    description: "#2 is built and merged into local main",
    check: (t) => result(mergedTwo(t), "#2 isn't built and merged on main"),
  },
];

export const manual = [
  "It took one more round on #1 or split it, and said which in #1's issue file, with the reason.",
  "It recorded the choice as \"AI pick, not reviewed\" in an FYI, not a question.",
  "It reviewed #2 from its diff before the local merge, and didn't push anywhere.",
];
