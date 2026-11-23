---
name: build
description: Use when implementing one issue ("implement issue 12", "build this issue", "work on issue 7", or a brief that says use the build skill) - reads the issue and the design, works inside its fence on its own branch, turns every auto acceptance check into a test first, follows the architecture, runs every check, and opens a pull request that closes the issue. One issue per fresh session.
---

# Build: one issue, one fresh session, inside the fence

## Steps

0. **Say you've started:** `node .agents/skills/coordinate/scripts/board.mjs event started issue=<n> title="<issue title>" thread="<your session name>"`. If it can't write (a cloud thread), skip it. The `status:in-progress` label carries it.
1. **Read the issue in full,** then `docs/design.md` for its screens, schema and API, and `docs/architecture.md`. Open `docs/stack.md` only if you're adding a library. Load the skills named on its `Skills:` line, and read every recipe on its `Recipes:` line (`.agents/skills/stack-tanstack-start/references/tanstack/<name>.md`): a form, data grid, chart, Markdown, code highlighting, long list or keyboard shortcuts follows its recipe, and its "Done when" list is part of the acceptance checks.
2. **Unclear? Ask, don't guess.** An unclear issue is a ⏳ decision. Use the `ask` skill: comment up to three questions, each with your recommended answer, label it `needs-human`, ping, and stop. If the work would hit the always-stop list, it's a 🛑 blocker instead.
3. **Branch** from the latest main: `feat/<n>-<short-name>`, or `fix/<n>-<short-name>` for a bug. No issue, no branch: ask for one. Start each commit message with the issue number.
4. **Copy the nearest example.** Find the closest module, route or test the repo already has, and match its naming, error handling, layout and test style. If a generator exists (`pnpm new:module` or similar, listed in "Commands that work here"), use it. Never free-write a module a generator makes.
5. **Tests first.** Turn every `auto` acceptance check into a test, named so it's obvious which check it covers. Run it and watch it fail. Then build until it passes.
   - **A bug or core logic** (business rules, permissions, money): strict red/green. One failing test, the least code to pass it, then the next. A bug fix starts with a test that reproduces it.
   - Test behaviour through the public interface. Mock only the edges: network, clock, randomness. Use the memory fake, not mocks of your own code.
   - No snapshot tests for logic. Each test must fail without your change.
6. **Stay inside the fence.** Build nothing from "Out of scope." Found another problem? Open a new issue for it.
7. **Follow the design and the architecture:**
   - the screens and contracts in `docs/design.md`;
   - feature modules don't import each other;
   - controller → service → repository/client;
   - the UI kit's components and design tokens. No one-off colours, spacing or font sizes. A new token is the person's call, so ask;
   - the app conventions in "App rules" below.
8. **Write it the owner's way:** follow "Code rules" below. Installing a package? Open the `dependencies` skill and verify it first.
9. **Update the docs** your change makes wrong, in the same pull request.
10. **Run every check** in "Commands that work here" in `AGENTS.md`: lint, typecheck, the boundary check, tests and build. All of it must pass.
11. **Open the pull request as a draft** (`gh pr create --draft`; if GitHub refuses drafts on this plan, open a normal one) with `Closes #<n>` in the body and, for each acceptance check, the test that covers it or the `agent` steps to try. Keep the description short and factual. Reviewers judge the diff, not the description.
   - Aim for under about 400 changed lines, not counting lockfiles and generated files. Bigger? Split it, or label it `large-pr` and say why.
   - **Hands-on** automation (see "Automation level" in `docs/stack.md`)? Don't open it unless the person said to. Push the branch and tell them its name and the check results.
   - Then add `node .agents/skills/coordinate/scripts/board.mjs event pr-opened issue=<n> pr=<n> title="..."`.
12. **Finish:** `node .agents/skills/coordinate/scripts/board.mjs event finished issue=<n>`, then exit. Don't wait for the review.

## Code rules

The owner's preferences. Lint catches some. You follow all of them. The reasons are in `guide/code-style.md`, `guide/testing.md` and `guide/app-conventions.md` in the kit.

- **Reuse first.** Search for an existing helper, component or util before you write one.
- **Simplest thing that passes.** No new abstraction, layer, factory or generic until a second real use exists.
- **No leftovers:** unused files, exports or dependencies; any `console.*` (use the logger); commented-out code; a TODO without an issue number (`TODO(#42)`).
- **No escape hatches:** `any`, `@ts-ignore`, `@ts-expect-error`, `as unknown as`, `eslint-disable`. If one can't be avoided, add a comment with the reason and an issue number.
- **Size:** warn at 300 lines a file, never over 500. Functions under about 60 lines. Split by responsibility, not by line count.
- **No swallowed errors:** no empty catch, and never drop a caught error. Use the project's one error shape.
- **Comments say why, not what.** Each exported module API gets a one-line doc comment.
- **Names and imports:** kebab-case files, the path alias instead of deep `../../..`, and the project's import order. No barrel `index.ts`: import from the file itself.

## App rules

The shape is in `docs/architecture.md`. The reasons are in `guide/app-conventions.md`.

- **Rule of three:** search for an existing component first. Extract a shared one the third time, not before.
- **State:** local `useState` or `useReducer` by default. Anything shareable or refresh-safe (filters, tabs, the selected item, the page) in typed search params. Zustand only for complex shared client state. Server data in TanStack Query, never copied to a store. Forms in TanStack Form, tables in TanStack Table. No props through more than two levels.
- **UI layers:** the route prefetches and passes params; the view is static layout and never fetches; each section is `Suspense` > error boundary > content; components are presentational.
- **Loading, empty and error states** for every dynamic area. Skeletons match the real layout's shape and size. `ErrorState` has an icon, a title, the code's message, a next action and the reference ID. `EmptyState` has an icon or illustration, a sentence and the primary action. Never a bare "Error", a raw `error.message` or a grey box. Queries in parallel.
- **Errors:** `AppError` with a code from the one list. A specific message with a next step for every expected error. A reference ID for the rest. Logged once, at the boundary.
- **Logs:** only through `lib/logger.ts`, never `console.*`. JSON lines with the standard fields, the right level, nothing personal, nothing in a loop.
- **API:** public routes under `/api/v1`. A breaking change adds `/api/v2` beside it, on the same services. Internal server functions aren't versioned. Every public route and webhook is in the OpenAPI document, built from the same Zod schemas.
- **Money:** the `Money` type, integer minor units plus the currency. No float or decimal `number` math. Half-even rounding, remainders allocated, `Intl.NumberFormat` at the edge. Tests for rounding and splitting.
- **Time:** instants in UTC, calendar dates and zoned times kept apart, the injected `now`, no ambiguous parsing, `Intl.DateTimeFormat` at the edge. Daylight saving tests.
- **Database:** Drizzle. snake_case plural tables, a server-made time-sortable `id`, `created_at` and `updated_at`, `<table_singular>_id` foreign keys with an index, `is_`/`has_` booleans, soft delete only where decided, forward-only migrations that are safe to roll out. Audit-log important actions.
- **Env:** read only through `lib/env.ts`. A new variable updates `.env.example`, the schema and the docs in this pull request.
- **Access:** owner filters in the repository, or `check(user, action, object)` through the port. No role checks in code.
- **Text and events:** user-facing strings in the module's `copy.ts` (or its message files, if translation is on). Every event in the registry, sent only by `track()`, with no personal data. Unfinished work behind a flag.

## Never

- Weaken, skip or delete a test to make it pass. That includes tests from earlier slices.
- Change the schema or an API contract unless the issue says to.
- Read, print or commit `.env` files, tokens or keys. Refer to secrets by name. Need a value? Use the `secrets` checklist, never chat.
- Touch another issue's work.

## References

The full rules, with the reason for each: `references/code-style.md`, `references/testing.md` and `references/app-conventions.md` in this skill's folder.
