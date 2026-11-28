// #378: coordinate step 6 checks a pull request's size before review. #1's branch is over 1,000 counted lines and
// #2's is small. With the kit, pr-size.mjs runs, #1 gets no review and goes back with a split brief, and #2 goes on
// to review as today. Every check reads a command, a file or a merge, never the agent's wording about itself.
import { result } from "../../lib/checks.mjs";
import { versions } from "../../lib/local-issues.mjs";
import { ONE, TWO } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 24, timeoutSec: 300 };

// A run of the script: a simple command that starts with `node`, then the script's path. Reading or searching the
// file isn't a size check, even when its arguments say node (`grep -n node .../pr-size.mjs`, #418).
const SIZE = /^\s*node\s+\S*pr-size\.mjs\b/;

/** The simple commands of a shell command: a backslash-newline joins a line, and a newline, `;` or `&&` outside
 * quotes ends one. So `cd <dir> && node ...` and a command over several lines are read command by command (#512). */
function simpleCommands(command) {
  const text = command.replace(/\\\r?\n/g, " ");
  const found = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const ends = c === "\n" || c === ";" || (c === "&" && text[i + 1] === "&");
    if (quote) quote = c === quote ? "" : quote;
    else if (c === "'" || c === '"') quote = c;
    else if (ends) {
      found.push(current);
      current = "";
      if (c === "&") i++;
      continue;
    }
    current += c;
  }
  return [...found, current];
}
const runsSize = (command) => simpleCommands(command).some((c) => SIZE.test(c));
const SPLIT = /\bsplit/i;
// A link to #1 in a new issue file: "#1", "issue 1", or its file name.
const LINKS_ONE = /#0*1\b|issue\s*0*1\b|001-chore-report/i;

const lines = (s) => s.split("\n").filter(Boolean);
/** A review verdict that names the sha, as local mode writes it: `Review · <sha> · ...`. */
const reviewed = (text, sha) => new RegExp(`Review\\s*·\\s*${sha.slice(0, 7)}`, "i").test(text);
/** The sha is on local main: merged, by itself or through a branch that moved past it. */
const onMain = (t, sha) => lines(t.git("rev-list", "main")).includes(sha);

/** Lines of #1's file, in the tree or on any branch, that weren't there at the start. */
function newLinesOfOne(t) {
  const before = new Set(lines(t.git("show", `${t.meta.start}:${ONE}`)));
  return versions(t, ONE).flatMap(lines).filter((l) => !before.has(l));
}

/** New issue files, in the tree or on any branch, that link #1: a child of a split. */
function childrenOfOne(t) {
  const tracked = (rev) => lines(t.git("ls-tree", "-r", "--name-only", rev, "--", "docs/issues"));
  const before = new Set(tracked(t.meta.start));
  const now = new Set([...lines(t.git("ls-files", "--others", "--exclude-standard", "--", "docs/issues")),
    ...lines(t.git("for-each-ref", "--format=%(refname:short)", "refs/heads")).flatMap(tracked)]);
  return [...now].filter((f) => f.endsWith(".md") && !before.has(f) && versions(t, f).some((s) => LINKS_ONE.test(s)));
}

export const checks = [
  {
    id: "AC-378-1-size-checked",
    description: "It ran pr-size.mjs with node: the size check comes before the review",
    check: (t) => result(t.bash.some(runsSize), "no `node ... pr-size.mjs` command"),
  },
  {
    id: "AC-378-1-no-review",
    description: "#1, over the limit, got no review: no `Review · <its sha>` line in its issue file, and its head isn't on main",
    check: (t) => {
      if (onMain(t, t.meta.big)) return result(false, "#1's head is merged into main");
      return result(!versions(t, ONE).some((s) => reviewed(s, t.meta.big)), "#1's issue file has a review of its head");
    },
  },
  {
    id: "AC-378-1-split-brief",
    description: "#1 went back to be split: a new line in its issue file that says split, or a new issue file that links #1",
    check: (t) => result(newLinesOfOne(t).some((l) => SPLIT.test(l)) || childrenOfOne(t).length > 0, "no split brief on #1 and no child issue"),
  },
  {
    id: "AC-378-2-reviewed",
    description: "#2, under the limit, went on to review: a `Review · <its sha>` line in its issue file, or its head merged into main",
    check: (t) => result(onMain(t, t.meta.small) || versions(t, TWO).some((s) => reviewed(s, t.meta.small)), "#2 has no review and isn't merged"),
  },
];

export const manual = [
  "The split brief names the count from pr-size.mjs and both ways to split: child issues with #1 narrowed to the first, or stacked pull requests.",
  "It ran no checks on #1's head before the size check: no `npm run check` in a worktree of it.",
  "It reviewed #2 from its diff, not from the builder's report.",
];
