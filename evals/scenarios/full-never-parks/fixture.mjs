// #208: a loop on Full meets an issue at the review cap. Issue #1 is claimed, built on its branch and
// rejected by two review rounds, so the next rejection hits the cap. Issue #2 is ready and small. There's no
// GitHub remote here, so the issues are files.
import { commit, git, repo, write } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

const STACK = `# Stack

Node, no framework.

## Automation level

- **Level:** full  <!-- recommended | full | hands-on | custom -->
- **Loop:** on
- **Merges, tiny lane:** agents
- **Merges, normal lane:** agents
- **Merges, risky lane:** agents
- **In flight at once:** 3
- **Ping level:** blockers
`;

export const ISSUE = "docs/issues/001-sum-the-chores.md";
export const BRANCH = "feat/1-sum";

const SUM = "// The total minutes of a chores list.\nexport const sum = (chores) => chores.reduce((s, c) => s + c.minutes, 0);\n";

/** Issue #1's file: claimed, built at sha, and rejected by two review rounds. */
const capped = (sha) => issue(1, "Sum the chores", "Add src/sum.mjs: the total minutes of a chores list, and 0 for an empty one.", "WHEN the list is empty THEN the sum is 0.")
  .replace("Status: ready", `Status: in-progress · claimed by loop at 09:10 · on ${BRANCH}`)
  + `\n## Comments\n\n- Review · ${sha} · changes: no test for AC-1-1, the empty list.\n`
  + `- Review · ${sha} · changes: still no test for AC-1-1, and sum() has no input check.\n`;

const SECOND = issue(2, "Count the chores", "Add src/count.mjs: how many chores a list has.", "WHEN the list has two chores THEN the count is 2.");

export function build(dir) {
  repo(dir, {
    "package.json": PACKAGE,
    "AGENTS.md": "# AGENTS.md\n\n- **What it is:** a shared chores list for flatmates.\n- **Commands that work here:** `npm run check`.\n",
    "docs/stack.md": STACK,
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **In flight:** #1, two review rounds rejected.\n",
    "docs/issues/README.md": ISSUES_README,
    "docs/issues/002-count-the-chores.md": SECOND,
  });
  git(dir, "switch", "--quiet", "-c", BRANCH);
  write(dir, { "src/sum.mjs": SUM });
  const head = commit(dir, "#1 Sum the chores");
  git(dir, "switch", "--quiet", "main");
  write(dir, { [ISSUE]: capped(head) });
  const start = commit(dir, "#1 two review rounds rejected");
  return { start, head };
}
