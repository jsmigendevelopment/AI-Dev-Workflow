---
name: pyramid
description: Use when planning how to build an app or a big feature ("plan the build", "break this into milestones", "how should we slice this") - the CTO step. Plans slice 0 (the skeleton with CI and a test deploy), cuts the MVP into vertical tracer-bullet slices, stacks them into passes where pass 1 is wide and thin and each higher pass is narrower and deeper, designs the schema and API from the approved wireframes, and writes the milestone plan.
---

# Pyramid: see it working early, then make it great

This is CTO work. Run it on the strongest model at high effort (see `routing`). It plans and designs. It doesn't redraw screens; `wireframes` did, and the person approved them. It doesn't write issues; `issues` does that next on a cheaper model.

## Why

The old way builds in layers: the whole schema, then the whole API, then the whole UI, and you see nothing until the end. **Tracer bullets** cut thin **vertical slices.** Each one goes all the way through (schema → API → UI), so after the first one you can use something real and steer.

The MVP is not one slice and not one pass, so the slices **stack:**

```
pass 3                  ████                 narrowest · hardest · most polished
pass 2           ████   ████   ████
pass 1    ████   ████   ████   ████   ████   widest · simplest · thin end-to-end
          sup.   sup.   CORE   sup.   sup.
```

- **Pass 1** is a thin, working tracer bullet through *every* MVP slice.
- **Each pass up** covers fewer slices and goes deeper.
- **The core slice is the tallest column.** It gets the most passes and the most effort.
- Supporting slices stop as soon as they're good enough to serve the core.

## Steps

1. **Slice 0, the skeleton.** Before any feature:
   - If there's a stack pack for the chosen stack (a `stack-<name>` skill), open it and apply it. For the default web stack that's `stack-tanstack-start`. Otherwise set up the same things by hand.
   - The app runs, and every command in the check contract works.
   - Lint enforces the code rules a tool can check (see `AGENTS.md`), and there's a generator that makes a new module from the example one. Write its command in "Commands that work here" in `AGENTS.md`.
   - CI runs on every pull request: checks, secret scan and agent-file guard (start from `templates/ci.yml` in the `idea` skill), plus the issue-link check from the stack pack.
   - **Set up in the skeleton** (see `guide/app-conventions.md` in the kit): the error system with request IDs and structured logs, a health endpoint, `/api/v1`, UTC times and money in cents, the ID strategy and standard columns, the audit log, feature flags, `object_action` event names, breakpoints and a type scale in the tokens, per-module `copy.ts`, and generators for module, route, section and component. A stack pack should ship these. Without one, build them by hand.
   - Main deploys to test, and there's a preview per pull request if the host offers one. Record the test URL in `AGENTS.md`.
   - Open `secrets` and wire every key the stack needs.
   - **Set up GitHub for the person:**
     1. If `gh auth status` fails, ask them to run `gh auth login` and wait.
     2. Run `node .agents/skills/name/scripts/setup-github.mjs --dry-run` and show them the list.
     3. Say in one line what it does (labels, Dependabot, secret scanning, rules on main, a production environment that waits for them) and ask: *"Set this up now?"*
     4. On a yes, run it without `--dry-run` and show the results, including anything skipped because of their plan.
2. **Seed data and test users.** Once the schema is designed (step 4), the first slice that adds a table also adds a seed script and **two test users**, so `qa` can always sign in and check that one user can't see another's data.
3. **List the slices** from `docs/mvp.md`. One slice is one thing a user can do, end to end. Name the **core.** Not every app needs auth.
4. **Design what the slices share.** Start from the approved screens and tokens in `docs/design.md` and `docs/wireframes/index.html`. No approval row in `docs/decisions.md`? Stop and run `wireframes` first. Apply the tokens to the UI kit's theme, then write the schema and the API contracts the screens need. A screen that must change goes back through `wireframes` for approval. Builders follow this design. They don't invent their own.
5. **Order pass 1.** Slice 0 first, then the slice that proves the riskiest idea, usually the core.
6. **Plan the passes.** For each pass, list its slices and what "better" means for each one: speed, edge cases, polish, more depth in the core.
7. **Make each pass a milestone,** with the slices ordered by priority and dependency.
8. **Write `docs/pyramid.md`** from the `idea` skill's template, then hand off to `issues`.

## Rules

- Every slice in pass 1 ends with something a person can **try.** If they can't, it isn't a slice yet.
- Don't start pass 2 of anything until pass 1 of the core works.
- A big feature with new screens: run `wireframes` for them and get the approval before you slice it.
- After each pass the person tries the app, and their feedback reshapes the next pass. Everything above the current pass is a draft. A re-plan hands off to `issues` too, which ends with its consistency check.
