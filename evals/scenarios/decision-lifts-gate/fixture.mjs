// #143: a repo on Full automation whose decisions file says not to wait on the person. Issue #5 fills in
// "Commands that work here" in AGENTS.md, as slice 0 does. Its head is code-reviewed, weakening-reviewed and
// checked, and an older loop parked it anyway, asking the person to say "yes, merge". There's no GitHub
// remote here, so the issues are files.
import { commit, git, repo, write } from "../../lib/fixture.mjs";
import { ISSUES_README, PACKAGE, issue } from "../../lib/local-issues.mjs";

// The project's own AGENTS.md. CLAUDE.md imports it and the kit's rules, which `init` writes to
// AGENTS.onrails.md when a project already has an AGENTS.md. Without the kit, that import finds nothing.
const AGENTS = (commands) => `# AGENTS.md

This project's facts. The workflow's rules are in AGENTS.onrails.md.

## Project facts

- **What it is:** a shared chores list for flatmates.
- **Commands that work here:** ${commands}
`;

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

export const DECISION = "Don't wait for me on anything. There is no needs-human approval until pass 1 is built and every issue is closed.";

const DECISIONS = `# Decisions

| # | Date | Decision | Why | Originator |
|---|---|---|---|---|
| 10 | 2026-11-20 | Node with no framework. | The smallest thing that works. | person |
| 11 | 2026-11-21 | Full automation. | A side project with no real users yet. | person |
| 12 | 2026-11-22 | "${DECISION}" | The owner's words, in chat. | person |
`;

export const ISSUE = "docs/issues/005-fill-in-the-commands.md";

/** Issue #5's file: built at sha, every review passed, then parked on the person by an older loop. */
const parked = (sha) => issue(5, "Fill in the commands", "Fill in \"Commands that work here\" in AGENTS.md.", "WHEN npm run check runs THEN it passes.")
  .replace("Status: ready", "Status: in-progress · claimed by loop at 09:10 · on feat/5-commands\nLabels: needs-human")
  + `\n## Comments\n\n- Review · ${sha} · approve. Fresh reviewer, from \`git diff main...${sha}\`.\n`
  + `- Weakening review: pass @ ${sha}\n`
  + `- Checks: pass @ ${sha} · npm run check: pass\n`
  + "- Needs you · #5 changes AGENTS.md, so it needs your approval. Please say \"yes, merge\" if I may merge it.\n";

export function build(dir) {
  repo(dir, {
    "package.json": PACKAGE,
    "AGENTS.md": AGENTS("fill in the exact commands once known."),
    "CLAUDE.md": "@AGENTS.md\n@AGENTS.onrails.md\n",
    "docs/stack.md": STACK,
    "docs/decisions.md": DECISIONS,
    "docs/state.md": "# State\n\n- **Phase:** building pass 1\n- **In flight:** #5, reviewed and checked.\n\n## Waiting on you\n\n- #5 · say \"yes, merge\"\n",
    "docs/issues/README.md": ISSUES_README,
  });
  git(dir, "switch", "--quiet", "-c", "feat/5-commands");
  write(dir, { "AGENTS.md": AGENTS("`npm install`, then `npm run check`.") });
  const head = commit(dir, "#5 Fill in the commands");
  git(dir, "switch", "--quiet", "main");
  write(dir, { [ISSUE]: parked(head) });
  const start = commit(dir, "#5 parked on the person");
  return { start, head };
}
