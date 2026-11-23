# Cheat sheet

The whole workflow on one page.

## Starting a new app

1. **Pitch it.** Tell the AI your idea in your own words.
2. **Get grilled.** It asks three questions at a time, about the product only. No time limit, nothing skipped.
3. **Find the MVP.** The one core thing that makes the app stand out.
4. **Name it and make the repo.** The intermission.
5. **Tech grill.** Platform, stack, architecture, API, data, UI kit and infra. The AI recommends, you tweak. Research the crucial unknowns.
6. **Plan the pyramid.** Tracer-bullet slices stacked into passes. The core gets the most passes.
7. **Write the issues.** The strongest model writes them, each with checks, a fence, dependencies, priority, model, effort and skills.
8. **Start the loop.** Build → review → security review → merge, on repeat.
9. **Auto-test.** Merge deploys to test, and an agent tests it in a real browser.
10. **Try it yourself.** Your feedback becomes new issues.
11. **Level up.** A fast model builds the MVP, then stronger models make the core great.

## Joining an existing app

1. **Map it.** The AI reads the repo and writes a one-page map.
2. **Run it.** Install, build, test. Record the commands that work.
3. **Get grilled** on what the code can't tell you.
4. **Write it down.** A short `AGENTS.md` and a `docs/` folder.
5. **Then the same loop** from step 7 above.

## Every new session

1. **Read the state note.**
2. **Check what changed.**
3. **Ask who else is working on the repo.**
4. **Pick the work.**
5. **Update the state note** before you stop.

## The three commands to remember

| You say | It does |
|---|---|
| `new-project` | Idea → planned repo |
| `join-project` | Existing repo → understood and documented |
| `new-session` | Picks up where things left off |

In Claude Code, type `/new-project`. In Codex, type `$new-project`. Or just say it in plain words.
