---
name: pyramid
description: Use when planning how to build an app or a big feature ("plan the build", "break this into milestones", "how should we slice this") - the CTO step. Plans slice 0 (the skeleton with CI and a test deploy), cuts the MVP into vertical tracer-bullet slices, stacks them into passes where pass 1 is wide and thin and each higher pass is narrower and deeper, designs the schema, API and wireframes, and writes the milestone plan.
---

# Pyramid: see it working early, then make it great

This is CTO work. Run it on the strongest model at high effort (see `routing`). It plans and designs. It doesn't write issues; `issues` does that next on a cheaper model.

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

1. **Slice 0, the skeleton.** Before any feature: the app runs, CI runs every check on every pull request (start from `templates/ci.yml` in the `idea` skill), the boundary check is on, main deploys to test, and there's a preview per pull request if the host offers one. Record the test URL in `AGENTS.md`.
2. **List the slices** from `docs/mvp.md`. One slice is one thing a user can do, end to end. Name the **core.** Not every app needs auth.
3. **Design what the slices share.** In `docs/design.md`: the schema, the API contracts, and a wireframe and layout for every screen in pass 1. Plain text or ASCII wireframes are fine. Builders follow this design. They don't invent their own.
4. **Order pass 1.** Slice 0 first, then the slice that proves the riskiest idea, usually the core.
5. **Plan the passes.** For each pass, list its slices and what "better" means for each one: speed, edge cases, polish, more depth in the core.
6. **Make each pass a milestone,** with the slices ordered by priority and dependency.
7. **Write `docs/pyramid.md`** from the `idea` skill's template, then hand off to `issues`.

## Rules

- Every slice in pass 1 ends with something a person can **try.** If they can't, it isn't a slice yet.
- Don't start pass 2 of anything until pass 1 of the core works.
- After each pass the person tries the app, and their feedback reshapes the next pass. Everything above the current pass is a draft.
