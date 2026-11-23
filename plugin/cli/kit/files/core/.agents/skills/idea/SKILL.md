---
name: idea
description: Use when the person has an idea for a new app, product or tool ("I have an idea for an app", "new project", "let's build X", "start a new app"). Runs the whole kickoff in order - pitch, product grill by topic, the MVP, naming and repo, tech grill, the tracer-bullet pyramid, then issues - and hands off to the build loop.
---

# /idea: from idea to a planned repo

Run the steps in order. Don't write app code before step 8 unless the person says so. Save to files after every step, so a break or a new session loses nothing.

**Each step names the skill to open.** Open it before the step, even if you think you know what it says. If your tool doesn't load it by name, read `../<skill>/SKILL.md` from this folder.

## Steps

0. **Load the person's profile.** If `~/.ai-dev-workflow/profile.toml` exists and this project has no `docs/profile.toml`, copy it in (create `docs/`). If neither exists, offer once to make one from `templates/profile.toml`: *"Want a personal profile so I stop asking the same questions every app?"* Everything in the profile is a default you confirm, not a question you ask.
   - **Then ask the first question: the automation level** (see `automation`). Show this table first, and say in one line each how it differs from the risk dial (asked later, in the tech grill): *the automation level is how much agents do without you; the risk dial is how careful each merge is.*

   | Level | Agents do | You do |
   |---|---|---|
   | **Recommended** (default) | Run the loop. Build, review and merge small and normal changes. Deploy to test. | Approve risky changes and schema changes. Answer batched questions. Try the app. |
   | **Full automation** | Everything, risky changes too, plus overnight. Never the always-stop list. | Answer blockers only. |
   | **Hands-on** | Plan, write issues, build one issue when you ask. | Open and merge every pull request. |
   | **Custom** | You set each switch. | |

   - The profile's `[defaults] automation` is the suggested pick. Write the answer to `kickoff/decisions.md`. `stack` copies it into the "Automation level" section of `docs/stack.md` in step 5.

1. **Listen to the pitch.** Ask the person to describe the idea in their own words: what it is, who it's for, and any features they already have in mind. Don't interrupt yet. Then play it back in 3–5 lines and give your honest first take: what's strong, what's unclear, what's risky. Don't flatter.

2. **Product grill.** Open `grill` and run its product topics. Until the repo exists, the notes live in a local `kickoff/` folder: `grill-log.md`, `decisions.md`, `features.md` and `vision.md`, each started from this skill's `templates/`.
   - If the person needs a break, save and stop. `/back` resumes from the grill log.

3. **Find the MVP.** This is the last topic of the grill: **the one core piece that makes this app stand out,** made as good as possible, plus only the thin supporting slices it needs. **The core is never filled in with a default.** If the person won't choose, stop here and say so. Write `kickoff/mvp.md` from `templates/mvp.md`.

4. **Intermission: name it and make the repo.** Open `name`. It runs `git init`, sets up GitHub if the person wants it, and moves `kickoff/` into `docs/`.

5. **Tech grill.** Open `stack`: platform, stack, architecture, API, data, UI kit, auth, environments, CI and the risk dial, plus the automation level from step 0. It's short. Crucial unknowns go to `research` first. It writes `docs/stack.md`, `docs/architecture.md` and `docs/security-policy.md`.

6. **Fill in the project facts** at the bottom of `AGENTS.md`.

7. **Plan the build.** This is CTO work: the strongest model, high effort (see `routing`). Open `pyramid`. It plans slice 0 (the skeleton), the passes and the milestones, and calls for the schema, API and wireframe design. It writes `docs/pyramid.md` and `docs/design.md`.
   - If you're not on the strongest model, stop. Update `docs/state.md` and tell the person: "Start a new session on your strongest model and type `/back` to plan the build."

8. **Write the issues.** Everyday model, medium effort. Open `issues`.

9. **Hand off.** Write `docs/state.md` from `templates/state.md`. Then tell the person, in under 10 lines:
   - what's planned;
   - which issue goes first;
   - whether to start the build loop now (`coordinate`) or build one issue at a time.

## Done when

- `docs/` holds the vision, features, MVP, decisions, stack, architecture, security policy, design, pyramid and state.
- Every MVP issue has acceptance checks, a fence, dependencies, risk flags, a lane, a priority and a `Skills:` line.
- The person has seen the plan and said go.
