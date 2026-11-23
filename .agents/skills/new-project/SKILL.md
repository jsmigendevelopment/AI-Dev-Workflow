---
name: new-project
description: Primary skill. Use when the person wants to start a brand-new app, product or tool from an idea ("I have an idea", "new project", "let's build X"). Runs the whole kickoff in order - vision pitch, product grill, MVP, naming and repo setup, tech grill, tracer-bullet pyramid, milestones and issues - and hands off to the coordinator.
---

# New project: from idea to a planned, ready-to-build repo

Run these steps in order. Don't skip one, and don't start building before step 7 unless the person says so. Save to files after every step so the work survives a break or a new session.

## Steps

1. **Listen to the pitch.** Ask the person to describe the idea in their own words: what it is, who it's for, and any features they already have in mind. Don't interrupt with questions yet. Then play it back in 3–5 lines and give your honest first take: what's strong, what's unclear, what's risky. Don't flatter.

2. **Product grill.** Use the `grill` skill, product stages only. This is the longest part of the kickoff, and it has **no time cap.** It ends when you run out of questions, not when the person gets tired. If they need a break, save and stop. `new-session` picks it up later.
   - Until the repo exists, keep the notes in a local `kickoff/` folder, one file per template: `grill-log.md`, `decisions.md`, `features.md` and `vision.md`.

3. **Find the MVP.** Still inside the grill: agree on **the one core piece that makes this app stand out.** The MVP is that piece made as good as possible, plus only the thin supporting slices it needs. It is not the whole app. Write it to `kickoff/mvp.md` using `templates/mvp.md`.

4. **Intermission: name it and make the repo.** Use the `name-the-app` skill. Its last step moves everything from `kickoff/` into `docs/`. After it, `docs/` holds:
   - `docs/vision.md`
   - `docs/features.md`
   - `docs/mvp.md`
   - `docs/decisions.md`
   - `docs/grill-log.md`

5. **Tech grill.** Use the `tech-grill` skill: platform, stack, architecture, API pattern, data, UI kit, auth, infrastructure, testing and the risk dial. Recommend a pick for each, with alternatives, and let the person tweak. This part is short. Any crucial unknown goes to `deep-research` before it's decided. Write the results to `docs/stack.md` and `docs/architecture.md`.

6. **Copy in the kit.** Make sure the repo has this kit's `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/skills/` and `.github/ISSUE_TEMPLATE/`. Fill in the "Project facts" section of `AGENTS.md`.

7. **Plan the pyramid.** Use the `tracer-bullet-pyramid` skill. Write `docs/pyramid.md`.

8. **Write the issues.** Use the `write-issues` skill to create milestones and issues on GitHub. Route each issue with the `model-routing` skill. This step goes to the strongest planning model the person has (see `model-routing`).

9. **Hand off.** Write `docs/state.md` using `templates/state.md`. Then tell the person, in under 10 lines:
   - what's planned;
   - which issue goes first;
   - whether they want to start the `coordinator` loop now or build issue by issue.

## Done when

- `docs/` holds the vision, features, MVP, decisions, stack, architecture, pyramid and state.
- Every MVP issue on GitHub has a finish line, a fence, dependencies, a priority, a model, an effort and a `Skills:` line.
- The person has seen the plan and said go.
