---
name: back
description: Use when the person starts or returns to work in a repo that uses this workflow ("I'm back", "back", "good morning", "start of day", "new session", "pick up where we left off", "what's going on", "what happened overnight") - in a fresh thread or an old one. Rebuilds the picture from the repo and GitHub, reports what changed since /afk sized to the time away, checks who else is working, resumes a paused kickoff, and asks how to triage.
---

# /back: pick up where things left off

Works the same in a brand-new thread or one that's been running all night. **Rebuild from the repo, not from memory.** A long or compacted thread forgets rules and details.

## Steps

1. **Read the state.** Read `docs/state.md`, and if it exists, the `/afk` section in it: when the person left, the commit on main, the queue and the rules set.
   - No `docs/state.md`, but there's a `kickoff/` folder? A kickoff paused before the repo existed. Read `kickoff/grill-log.md` and resume `/idea` at the first topic its coverage map hasn't ticked.

2. **Check the board** with `gh` or your tool's GitHub access:
   - what merged since then;
   - open pull requests and their verdict comments;
   - claimed issues, and any stale claims (over 2 hours with no new commits);
   - issues labelled `needs-human`;
   - whether main's checks are green.

3. **Who else is working?** Look for claims and branches from sessions that weren't yours, then ask: *"Is anyone else, or any other agent, working on this repo right now?"* Record the answer in `state.md`.

4. **Usage.** If the person uses Claude Code, check what's left (see "Checking usage" in `afk`) and report the percentage used and when it resets.

5. **Report, sized to the time away.** After a short break, 3 lines. After a night, at most 10 lines: counts plus the top three in each, with links to the rest.
   - **Merged:** split into *checked and passed*, *checked and failed*, and *not checked yet*, with test links.
   - **Failed or parked,** and why.
   - **Waiting on you,** most important first.
   - **Usage** used, and when it resets.
   - **Still running.**
   - **Anyone else** who touched the repo.

6. **Triage.** Offer three options with your pick first:
   - try the three riskiest merges first (usually the right pick);
   - clear the `needs-human` list;
   - start or keep running `coordinate`.

7. **Feedback becomes issues.** As the person tries things, open `issues` and write one issue per point. Don't fix things inline unless they're tiny.

8. **Before the session ends,** update `docs/state.md`. Overwrite it, keep it under 30 lines, and leave it so a brand-new session could take over.
