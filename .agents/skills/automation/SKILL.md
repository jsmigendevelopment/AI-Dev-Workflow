---
name: automation
description: Use when the person wants to change how much the agents do on their own ("/automation", "switch to recommended", "go full auto", "hands-on mode", "stop merging without me", "let the agents merge", "turn off the overnight loop") - shows the four levels in one short table, asks which one, sets the custom switches for the loop, merges per lane, pull requests, overnight runs and the ping level, and writes the choice to docs/stack.md.
---

# Automation: how much the agents do on their own

Two separate dials. Explain both in one sentence each when you ask:

- **The automation level** says how much agents do without you: run the loop, open pull requests, merge, keep going overnight.
- **The risk dial** says how careful each merge is: which changes you must read first (schema, API, every merge).

When the two disagree, the more careful one wins. Full automation with a careful dial still waits for you on schema changes.

## The four levels

| Level | Agents do | You do |
|---|---|---|
| **Recommended** (default) | Run the loop. Build, review and merge the tiny and normal lanes. Deploy to test. | Approve the risky lane and schema changes. Answer batched decisions. Try the app. |
| **Full automation** | Everything, the risky lane included, plus the overnight loop. Never the always-stop list. | Answer blockers only. |
| **Hands-on** | Plan, write issues, and build one issue when you ask. Never open or merge pull requests unless you say so. | Open and merge pull requests. |
| **Custom** | Whatever the switches say. | |

## The switches

| Switch | Recommended | Full | Hands-on |
|---|---|---|---|
| Loop | on | on | off |
| Merges, tiny lane | agents | agents | person |
| Merges, normal lane | agents | agents | person |
| Merges, risky lane | person | agents | person |
| Opens pull requests | agents | agents | person |
| Overnight loop | off (`/afk` offers it) | on | off |
| Ping level | decisions | blockers | decisions |

Ping levels: **decisions** pings blockers at once and batches decisions. **blockers** pings only blockers. **critical** pings only for production down or a live security hole. The `ask` skill has the details.

## Steps

1. **Read the current level** from "Automation level" in `docs/stack.md`. No section yet? The default is `[defaults] automation` in the profile, else Recommended.
2. **Show the four-level table,** then ask which one, with your pick first. Recommend:
   - **Recommended** for most apps;
   - **Hands-on** if the person wants to learn the code or review everything;
   - **Full** only for a side project with no real users.
3. **Custom?** Ask the switches three at a time, each with the Recommended value as the suggestion.
4. **Write it** to the "Automation level" section of `docs/stack.md` (the section is in `templates/stack.md` of the `idea` skill). Fill in every switch, even for a named level. Add a line to `docs/decisions.md`. Commit it through a pull request like any change.
5. **Tell the loop.** The coordinator reads `docs/stack.md` on every sweep, so nothing else is needed. Say what changes from now on, in two lines.

## When to suggest a switch

- **Full → Recommended once real users arrive,** or when the risk dial moves to careful. Say it at `/back` and when an issue first touches real user data.
- **Hands-on → Recommended** when the person says they're tired of merging by hand.
- Never switch on your own. Suggest it, and let the person say yes.

## Who reads it

| Skill | Uses it for |
|---|---|
| `coordinate` | Whether the loop runs, who merges each lane, and whether it opens pull requests. |
| `build` | Whether to open the pull request or stop at a pushed branch. |
| `pr-review` | Whether the verdict says the person must look before merge. |
| `issues` | Writing who merges into each issue's lane. |
| `afk` | Whether the loop keeps going overnight. |
| `notify.mjs` (via `ask`) | The ping level. |
