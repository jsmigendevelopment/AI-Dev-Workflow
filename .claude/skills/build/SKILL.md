---
name: build
description: Use when implementing one issue ("implement issue 12", "build this issue", "work on issue 7", or a brief that says use the build skill) - reads the issue and the design, works inside its fence on its own branch, turns every auto acceptance check into a test first, follows the architecture, runs every check, and opens a pull request that closes the issue. One issue per fresh session.
---

# Build: one issue, one fresh session, inside the fence

## Steps

1. **Read the issue in full,** then `docs/design.md` for its screens, schema and API, and `docs/architecture.md`. Open `docs/stack.md` only if you're adding a library. Load the skills named on its `Skills:` line.
2. **Unclear? Ask, don't guess.** Comment on the issue with up to three questions, each with your recommended answer, and stop.
3. **Branch** from the latest main: `feat/<issue>-<short-name>`. Start each commit message with the issue number.
4. **Tests first.** Turn every `auto` acceptance check into a test, named so it's obvious which check it covers. Run it and watch it fail. Then build until it passes.
5. **Stay inside the fence.** Build nothing from "Out of scope." Found another problem? Open a new issue for it.
6. **Follow the design and the architecture:**
   - the screens and contracts in `docs/design.md`;
   - feature modules don't import each other;
   - controller → service → repository/client;
   - the UI kit's components;
   - small, readable files.
7. **Run every check** in "Commands that work here" in `AGENTS.md`: lint, typecheck, the boundary check, tests and build. All of it must pass.
8. **Open the pull request** with `Closes #N` and, for each acceptance check, the test that covers it or the `agent` steps to try. Keep the description short and factual. Reviewers judge the diff, not the description.

## Never

- Weaken, skip or delete a test to make it pass. That includes tests from earlier slices.
- Change the schema or an API contract unless the issue says to.
- Read, print or commit `.env` files, tokens or keys. Refer to secrets by name.
- Touch another issue's work.
