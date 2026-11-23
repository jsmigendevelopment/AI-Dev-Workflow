---
name: write-issues
description: Secondary skill. Use to turn a plan, a pyramid pass, feedback or a bug into GitHub milestones and issues that an agent can build alone - each with a goal, acceptance checks written before the build, out-of-scope fence, dependencies, modules touched, priority, pyramid pass, model and effort for builder and reviewers, the skills to load, and the human gate. Run it on the strongest planning model.
---

# Write issues: the contract between the planner and every agent after it

A builder agent knows only what the issue says, plus `AGENTS.md`. Whatever the issue leaves unsaid, the builder will guess. Write it so the agent never has to.

Run this on the **strongest planning model** (see `model-routing`). The planner decides the priority, the dependencies, the model, the effort and the skills, so the builder doesn't have to.

## Steps

1. **One milestone per pyramid pass** (or per feature, for a project that's already built).
2. **One issue per slice per pass.** Split anything bigger than about a day of agent work into sub-issues.
3. **Fill in every field** of `.github/ISSUE_TEMPLATE/slice.md`. If the repo doesn't have that file yet, copy it from this skill's `templates/` folder.
4. **Set the labels.** A new repo has none of these, and `gh issue create --label` fails on a label that doesn't exist, so create any that are missing first (`gh label create "<name>" --force`):
   - `priority:p0` to `priority:p3`;
   - `pass:1`, `pass:2`, `pass:3`;
   - `slice:core` or `slice:support`;
   - `status:ready` once nothing blocks it;
   - `status:in-progress` and `needs-human`, which the `coordinator` sets later.
5. **Link the dependencies** both ways: "Depends on #N" in this issue, and "Blocks #M" in the other one.
6. **Say what it touches.** List the **modules** each issue changes (not files, since those may not exist yet), and whether it's **decoupled**. That's how the coordinator knows what can run in parallel.

## Fields that matter most

- **Acceptance checks.** Write them before the build. Each one is something another agent can run or click to prove the issue works. Include the browser steps for anything a user sees.
- **Out of scope.** The fence. Anything nearby that this issue must *not* do.
- **Skills.** At most three, named exactly. A skill nobody names usually doesn't get loaded.
- **Human gate.** Whether the person must look before merge, following the risk dial in `docs/stack.md`.

## From feedback

When the person tries the app and gives feedback, write **one issue per point**, in their words, with a short "what I saw, what I want." Tag it with the current pass.
