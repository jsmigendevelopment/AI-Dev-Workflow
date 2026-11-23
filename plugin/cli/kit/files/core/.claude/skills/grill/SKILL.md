---
name: grill
description: Use when the person asks to be grilled or interviewed about what to build ("grill me", "ask me questions", "help me figure out what this should do"), for the product interview inside /idea or /join, or before any feature big enough to need a spec. Asks three questions a round by topic, each with a recommended answer, logs every answer, and never skips the decisions people forget.
---

# Grill: get on the same page before anything is built

AI fills every gap with a guess. The grill finds the gaps first. A missed decision costs far more later than a question costs now.

## How to ask

- **Three questions per round,** numbered. Under each one, put **Recommended:** with your best answer and a one-line reason, so the person can reply "yes, yes, change 3 to X."
  - Exception: on **taste, scope and money**, ask the open question first. Mark it *(open, no suggestion yet)*, and offer your recommendation only after they answer. A default shown first steers people.
- **Their ideas first.** Ask "what else should it do?", then ask about their answers. Offer your own ideas only when they stall or ask, and make them different from what's already listed. Mark them as yours in `features.md`.
- **Plain words first, term second.** For example: "Should people see each other's lists, or only their own? (That's called access control.)"
- **Confirm with a choice, never "is that right?"** For example: "Do you mean anyone with the link can see it, or only people you invite?" Or show a filled-in example and ask what's wrong with it.
- **No flattery.** If part of the idea is weak, say so and say why.

## Profile and presets

- **Profile:** if `docs/profile.toml` exists, its answers are defaults. Confirm them in one round ("Your profile says private repo, move-fast, Clerk, Cloudflare. Keep all?") instead of asking each one.
- **Preset:** in the first topic, ask which preset the idea is closest to (see `presets/README.md` in the `idea` skill), with your pick first. The profile's `preset` is the default. Load it, confirm its "Preloaded" answers in one round, and ask its "Still ask" questions in the right topics.
- What the person says always beats the profile and the preset.

## Topics and budgets

Work topic by topic. **Each topic has a soft budget of about 10 questions:** fewer if answers come fast, a few more if the topic is the heart of the app. **Move on early** after three rounds with nothing new, or two "don't know" answers in a row. When the person doesn't know, record a mainstream default as an assumption.

**End every topic with a 3-line summary** the person can correct, then tick it on the coverage map.

### Product topics (`/idea`)

1. **Who and why:** users, the problem, what they do today, what success looks like.
2. **The main flow:** one user's whole journey, step by step.
3. **Features:** the person's ideas, questions on each, then yours if they stall. Sort each into must, later or not now.
4. **The floor:** every item on the floor checklist in `features.md` gets an answer or a recorded default. Never skipped.
5. **The MVP:** the one core piece. Push for one. If they name five, ask which one they'd keep if they could keep only one. **The core is never defaulted.**
6. **Confirm:** show back the vision, the main flow, the features and the MVP, and ask what's wrong with them.

### Existing-project topics (`/join`, or a big feature)

1. The goal: what change, and why now.
2. Who and what it touches: users, modules, data.
3. What must not break.
4. Conventions: which ones to follow, and which to fix.
5. The finish line: how you'll both know it works.
6. Confirm.

## Keep the record

- The files live in `kickoff/` until the project has a repo, and in `docs/` after that. Start each from the templates in the `idea` skill's `templates/` folder.
- After every round, append the questions, your recommendations and the answers to `grill-log.md`, in the person's own words where it matters.
- Write each decision to `decisions.md` the moment it's made, with who originated it: the person, the AI, or a default.
- Keep the coverage map at the top of `grill-log.md` current. A new session resumes from it.

## When you hit an unknown

If neither of you knows the best answer, and the decision is crucial and expensive to undo, log it as an open question and use `research`. Smaller unknowns get three options with trade-offs and a recommendation.

## Done when

Every topic is ticked and summarised, every floor item is answered, and the MVP's core was chosen by the person.
