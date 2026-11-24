# Local mode: the loop without the GitHub API

The loop runs the same steps. Only where it reads and writes changes. Use it when:

- **no GitHub remote:** `git remote get-url origin` fails, or doesn't point at GitHub;
- **the API is rate-limited:** `gh api rate_limit` shows `resources.core.remaining` at 0. Its `reset` is when you switch back.

Say which one, once, in your report: *"Local mode: no GitHub remote."* or *"Local mode until 14:05 UTC: GitHub's API limit."*

## No GitHub remote

1. **Issues are files:** `docs/issues/*.md`. Each has a status line under its title:

   ```text
   Status: ready | in-progress | blocked | done
   ```

   No `Status:` line? Add `Status: ready` under the title. Other labels (`needs-human`, `blocker`, `gate`) go on a `Labels:` line. Comments go at the end, under `## Comments`, one per line, newest last.
2. **Pick and claim** as in steps 2 and 3, from the files. Claim: `Status: in-progress · claimed by <session> at <time>`. Dependencies are merged when their file says `Status: done`.
3. **Branches and worktrees are local.** Each builder gets `feat/<n>-<short-name>` in its own `git worktree add ../<repo>-<n> -b feat/<n>-<short-name> main`. Its brief says: "Local mode: no pull request. Commit on your branch and report the head commit."
   - **No way to start a fresh agent?** Build the issues yourself, one at a time, with the `build` skill. Each one still goes to a fresh reviewer before it merges. No fresh reviewer either? Leave it `in-progress · waiting for review`, and start the next ready issue.
4. **Review from the diff.** The reviewer reads `git diff main...feat/<n>-<short-name>` and the issue file, never your summary. It writes its verdict, with the commit, under `## Comments`: `Review · <sha> · approve` or `Review · <sha> · changes: <list>`.
5. **Run the checks on the exact commit.** In the branch's worktree, `git rev-parse HEAD` must equal the reviewed sha. Run `check` there. Red? Back to a fresh builder, as in step 6.
6. **Merge locally,** through one queue: `git switch main && git merge --no-ff feat/<n>-<short-name> -m "#<n> <title>"`. Then run `check` on main. Red? Revert the merge with `git revert -m 1 HEAD` and open a bug issue file.
7. **Record it:** `Status: done` in the issue file, a "To try" line in `docs/state.md`, and a board event. Commit those on main: `#<n> loop: done`. Then `git worktree remove` the builder's worktree.
8. **A remote appears?** Leave local mode. The first push of main to the new, empty repo is the `name` skill's setup step. Then move the open issue files to GitHub (`issues`, "No GitHub yet?"), and every later change goes through a pull request.

The always-stop list and the human gates still apply. A gate the person owns waits on a `needs-human` line in the issue file and "Waiting on you" in `docs/state.md`.

## Rate-limited, with a GitHub remote

The issues stay on GitHub. Git pushes and pulls don't count against the limit, so building and pushing go on.

1. **Work from the last sweep's lists.** Keep the JSON of each sweep's `gh issue list` and `gh pr list` next to the board (`board.mjs path`, then `<project>-issues.json` and `<project>-prs.json`). Pick ready issues from it. Start no issue the cache shows as claimed by someone else.
2. **Builders build and push** their branches as usual: `git push origin feat/<n>-<short-name>`.
3. **Reviews run from `git diff origin/main...origin/feat/<n>-<short-name>`.** The verdict waits in the queue below.
4. **Never merge locally** here. A local merge would reach GitHub only as a push to main. The merge waits in the queue.
5. **Queue every API-only action** (open a pull request, comment, label, claim, merge) in `<project>-queue.md`, next to the board, one line each, oldest first:

   ```text
   2026-11-24T13:12Z · pr-open · feat/14-share-link · title="#14 Share link" · body-file=/tmp/pr-14.md
   2026-11-24T13:40Z · comment · #14 · body-file=/tmp/review-14.md
   2026-11-24T13:41Z · merge · feat/14-share-link · sha=3f2a9c1
   ```

   In a cloud session the folder vanishes with the container. Copy the queue under "Queued for GitHub" in `docs/state.md` too.
6. **At the reset, replay** the queue in order. Before each line, check it isn't done already (the pull request exists, the comment is there). A merge still uses `--match-head-commit <sha>` and passes step 6's checks first. Delete each line once it's done. Then leave local mode.

**Done when** each sweep has run from the files or the cache, and the queue is empty or waiting for its reset.
