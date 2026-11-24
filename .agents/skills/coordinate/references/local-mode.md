# Local mode: the loop without the GitHub API

The loop runs the same steps. Only where it reads and writes changes. Pick the case:

| Case | When | Issues | Merges |
|---|---|---|---|
| **No remote** | `git remote` prints nothing | files in `docs/issues/` | locally, on main |
| **Push, no API: another host** | a remote that isn't GitHub | files in `docs/issues/` | wait for the person |
| **Push, no API: rate-limited** | GitHub's `resources.core` or `resources.graphql` `remaining` is 0, or a `gh` call failed with a rate-limit 403 or 429 | on GitHub, from the last sweep's cache | queued, replayed at the reset |

Rate-limited ends at the later of the two `reset` times in `gh api rate_limit`. Say the case once in your report: *"Local mode: no remote."* or *"Local mode until 14:05 UTC: GitHub's API limit."*

## Every case

1. **Issue files** (no remote, another host). Each `docs/issues/*.md` has a status line under its title:

   ```text
   Status: ready | in-progress | blocked | done
   ```

   No `Status:` line? Add `Status: ready` under the title. Other labels (`needs-human`, `blocker`, `gate`) go on a `Labels:` line. Comments go at the end, under `## Comments`, one per line, newest last. Claim: `Status: in-progress · claimed by <session> at <time>`. A dependency is merged when its file says `Status: done`.
2. **Branches and worktrees.** Each builder gets `feat/<n>-<short-name>` in its own `git worktree add ../<repo>-<n> -b feat/<n>-<short-name> main`. Its brief adds: "Local mode: no pull request. Commit on your branch, push it if there's a remote, and report the head commit."
   - **No way to start a fresh agent?** Build the issues yourself, one at a time, with the `build` skill. Each one still goes to a fresh reviewer before it merges. No fresh reviewer either? Leave it `in-progress · waiting for review`, and start the next ready issue.
3. **Review from the diff.** The reviewer reads `git diff main...<sha>` and the issue, never your summary. Its verdict names the commit: `Review · <sha> · approve` or `Review · <sha> · changes: <list>`. It goes under `## Comments` in the issue file, or into the queue when the issues are on GitHub.
4. **Check the exact commit.** In the branch's worktree, `git rev-parse HEAD` must equal the reviewed sha. `check` stands in for CI. `test:e2e` on that commit, against a local dev server on a free port, stands in for the acceptance check on the preview (step 6.3). Red? Back to a fresh builder, as in step 6.

## No remote

5. **Merge the reviewed commit,** through one queue: `git switch main && git merge --no-ff <sha> -m "#<n> <title>"`. Never merge by branch name: the branch may have moved since the review.
6. **Smoke-test main** in place of the test site (step 8): run `check`, restart your dev server on main, and open the try line's page. Red? `git revert -m 1 HEAD`, and open a bug issue file.
7. **Record it:** `Status: done` in the issue file, a "To try" line in `docs/state.md` with the local link, and a board event. Commit those on main: `#<n> loop: done`. Then `git worktree remove` the builder's worktree.
8. **A remote appears?** Leave this case. The first push of main to the new, empty repo is the `name` skill's setup step. Then move the open issue files to GitHub (`issues`, "No GitHub yet?"), and every later change goes through a pull request.

## Push, no API

Git pushes and pulls work, and don't count against GitHub's limit. So builders build and push as usual.

5. **Never merge locally, and never push main.** A local merge could only reach the remote as a push to main.
6. **Queue every API-only action** (open a pull request, comment, label, claim, merge) in `<project>-queue.md`, next to the board (`board.mjs path`), one line each, oldest first:

   ```text
   2026-11-24T13:12Z · pr-open · feat/14-share-link · title="#14 Share link" · body-file=/tmp/pr-14.md
   2026-11-24T13:40Z · comment · #14 · body-file=/tmp/review-14.md
   2026-11-24T13:41Z · merge · feat/14-share-link · sha=3f2a9c1
   ```

   In a cloud session the folder vanishes with the container. Copy the queue under "Queued for GitHub" in `docs/state.md` too.
7. **Rate-limited:** work from the last sweep's lists. Keep each sweep's `gh issue list` and `gh pr list` JSON next to the board, as `<project>-issues.json` and `<project>-prs.json`. Start no issue it shows as claimed by someone else. **At the reset, replay** the queue in order. Before each line, check it isn't done already (the pull request exists, the comment is there). A merge still uses `--match-head-commit <sha>`, after CI passes on that commit. Delete each line once it's done. Then leave local mode.
8. **Another host:** the kit drives only GitHub's API, so nothing replays the queue. Each sweep, send the new lines to the person as one ⏳ decision through `ask`: the pull requests to open and the reviewed commits to merge, with their shas.

The always-stop list and the human gates apply in every case. A gate the person owns waits on a `needs-human` line in the issue and "Waiting on you" in `docs/state.md`.

**Done when** each sweep has run from the files or the cache, and the queue is empty, waiting for its reset, or sent to the person.
