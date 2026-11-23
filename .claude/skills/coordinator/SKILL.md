---
name: coordinator
description: Secondary skill. Use when the person says to start the loop, run the coordinator, or build the ready issues automatically - picks ready issues by priority, dependencies and conflicts, claims them, starts one fresh builder agent per issue with the routed model, watches for PRs every 5-10 minutes, sends each PR to an independent code reviewer then a security reviewer, merges through one queue, triggers browser tests on the test environment, and reports to the person.
---

# Coordinator: the automated build → review → merge loop

You don't write code. You dispatch, watch, merge and report. Stay fast and keep the person informed in short updates.

## The loop

Repeat until no issues are left, or the person says stop.

1. **Pick work.** From issues labelled `status:ready`:
   - skip anything whose dependencies aren't merged;
   - skip anything claimed by someone else;
   - order by priority, then by pass;
   - start as many as can run **without touching the same modules.** A decoupled issue can run beside anything, but two issues on one module can't run at once.

2. **Claim before starting.** Assign the issue, label it `status:in-progress`, and comment with who claimed it and when. Other coordinators or teammates may be working on the same repo, so check the claim again just before starting.

3. **Start one fresh builder per issue,** in its own branch and its own worktree or cloud session, using the model and effort from the issue's Routing table. Give it only:
   - the issue;
   - `AGENTS.md`;
   - the instruction to use `build-issue`.

   How you start agents depends on your tools: your tool's background or sub-agents with worktree isolation, a headless CLI run in a git worktree (`claude -p`, `codex exec`), or cloud sessions. Prefer cloud sessions to your own machine.

4. **Watch every 5–10 minutes** for new PRs, finished agents, failed agents, and issues that just became unblocked.

5. **Review.** For each new PR, start a **fresh** reviewer with `code-review`. It sees the diff and the issue, not the builder's chat.
   - **Rejected:** send the findings back to a builder, and the same issue goes again.
   - **Approved:** start a fresh security reviewer with `security-review`, at one effort step higher.
     - **Rejected:** back to a builder.
     - **Approved:** check the human gate.

6. **Human gate.** If the issue's gate or the risk dial says the person must look (for example, a schema change), label it `needs-human`, tell them, and move on to other work while you wait.

7. **Merge through one queue,** one PR at a time. If main has moved, merge main into the branch. Don't rebase or force-push a reviewed branch. Re-run the checks on that commit, then merge exactly that commit (`gh pr merge <n> --match-head-commit <sha>`). Never merge a PR whose checks ran on an older commit. If merging main in needed a conflict fixed, that's a code change, so it goes back to review.

8. **After the merge:** main auto-deploys to the test environment. Start a browser tester with `browser-test` on what changed. When it passes, tell the person it's ready to try. When it fails, open a bug issue.

9. **Update `docs/state.md`** and go back to step 1.

## Rules

- No agent edits code after it was approved. A fix means a new review. Both verdict comments must name the commit you're about to merge.
- One builder per issue, and every builder starts fresh.
- If an agent fails twice on the same issue, escalate the model one step (see `model-routing`) or label the issue `needs-human`.
- Report in short lines: what merged, what's in review, what's waiting on the person.
