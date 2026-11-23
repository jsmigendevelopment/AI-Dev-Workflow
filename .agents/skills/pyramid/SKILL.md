---
name: pyramid
description: Use when planning how to build an app or a big feature ("plan the build", "break this into milestones", "how should we slice this", "plan the next pass") - the CTO step. Plans slice 0 (the skeleton with CI and a test deploy), cuts the MVP into vertical tracer-bullet slices, stacks them into three passes (Works, Real, Ready) where each is narrower and deeper, outlines every pass but details only the current one, designs the schema and API from the approved wireframes, and re-plans at each pass gate.
---

# Pyramid: see it working early, then make it great

This is CTO work. Run it on the strongest model at high effort (see `routing`). It plans and designs. It doesn't redraw screens; `wireframes` did, and the person approved them. It doesn't write issues; `issues` does that next on a cheaper model.

## Why

The old way builds in layers: the whole schema, then the whole API, then the whole UI, and you see nothing until the end. **Tracer bullets** cut thin **vertical slices.** Each one goes all the way through (schema → API → UI), so after the first one you can use something real and steer.

**A pass is an improvement** to what's already there. Each pass makes its slices better than the last.

It's standard agile: slices are vertical user stories, passes and layers are iterations, the gate is the review, retro and backlog refinement, and `features.md` is the backlog.

The MVP is not one slice and not one pass, so the slices **stack:**

```
pass 3  Ready            ████                 the core polished · speed, a11y, SEO, launch checklist
pass 2  Real      ████   ████   ████          the core deep · supports get the floor items
pass 1  Works ████ ████  ████   ████ ████     a thin tracer bullet through every slice
              sup. sup.  CORE   sup. sup.
```

- **The MVP is 3 passes.** More needs a written reason in `docs/decisions.md` and the person's yes. Never more than 4.
- **The core slice is the tallest column.** Supporting slices stop once they serve the core.
- **The end of pass 3 is "MVP complete" on the test site. It is not launch.** Launch is the person's call, on the always-stop list, any time after.

## What goes in the MVP pyramid

Only the core, the supporting slices the core can't work without, and the floor (sign-in, who sees what, deleting personal data). Test each slice: **does the core work without it?** Yes? It's not in the MVP.

- A non-core "must" the person insists on: ask once, plainly. Still a must? It goes in as a supporting slice with the role `insisted`, capped at pass 1 or 2. Record the decision.
- Everything else in `docs/features.md` waits for the top half of the hourglass, below.

## After the MVP: the hourglass

Past "MVP complete" the shape turns upside down and gets wider: more features each layer.

```
layer 3   ████ ████ ████ ████ ████ ████     new features, each in thin · plus a pass on what's there
layer 2     ████ ████ ████ ████
layer 1        ████ core ████
──────────────── MVP complete ────────────────
pass 3            ████
pass 2      ████  ████  ████
pass 1  ████ ████ ████ ████ ████
```

- **Each layer has two parts:** new features, each coming in thin (it works end to end, with the floor), and **a pass on what's already there:** the core every layer, plus the earlier features that feedback or usage points to.
- **The mix is a guide:** about two thirds new, one third improving. The gate shifts it.
- **The gate between layers** is the same as between passes (`references/pass-gate.md`). Plan one layer at a time.
- **Launch** can happen at any layer. It's the person's call.

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
3. **List the slices** from `docs/mvp.md`. One slice is one thing a user can do, end to end. Name the **core.** Keep only slices that pass "does the core work without it?". Not every app needs auth.
4. **Design what the slices share.** Start from the approved screens and tokens in `docs/design.md` and `docs/wireframes/index.html`. No approval row in `docs/decisions.md`? Stop and run `wireframes` first. Apply the tokens to the UI kit's theme, then write the schema and the API contracts the screens need. A screen that must change goes back through `wireframes` for approval. Builders follow this design. They don't invent their own.
5. **Order pass 1.** Slice 0 first, then the slice that proves the riskiest idea, usually the core.
6. **Outline every pass.** For each: the milestone name, its slices, and one line per slice on what "better" means. **Detail only the current pass:** its slices in order of priority and dependency, and what each must do.
7. **Write `docs/pyramid.md`** from the `idea` skill's template, with the current pass marked `building`. Then hand off to `issues` for that pass only. **Done when** every pass has an outline row and only the current pass has detail.

## Rules

- Every slice in pass 1 ends with something a person can **try.** If they can't, it isn't a slice yet.
- Don't start pass 2 of anything until pass 1 of the core works.
- A big feature with new screens: run `wireframes` for them and get the approval before you slice it.
- Everything above the current pass is an outline. It gets detail only at its gate.
- A pass ends at the pass gate: the person tries it, a fresh audit, cleanup, then a re-plan here. See the References table.

## References

| File | Load when |
|---|---|
| `references/pass-gate.md` | Every issue in the current pass is merged, or you're re-planning at a gate. |
