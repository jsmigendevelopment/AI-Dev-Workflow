---
name: issues
description: Use to turn a plan, a pyramid pass, feedback or a bug into issues an agent can build alone ("write the issues", "turn this into tickets", "I tried the app, here's my feedback", "file a bug") - each with acceptance checks tagged auto or agent, an out-of-scope fence, dependencies, modules touched, risk flags and lane, priority and the skills to load. Runs on the everyday model from the CTO's plan.
---

# Issues: the contract between the plan and every agent after it

A builder knows only what the issue says, plus `AGENTS.md` and `docs/design.md`. Whatever the issue leaves unsaid, the builder will guess.

Write issues from the CTO's plan (`docs/pyramid.md`, `docs/design.md`) on the everyday model at medium effort. The design decisions are already made, so don't redesign here. If the plan has a gap, flag it.

## Steps

1. **One milestone per pyramid pass** (or per feature, for a project that's already built).
2. **One issue per slice per pass.** Split anything a reviewer couldn't read in one sitting (a few hundred changed lines) into sub-issues.
3. **Fill in every field** of `.github/ISSUE_TEMPLATE/slice.md`. If the repo doesn't have it, copy it from this skill's `templates/`.
4. **Acceptance checks.** Each one is concrete and checkable.
   - **`auto`:** becomes an automated test that CI runs on every pull request. Most checks should be `auto`.
   - **`agent`:** needs judgement (layout, flow, copy). A fresh `qa` agent checks it on the preview before merge. Write the steps to click and what you should see.
   - For anything a signed-in user owns, add one check that **a signed-out visitor and a second user can't read or delete it.**
5. **Risk flags and lane.** Tick every flag that applies, then set the lane:
   - **tiny:** copy, styling or config with no logic. Build, CI, review, merge.
   - **normal:** anything else. Build, CI, review, `qa` on the preview, merge.
   - **risky:** any flag ticked. Normal, plus `pr-security`, plus the human gate in `docs/stack.md`.
6. **Labels.** Create any that are missing first (`gh label create "<name>" --force`):
   - `priority:p0` to `priority:p3`;
   - `pass:1` to `pass:3`;
   - `slice:core`, `slice:support`;
   - `lane:tiny`, `lane:normal`, `lane:risky`;
   - `status:ready` once nothing blocks it;
   - `status:in-progress` and `needs-human`, which `coordinate` sets later.
7. **Dependencies both ways:** "Depends on #N" here, and "Blocks #M" on the other one.
8. **Modules touched,** and whether the issue is **decoupled.** That's how `coordinate` knows what can run in parallel.
9. **Skills line:** `build`, plus at most two more, named exactly. A skill named in the issue gets loaded. One that's only installed may not be.

## No GitHub yet?

Write each issue as `docs/issues/NNN-short-title.md` from the same template, and move them to GitHub once there's a remote.

## From feedback or bugs

One issue per point, in the person's words: "what I saw, what I want." For a bug: the steps, what was expected, what happened, a screenshot, and the PR that caused it if known. Tag it with the current pass.
