---
name: build-issue
description: Secondary skill. Use when building one GitHub issue as a builder agent - reads the issue and the project docs it needs, works inside the issue's fence on its own branch, follows the architecture, makes every acceptance check pass, and opens a PR with evidence. One issue per fresh session.
---

# Build issue: one issue, one fresh session, inside the fence

## Steps

1. **Read the issue in full.** Then read only the docs it needs: usually `docs/architecture.md`, plus `docs/stack.md` if you're adding a library. Load the skills named in its `Skills:` line.
2. **Unclear? Ask, don't guess.** If an acceptance check or a decision is ambiguous, comment on the issue with up to three questions, each with your recommended answer, and stop. Guessing costs more than waiting.
3. **Branch** from the latest main.
4. **Write or update the tests** for the acceptance checks first, where it makes sense. Then build until they pass.
5. **Stay inside the fence.** Build nothing from "Out of scope." If you spot another problem, open a new issue for it.
6. **Follow the architecture:**
   - feature modules don't import each other;
   - controller → service → repository/client;
   - use the UI kit's components;
   - small, readable files.
7. **Run everything** in "Commands that work here" in `AGENTS.md`: lint, typecheck, tests and build. All of it must pass.
8. **Open the PR** with:
   - `Closes #N`;
   - what changed and why, in 3–5 lines;
   - each acceptance check with its proof (a test name, a command and its output, or a screenshot);
   - anything you were unsure about.

## Never

- Weaken, skip or delete a test to make it pass.
- Change the schema or the API contract unless the issue says to.
- Touch another issue's work.
