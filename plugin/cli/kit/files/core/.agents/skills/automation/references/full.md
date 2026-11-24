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

A pull request that changes the agents' rules or check code (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/`, `.github/`) gets no `needs-human` label on Full. It gets one more fresh review instead.

1. Start a fresh agent: *"Use the `pr-review` skill as the weakening review of pull request <n> at <sha>."* It reads only the diff and the issue, and answers one question: **does this weaken, skip or delete any check or rule?** For example, a removed or loosened test, a raised budget, a lint rule turned off, a hook removed, or an `eslint-disable` or `skip` with no issue number.
2. **No:** it comments exactly `Weakening review: pass @ <full head sha>` on the pull request. Then re-run the failed `agent-files` job (`gh run rerun <run id> --failed`). The job passes on that comment at the head commit.
3. **Yes,** and the issue didn't ask for it: it comments `Weakening review: fail @ <sha>` with the lines. The merge is refused on every level, and the findings go back to a builder.
4. A new commit needs a new pass.

**Done when** the pass comment names the head commit and the `agent-files` job is green, or the fail comment is posted and no merge happened.
