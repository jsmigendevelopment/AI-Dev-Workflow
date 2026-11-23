---
name: back
description: Use when the person starts or returns to work in a repo that uses this workflow ("I'm back", "back", "good morning", "start of day", "new session", "pick up where we left off", "what's going on", "what happened overnight") - in a fresh thread or an old one. Rebuilds the picture from the repo and GitHub, reports what changed since /afk sized to the time away, checks who else is working, resumes a paused kickoff, and asks how to triage.
---

# /back: pick up where things left off

Works the same in a brand-new thread or one that's been running all night. **Rebuild from the repo, not from memory.** A long or compacted thread forgets rules and details.

## Steps

0. **Mark yourself here.** Run `node .agents/skills/afk/scripts/worklog.mjs presence back`. It prints JSON. **Only if `justReturned` is true** (they're back from an `/afk` and no other thread has said so yet), tell the other threads, using your tool's way to list and message the other sessions running on this machine (in Claude Code: `ListAgents`, then `SendMessage` to each one). Skip any that can't be reached, and don't wait for replies. Cloud threads only get it if they're connected to this machine: *"<person> is back. Return to normal rules: ask instead of parking."* Then run `worklog.mjs presence announced`. A `/back` without an `/afk` before it tells nobody. To answer "how many hours did I work", run `worklog.mjs report` (add `--days 30` or `--all`). If the profile sets `[worklog] sheet` and you have the Google Sheets connector, copy the new entries to that sheet: run `worklog.mjs pending`, append each line as a row (time, project, event, machine, branch, note), then run `worklog.mjs pending --mark`. This is how cloud sessions keep their hours, because their local log disappears with the container.

1. **Read the board first.** Run `node .agents/skills/coordinate/scripts/board.mjs render --print`. It shows what needs the person, what's being built and in review, what merged today, and the FYIs, from every thread on this machine. If the profile sets `[board] sheet` and you have the Google Sheets connector, rewrite the project's tab once (see `../coordinate/board.md`). No sheet set and you have the connector? Offer one, once.

2. **Read the state.** Read `docs/state.md`, and if it exists, the `/afk` section in it: when the person left, the commit on main, the queue and the rules set.
   - No `docs/state.md`, but there's a `kickoff/` folder? A kickoff paused before the repo existed. Read `kickoff/grill-log.md` and resume `/idea` at the first topic its coverage map hasn't ticked.

3. **Check GitHub** with `gh` or your tool's GitHub access:
   - what merged since then;
   - open pull requests and their verdict comments;
   - claimed issues, and any stale claims (over 2 hours with no new commits);
   - issues labelled `needs-human`;
   - whether main's checks are green.

4. **Who else is working?** Look for claims and branches from sessions that weren't yours, then ask: *"Is anyone else, or any other agent, working on this repo right now?"* Record the answer in `state.md`.

5. **Usage.** If the person uses Claude Code, check what's left (see "Checking usage" in `afk`) and report the percentage used and when it resets.

6. **Report, sized to the time away.** After a short break, 3 lines. After a night, at most 10 lines: counts plus the top three in each, with links to the rest.
   - **Merged:** split into *checked and passed*, *checked and failed*, and *not checked yet*, with test links.
   - **Failed or parked,** and why.
   - **Waiting on you,** most important first: 🛑 blockers, then ⏳ decisions, each with its recommended answer, from the board and the "Waiting on you" list in `docs/state.md`. Then run `node .claude/hooks/notify.mjs --clear`, so held pings don't fire now that they've been seen.
   - **FYI:** ready to try, usage, rate limits.
   - **Usage** used, and when it resets.
   - **Still running.**
   - **Anyone else** who touched the repo.

7. **Triage.** Offer three options with your pick first:
   - try the three riskiest merges first (usually the right pick);
   - clear the `needs-human` list;
   - start or keep running `coordinate`.

   On full automation and the app now has real users? Suggest switching to Recommended (the `automation` skill).

8. **Feedback becomes issues.** As the person tries things, open `issues` and write one issue per point. Don't fix things inline unless they're tiny.

9. **Before the session ends,** update `docs/state.md`. Overwrite it, keep it under 30 lines, and leave it so a brand-new session could take over.
