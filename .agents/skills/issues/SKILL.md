---
name: issues
description: Use to turn a plan, a pyramid pass, feedback or a bug into issues an agent can build alone ("write the issues", "turn this into tickets", "I tried the app, here's my feedback", "file a bug") - each with acceptance checks tagged auto or agent, an out-of-scope fence, dependencies, modules touched, risk flags and lane, priority and the skills to load. Runs on the everyday model from the CTO's plan.
---

# Issues: the contract between the plan and every agent after it

A builder knows only what the issue says, plus `AGENTS.md` and `docs/design.md`. Whatever the issue leaves unsaid, the builder will guess.

Write issues from the CTO's plan (`docs/pyramid.md`, `docs/design.md`) on the everyday model at medium effort. The design decisions are already made, so don't redesign here. If the plan has a gap, it's a ⏳ decision: write the issues you can, and use the `ask` skill for the gap. A gap in the MVP core is a 🛑 blocker.

**Hands-on** automation: write the issues and stop. Don't add `status:ready` unless the person asks. They pick what gets built.

## Steps

1. **One milestone per pyramid pass** (or per feature, for a project that's already built).
2. **One issue per slice per pass.** Split anything a reviewer couldn't read in one sitting (about 400 changed lines) into sub-issues.
3. **Fill in every field** of `.github/ISSUE_TEMPLATE/slice.md`. If the repo doesn't have it, copy it from this skill's `templates/`.
4. **Acceptance checks.** Each one is concrete and checkable.
   - **`auto`:** becomes an automated test that CI runs on every pull request. Most checks should be `auto`.
   - **`agent`:** needs judgement (layout, flow, copy). A fresh `qa` agent checks it on the preview before merge. Write the steps to click and what you should see.
   - For anything a signed-in user owns, add one check that **a signed-out visitor and a second user can't read or delete it.**
5. **Risk flags and lane.** Tick every flag that applies, then set the lane:
   - **tiny:** copy, styling or config with no logic. Build, CI, review, merge.
   - **normal:** anything else. Build, CI, review, `qa` on the preview, merge.
   - **risky:** any flag ticked. Normal, plus `pr-security`, plus the human gate in `docs/stack.md`.
   - **Who merges:** after the lane, write `merged by: agents` or `merged by: the person`. Take it from the "Automation level" switches in `docs/stack.md`, and the risk dial. The more careful one wins.
6. **Labels.** Create any that are missing first (`gh label create "<name>" --force`):
   - `priority:p0` to `priority:p3`;
   - `pass:1` to `pass:3`;
   - `slice:core`, `slice:support`;
   - `lane:tiny`, `lane:normal`, `lane:risky`;
   - `status:ready` once nothing blocks it;
   - `status:in-progress` and `needs-human`, which `coordinate` sets later;
   - `blocker`, added next to `needs-human` when nothing can move until the person answers (see `ask`);
   - `human-approved`, which only the person adds, to a pull request that changes the agents' rules;
   - `no-issue`, the only way a pull request skips the issue link. Dependabot gets it.
7. **Dependencies both ways:** "Depends on #N" here, and "Blocks #M" on the other one.
8. **Modules touched,** and whether the issue is **decoupled.** That's how `coordinate` knows what can run in parallel.
   - **A slice that creates a module:** write "Use the generator: `<command>`" in the goal, with the command from "Commands that work here" in `AGENTS.md` (for example `pnpm new:module <name>`). No generator yet? Write "Copy `<the nearest existing module>`" instead.
9. **Skills line:** `build`, plus at most two more, named exactly. A skill named in the issue gets loaded. One that's only installed may not be. Pick the know-how the work needs:
   - `stack-<name>` for the project's stack;
   - `a11y` for any new screen or form;
   - `web-security` for public endpoints, forms and anything user-supplied;
   - `web-performance` for heavy pages, media or 3D;
   - `seo` for public pages;
   - `dependencies` when adding a library.

## Every change has an issue

One issue, one branch (`feat/<n>-short-name` or `fix/<n>-short-name`), one pull request that says `Closes #<n>`. Work someone asks for without an issue gets one first. CI fails a pull request with no link unless it has `no-issue`. Why: `guide/app-conventions.md` in the kit.

## No GitHub yet?

Write each issue as `docs/issues/NNN-short-title.md` from the same template, and move them to GitHub once there's a remote.

## From feedback or bugs

One issue per point, in the person's words: "what I saw, what I want." For a bug: the steps, what was expected, what happened, a screenshot, and the PR that caused it if known. Tag it with the current pass.
