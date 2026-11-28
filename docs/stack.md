# Stack

The kit's own repo. An app made with the kit keeps its own file of the same name, from `.agents/skills/idea/templates/stack.md`. The agent-file guard (`.agents/skills/coordinate/scripts/agent-files.mjs`) reads the level below from this file on main (#360).

| Area | Choice | Why |
|---|---|---|
| What ships | The `onrails` npm CLI (`cli/`), the skills in `.agents/skills/` and their synced copies, the guides and the stack packs | The kit itself |
| Language | Plain Node.js scripts (ESM), Node 22 or newer, no runtime dependencies | Agents run them with plain `node` when a registry is blocked (decision 2) |
| Tests | `node:test`: `cd cli && npm test`, and `npm run test:evals` at the root | Built into Node |

## Risk dial

- [x] **Move fast:** the kit has no app data and no money. On Full a careful dial would add reviews, and decision 28 keeps one code review per pull request.

The **always-stop list** in `AGENTS.md` still applies, and releases stay the owner's (`RELEASING.md`).

## Automation level

Full automation: the owner's call, decision 259-1. Nothing is parked as `needs-human`. Reviews and the local gate decide, and the coordinator merges.

- **Level:** full  <!-- recommended | full | hands-on | custom -->
- **Loop:** on
- **Merges, tiny lane:** agents
- **Merges, normal lane:** agents
- **Merges, risky lane:** agents
- **Opens pull requests:** agents
- **In flight at once:** 3
- **Overnight loop:** on
- **Ping level:** blockers

## Reviews

Decision 28: in the kit's own repo, a pull request gets one code review. There is no separate security, QA or weakening review, and no label.

- **Code reviews per pull request:** one, a fresh `pr-review` that reads only the diff and the issue
- **Checks:** the reviewer runs them locally on the exact head commit and posts the `Checks:` comment
- **Weakening review:** written by the one code review. On a pull request that changes a file the guard protects (`.agents/`, `.claude/`, `AGENTS.md` and the rest of the list in `.agents/skills/automation/references/full.md`), the one code review writes the `Weakening review:` line in its verdict comment: `Weakening review: pass @ <full head sha>` when nothing weakens a check or rule, else `Weakening review: fail @ <sha>` with the lines. The guard reads only that line on Full, so `gate` passes on the review's pass and fails without it.

## Checks and deploys

ci = "local"

Every check runs from the agent's session, never from GitHub Actions. The kit has no deploys; a release is the owner's (`RELEASING.md`).
