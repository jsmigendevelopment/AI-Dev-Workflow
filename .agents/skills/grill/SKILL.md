---
name: grill
description: Secondary skill. Use to interview the person until you both agree on what to build ("grill me", "ask me questions", the product interview inside new-project or join-project, or before any feature big enough to need a spec). Asks three questions a round, each with a recommended answer, works through staged topics with a coverage map, never skips the decisions people forget, and logs every answer to a file.
---

# Grill: get on the same page before anything is built

AI fills every gap with a guess. The grill finds the gaps first. It can take 30 minutes or two hours, and that's fine. A missed decision costs far more later.

## How to ask

- **Three questions per round.** Number them. Under each one put **Recommended:** with your best answer and a one-line reason, so the person can reply "yes, yes, change 3 to X."
  - Exception: on **taste, scope and money**, ask the open question first and offer your recommendation only after they answer. A default shown first steers people.
- **Their ideas first.** Ask "what else should it do?", then ask about their answers. Offer your own ideas only when they stall or ask, and give a few that differ from what's already listed. Mark them as yours in `features.md`.
- **Plain words first, term second.** For example: "Should people see each other's lists, or only their own? (That's called access control.)"
- **Confirm with a choice, never "is that right?"** For example: "Do you mean anyone with the link can see it, or only people you invite?" Or show a filled-in example and ask what's wrong with it.
- **No flattery.** If part of the idea is weak, say so and say why.

## Keep the record

- The three files below live in `kickoff/` until the project has a repo, and in `docs/` after that. Start each from its template in the `new-project` skill's `templates/` folder.
- After every round, append the questions, your recommendations and the answers to `grill-log.md`, using the person's own words where it matters.
- Write each decision to `decisions.md` the moment it's made, noting who originated it: the person, you, or a default.
- Keep the **coverage map** at the top of `grill-log.md` up to date. If the session stops, the next one resumes from the map.

## Stages: new project

Work through them in order. **Move on** after three rounds with nothing new, or two "don't know" answers in a row. When the person doesn't know, record a mainstream default as an assumption.

1. **Who and why:** users, the problem, what they do today, and what success looks like.
2. **The main flow:** walk through one user's whole journey, step by step.
3. **Features:** the person's ideas, questions on each, then your ideas if they stall. Sort each into must, later or not now.
4. **The floor** (never skipped): every item in the floor checklist in `features.md` gets an answer or a recorded default.
5. **The MVP:** the one core piece that makes the app stand out. Push for one. If they name five, ask which one they'd keep if they could keep only one.
6. **Confirm:** show back the vision, the main flow, the feature list and the MVP. Ask what's wrong with them, not whether they're right.

Then the `name-the-app` intermission, then the `tech-grill`.

## Stages: existing project or a big feature

1. **The goal:** what change, and why now.
2. **Who and what it touches:** users, modules, data.
3. **What must not break.**
4. **Conventions:** which existing patterns to follow, and which ones the person wants fixed instead.
5. **Finish line:** how you'll both know it works.
6. **Confirm.**

## When you hit an unknown

If neither of you knows the best answer, and the decision is crucial or expensive to undo, don't guess. Log it as an open question and suggest `deep-research`. Smaller unknowns get three options with trade-offs and a recommendation.

## Done when

Every stage is ticked, every floor item is answered, and you have no questions left. That means *you* ran out of questions, not that the person ran out of patience. If they need a break, save and stop. Resume later from the coverage map.
