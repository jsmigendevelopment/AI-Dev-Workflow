---
name: tracer-bullet-pyramid
description: Secondary skill. Use when planning how to build an app or a big feature - breaks it into vertical slices (tracer bullets, each cutting through schema, API and UI) and stacks them into passes, a pyramid where pass 1 is wide and thin across every MVP slice and each higher pass is narrower and deeper, with the core slice getting the most passes. Writes docs/pyramid.md and the milestone plan.
---

# Tracer-bullet pyramid: see it working early, then make it great

## Why

The old way builds in layers: the whole schema, then the whole API, then the whole UI, and you see nothing until the end. **Tracer bullets** cut thin **vertical slices** instead. Each slice goes all the way through (schema → API → UI), so after the first one you can use something real and steer the AI.

The MVP is not one slice and not one pass, so the slices are **stacked**:

```
pass 3                  ████                 narrowest · hardest · most polished
pass 2           ████   ████   ████
pass 1    ████   ████   ████   ████   ████   widest · simplest · thin end-to-end
          sup.   sup.   CORE   sup.   sup.
```

- **Pass 1** is a thin, working tracer bullet through *every* MVP slice: simple, but end to end.
- **Each pass up** covers fewer slices and goes deeper: more complex and more polished.
- **The core slice is the tallest column.** It gets the most passes and the most effort.
- Supporting slices stop as soon as they're good enough to serve the core.

## Steps

1. **List the slices** from `docs/mvp.md`. One slice is one thing a user can do, end to end. Name the **core** slice. The slices depend on the app; not every app needs auth.
2. **Order pass 1.** Start with the slice that proves the riskiest idea, usually the core. Do any prefactoring first, so later slices are easy to add.
3. **Plan the passes.** For each pass, list the slices in it and what "better" means for each one: speed, edge cases, polish, more depth in the core.
4. **Make each pass a milestone**, and within a pass, order the slices by priority and dependency.
5. **Write `docs/pyramid.md`** from the `new-project` template, then hand it to `write-issues`.

## Rules

- Every slice in pass 1 ends with something a person can **try.** If they can't, it isn't a slice yet.
- Don't build pass 2 of anything until pass 1 of the core works.
- After each pass, the person tries the app, and their feedback reshapes the next pass. The plan above the current pass is a draft.
- Pass 1 runs on the everyday model at low effort. Higher passes use more effort (see `model-routing`).
