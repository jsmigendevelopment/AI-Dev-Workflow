---
name: new-session
description: Primary skill. Use at the start of any new thread or session in a repo that already uses this workflow ("new session", "pick up where we left off", "what's going on", "start of day"). Reads the state note and the board, summarises what changed, checks for other coordinators, asks what to do today, offers to start the coordinator loop, and updates the state note when the session ends.
---

# New session: pick up where things left off

## Steps

1. **Read, don't guess.** Read `docs/state.md`, then skim `docs/mvp.md` and `docs/pyramid.md`. Open the other docs only if the work needs them.
   - No `docs/state.md`, but there's a `kickoff/` folder? A kickoff was paused before the repo existed. Read `kickoff/grill-log.md` and go back to `new-project` at the first stage its coverage map hasn't ticked.

2. **Check the board.** Use GitHub through the `gh` CLI or your tool's GitHub access:
   - what merged since `state.md` was last updated;
   - open PRs and their review status;
   - issues in progress, and who or what claimed them;
   - issues blocked, or labelled `needs-human`.

3. **Check for other coordinators.** Look for recently claimed issues, recently updated branches and open PRs you didn't start. Ask the person: *"Is anyone else, or any other coordinator, working on this repo right now or likely to start?"* Record the answer in `state.md`. If someone is, only take issues that are unclaimed, and claim each one before starting (see `coordinator`).

4. **Report in 5 lines or fewer:**
   - what changed since last time;
   - what's waiting on the person;
   - what's next by priority.

5. **Ask what we're doing.** Offer three options, with your pick first:
   - start the `coordinator` loop on the next ready issues;
   - work one issue in this session (then use `build-issue`);
   - something else (feedback on what merged, a new feature to grill, a bug).

   If the person is mid-grill (the `grill-log.md` coverage map isn't finished), recommend resuming the grill first.

6. **Turn feedback into issues.** If the person tries the app and gives feedback, write each point as an issue with `write-issues`. Don't fix things inline unless they're tiny.

7. **Before the session ends, update `docs/state.md`.** Overwrite it, keep it under 30 lines, and leave it so a brand-new session could take over.
