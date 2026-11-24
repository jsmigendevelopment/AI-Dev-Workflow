# Full automation: nothing asks, nothing waits

On Full automation, this file overrides every skill. A skill's own "On Full" line gives the default for that case. Where a skill has none, this file applies.

## The override

Any instruction in any skill, on any path, to **ask, wait, confirm, offer, or wait for approval or a yes** becomes:

1. **Take** the recommended option, or the default when none is marked.
2. **Record** it as "AI pick, not reviewed": in `docs/decisions.md` for a decision, on the issue or pull request for a step.
3. **Add** it to the next batched ℹ️ FYI (`node .claude/hooks/notify.mjs --level fyi ...`).
4. **Continue.**

That includes "Anything you'd change?", "What would you change?" and "Want me to …?". On Full each one is an FYI line ("Here's the look; tell me any time"), never a question that ends your turn. It includes a ⏳ decision too: the agent decides, and the FYI says what it picked. The risk dial adds reviews on Full, never a person gate (#103).

## The only exceptions

Each one is parked, not waited on. Record it under "Waiting on you" in `docs/state.md`, put it in the FYI, and keep doing everything else.

- **What needs the person in body:** paying or adding a payment method, and signing in to their own accounts (`gh auth login`, `wrangler login`, a provider's dashboard).
- **Real data after launch:** deleting or migrating it.
- **The rest of the always-stop list:** production settings and secrets, deploying to production, going public.
- **A running strongest-tier job (#118):** never stop or restart one on your own call, or on a message that only might mean stop (`ask`, "A running job"). Let it finish.

## The weakening review (#103)

A pull request that changes the agents' rules, check code or the level (`AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `CLAUDE.local.md` and `GEMINI.md` at any depth, `.agents/`, `.claude/`, `.codex/`, `.github/`, `docs/stack.md`, in any case) gets no `needs-human` label on Full. It gets one more fresh review instead.

1. Start a fresh agent: *"Use the `pr-review` skill as the weakening review of pull request <n> at <sha>."* It reads only the diff and the issue, and answers one question: **does this weaken, skip or delete any check or rule?** For example, a removed or loosened test, a raised budget, a lint rule turned off, a hook removed, or an `eslint-disable` or `skip` with no issue number.
2. **No:** it comments exactly `Weakening review: pass @ <full head sha>` on the pull request, then removes and re-adds the no-op label `weakening-reviewed`. A comment starts no run; the label starts a fresh `agent-files` run on the head.
   The workflow (`agent-files.yml`) reads only comments from logins with write, maintain or admin access. A fail that is there when the guard decides beats every pass at that commit; a fail comment that was deleted, or edited to drop the fail line, no longer counts. A comment with both lines counts as a fail. On Full the `human-approved` label doesn't count at all: agents share the owner's login, so only a pass at the head does. On every level a writer's fail at the head refuses, whatever the labels say.
3. **Yes,** and the issue didn't ask for it: it comments `Weakening review: fail @ <sha>` with the lines, then removes and re-adds `weakening-reviewed`, so the check re-runs and goes red. The merge is refused on every level, and the findings go back to a builder.
4. A new commit needs a new pass.
5. **Before the merge,** `coordinate` runs `node .agents/skills/coordinate/scripts/agent-files.mjs verify-run <n> --repo <owner>/<repo> --head <sha>`, with the sha it will pass to `gh pr merge --match-head-commit`. It passes only when every `agent-files` check run on the head comes from `.github/workflows/agent-files.yml`, the latest one, on a `pull_request_target` event, succeeded, and the guard still passes on the live comments and labels. So a fail posted after the green run blocks the merge. A second workflow that reports a check named `agent-files` is refused. Exit 1: don't merge.

**Slice 0, and a repo upgrading from the old `ci.yml` job:** the guard's workflow runs only once it's on the default branch, so `setup-github.mjs` requires `agent-files` only after `.github/workflows/agent-files.yml` is there. The pull request that adds it merges on the other checks and this review. Right after it merges, `coordinate` runs `setup-github.mjs` again, which adds the requirement, and sends an FYI.

**Accepted risk (#103):** agents share the person's GitHub login, so the pass comment may come from that shared login. The guard can't tell a fresh review from the builder itself. The protection is the review being fresh and reading only the diff, so put the review session's link on the line after the verdict.

**Done when** the pass comment names the head commit and `verify-run` exits 0, or the fail comment is posted and no merge happened.
