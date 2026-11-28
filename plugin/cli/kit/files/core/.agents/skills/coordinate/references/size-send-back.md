# Size first: the count, its record and the send-back (coordinate step 6.1.1)

`SKILL.md` step 6.1.1 runs `pr-size.mjs` on each head, before the clone, the checks and any review. This file holds the rest of that step. Exit 0 and exit 2 are in `SKILL.md`.

## The count and its record

- From your checkout of main: `node .agents/skills/coordinate/scripts/pr-size.mjs <n> --repo <owner>/<repo>`. Local mode: `pr-size.mjs --base main --head <sha>` from your checkout of main, before the review.
- **Record every count** (#427): add `--record issue=<issue> model=<model> effort=<effort> tool=<tool>`, last on the line, with your own session's model and effort (#380), to the pull request command.
- On every head it counts, pass or fail, the script writes the `job=size-check` record itself, in your checkout of main: the pull request, the head sha and the counted lines come from its count, and an exit 1 carries `outcome=fail send_back=size`. The weekly report buckets pull requests by that count. Never type the lines or write this record by hand.
- An exit 2 that says `Couldn't record the size` wrote nothing: fix what it names (a bad value, a missing writer) and run it again. Step 10 lands it.

## Exit 1: send it back

- Exit 1: no clone, no checks, no review and no `qa`.
- Comment `Sent back · <sha> · size: <count> counted lines, over 1,000` with the split brief on the pull request and on its issue (a comment on the issue; in local mode, under `## Comments` of its issue file), and give it to a fresh builder on the same branch: "Split this. Either file child issues through `issues`, each under 1,000, and narrow this pull request to the first; or, when the parts can't stand alone on main, stack it: pull requests of under 1,000 each, each based on the branch before it. Only a change that can't be split, like a mechanical rename, stays whole, with the `size-exception` label and a `Size exception: <reason>` line. Put `Split from #<n>` on each child issue."
- The send-back's record is the one the `--record` run wrote. Only when it still exits 2 with `Couldn't record the size` after an over-limit count (nothing was written) do you send it back anyway and write the record by hand, with your own session's model and effort (#380): `node .agents/skills/coordinate/scripts/insights.mjs write job job=size-check issue=<issue> pr=<n> sha=<sha> outcome=fail send_back=size model=<model> effort=<effort> tool=<tool>`. It holds no `lines`, so the weekly report keeps that pull request under `unknown`. Local mode writes its own, as `references/local-mode.md` step 3 says.

## The free send-back

- The first send-back is not a review round: it doesn't count toward the review cap.
- Before you call a send-back free, look for an earlier `Sent back · <sha> · size:` line on the issue, not only on this pull request, so a later pull request or a fresh coordinator session sees it was used.
- A child of a size split (its issue says `Split from #<n>`) gets no free send-back: its first head at 1,000 or more counts as a failed review round.
- A later head of the same issue still at 1,000 or more counts as a failed review round, so the review cap and its escalation below take over. Each new head runs this again.

**Done when** each head has its `job=size-check` record, and an over-limit head is back with a fresh builder and its split brief.
