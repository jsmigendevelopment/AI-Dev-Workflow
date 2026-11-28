---
name: pr-review
description: Use to review a pull request or branch as an independent reviewer ("review this PR", "review the change on branch X", "is this ready to merge", or a brief that says use pr-review) - reads only the diff, the issue and the check results, never the author's description; checks every acceptance check ID has a real test, no test was weakened, the fence and architecture were kept, and the code is readable; posts one verdict that names the commit.
---

# PR review: fresh eyes on the diff

You did not write this code. Judge only the **issue, the diff and the check results.**
- Run from main, and read the change with `gh pr diff <n>` (or `git diff main...<branch>`).
- Then diff the head against current main as well as the merge base: `git fetch origin main && git diff origin/main <head>`. A head cut from a stale checkout can quietly undo main. Flag anything main has that the head removes, unless the issue asks for it: a must fix.
- **Don't read the pull request description or the commit messages.** Persuasive descriptions make reviewers miss real problems.

**Started by the person in the live thread** (the thread they talk to, rule 17 in `AGENTS.md`)? Don't review there. Start a background sub-agent briefed *"Use the `pr-review` skill on #<n>."*, say so in one line, end the turn, and pass the verdict on when it reports back.

**Your brief came from another thread?** Never hand your own job down again: do it yourself, and start a sub-agent only where a step below says to.

## Check

1. **Every `auto` acceptance check has a test whose title carries its ID.** Search the diff for each `AC-<issue>-<n>`. A missing ID, or a test that doesn't prove its check, is a must fix. Each test would fail without the change. The local checks passed on the head commit (`coordinate`, step 6.1). Workflow results don't count.
   - A bug fix comes with a test that reproduces the bug.
   - Tests go through the public interface and mock only the edges (network, clock, randomness).
   - No snapshot test stands in for a logic test.
   - **Briefed to run them yourself?** Follow `coordinate` step 6.1 from its first check, 6.1.1: the local gate only runs the loop's own branches. Time each command, as 6.1.3 says. Run `mark-check.mjs` without `--record`: you commit nothing, so a record file in your checkout never reaches main. Instead, end the `Checks:` comment with the output of this command, pasted as printed (never type the JSON by hand). The coordinator's harvest then finds the head's `check` record, and the merge step doesn't run the checks again (#417):
     `node .agents/skills/coordinate/scripts/insights.mjs line check pr=<pr> sha=<sha> 'commands=<commands>' state=<success|failure> 'failed_step=<failed>' flaky_rerun=<rerun> fence=<fence-name>`
     `<commands>` is a JSON list with one `{"name": "<command>", "result": "<pass|fail|skipped>", "seconds": <seconds>}` per command, named as in the comment, each name at most 200 characters. `state` is `success` on `Checks: pass`, else `failure`. `<failed>` is the first red command, or `null` on a pass. Inside the single quotes, write each `'` as `'\''`, or the shell cuts the value short. `<rerun>` is `true` when a command failed and then passed when run again, else `false`. `<fence-name>` is only the word after `Fence:` in `fence.mjs`'s line (`bubblewrap`, `sandbox-exec` or `none`), never the rest of the line, which holds apostrophes. Ran the commands without `fence.mjs`? Leave `fence=` out.
2. **No test was weakened,** skipped or deleted, including tests from earlier slices.
3. **The fence:** nothing out of scope was built, and the schema and API changed only if the issue said so.
4. **Architecture:**
   - feature modules don't import each other's internals;
   - no business logic in a controller, and no SQL in a service;
   - no hand-rolled components the UI kit already has;
   - no one-off colours, spacing or font sizes, and no new design token the person didn't approve (on Full, a new token recorded as "AI pick, not reviewed" passes, as `build` step 7 says);
   - the screens match `docs/design.md`.
5. **Code rules.** Check each one. Lint catches some, not all:
   - [ ] **Reuse:** no new helper, component or util that duplicates one the repo already has. Search for it.
   - [ ] **Simple:** no new abstraction, layer, factory or generic with only one real use.
   - [ ] **Nearest example:** naming, error handling, layout and test style match the closest existing code. A new module came from the generator, if there is one.
   - [ ] **No leftovers:** unused files, exports or dependencies, any `console.*`, commented-out code, a TODO without an issue number.
   - [ ] **No escape hatches:** `any`, `@ts-ignore`, `@ts-expect-error`, `as unknown as`, `eslint-disable`. One with a reason and an issue number may stay, but list it as a finding.
   - [ ] **Size:** no file over 500 lines (say so past 300), no function over about 60, split by responsibility.
   - [ ] **Errors:** no empty catch, no caught error thrown away, the project's one error shape.
   - [ ] **Comments** say why, not what. Each exported module API has a one-line doc.
   - [ ] **Names and imports:** clear names, kebab-case files, the path alias, no deep `../../..`.
   - [ ] **New packages** are real, spelled right, and checked as the `dependencies` skill says.
   - [ ] **Docs:** any doc the change makes wrong was updated in this diff.
   - [ ] **Size of the change:** under 1,000 changed lines, not counting lockfiles, generated files and test fixtures; check with `node .agents/skills/coordinate/scripts/pr-size.mjs --base origin/main`. Over that, it has the `size-exception` label and a `Size exception: <reason>` line, or it gets split.
6. **App conventions** (`guide/app-conventions.md` in the kit). One line each:
   - [ ] **Issue link:** the branch is `feat/<n>-...` or `fix/<n>-...`, and the body says `Closes #<n>`, unless it's labelled `no-issue`. Reading the body for this one line is fine.
   - [ ] **Rule of three:** no third copy of a UI piece that should now be shared, and no shared component extracted before then.
   - [ ] **State:** local state by default, shareable or refresh-safe state in typed search params, Zustand only for complex shared client state, no server data in a store, forms in TanStack Form, tables in TanStack Table, no props through more than two levels.
   - [ ] **No barrels:** no new `index.ts` re-export file outside a published library.
   - [ ] **Errors:** `AppError` with a listed code, a specific message for each expected error, a reference ID for the rest, nothing swallowed or re-thrown as generic.
   - [ ] **Loading:** data prefetched in the route loader, no query waterfall, empty, loading and error states for every dynamic area.
   - [ ] **Error, empty and skeleton:** the error state has an icon, a title, the code's message, a next action and the reference ID; the empty state has an icon or illustration, a sentence and the primary action; the skeleton matches the real layout with no shift; all on the design tokens. A bare "Error", a raw `error.message` or a plain grey box is a must fix.
   - [ ] **UI layers:** the route prefetches, the view doesn't fetch, each section wraps `Suspense` around an error boundary, components are presentational.
   - [ ] **API versions:** public routes under `/api/v1`; a breaking change adds a new version instead of changing the old one, with `Deprecation` and `Sunset` headers on the old.
   - [ ] **OpenAPI:** every new or changed public route or webhook is in the generated document, from the same Zod schemas. No internal server function in it.
   - [ ] **Money:** the `Money` type in integer minor units with its currency, no float or decimal `number` math, the stated rounding, remainders allocated, `Intl.NumberFormat` at the edge, tests for rounding and splitting.
   - [ ] **Time:** instants in UTC, dates and zoned times kept apart, the injected `now`, no ambiguous parsing, `Intl.DateTimeFormat` at the edge, daylight saving tests where it matters.
   - [ ] **Database:** snake_case plural tables, a server-made time-sortable `id`, `created_at` and `updated_at`, `<table_singular>_id` foreign keys with an index, check-constrained enums, `is_`/`has_` booleans, soft delete only where decided, a forward-only migration that's safe to roll out, important actions audit-logged.
   - [ ] **Logging:** only through the logger, one JSON line with the standard fields, the right level, nothing secret or personal, nothing in a loop, an error logged once at the boundary.
   - [ ] **Events:** every new event is in the registry with typed props, an owner and a date; sent only through `track()`; no personal data; important facts on the server.
   - [ ] **Env:** a new variable is in `.env.example` (with its metadata line), the env schema and the docs, all in this diff. Nothing reads env outside the schema.
   - [ ] **Translations:** strings in the module's `copy.ts`, or its message keys if translation is on. No strings built by concatenation.
   - [ ] **Access:** owner filters in the repository, or `check(user, action, object)` through the port. No role checks scattered in code. Someone else's object returns "not found".
7. **Bugs:** edge cases, errors, empty states, off-by-one errors, races.
8. **Instruction files:** if the diff touches `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/` or `.github/`, or a check file the guard protects (lint, type, test or budget config, a check script: the list is in `../automation/references/full.md`), say so. Below Full, that needs the person. On Full, the code review and the local guard decide it, with the weakening review standing in for the person (`automation`'s `references/full.md`).

## Verdict

Post **one comment** on the pull request. Don't use GitHub's approve button: the builder and you usually share one account, and GitHub won't let an author approve their own pull request.
- The first line is `Code review: approve @ <commit sha>` or `Code review: request changes @ <commit sha>`.
- The second line is `Needs the person: yes` or `no`, with the reason. Below Full, it's yes when the lane, the risk dial or the automation level in `docs/stack.md` says the person merges it (the more careful one wins), or when the diff touches the instruction files. On Full it's no, whatever the lane or the risk dial: the dial adds reviews there, never a person, and the weakening review stands in for the instruction files (#103). The one yes on Full is a diff that touches an always-stop item (real data, production), which waits for the person at every level (rule 16). It's never yes because you'd like a second opinion.
- **Briefed as the weakening review** (Full automation)? Follow "The weakening review" in `../automation/references/full.md`: one question, then the exact pass or fail comment. The comment is all: `coordinate` runs the guard from the session before the merge, so no label and no re-run.
- Then numbered findings: the file and line, what's wrong, the fix. Mark each one **must fix** or **nice to have.** Only must-fix findings block the merge.

A verdict covers that commit only. Then add a board event: `node .agents/skills/coordinate/scripts/board.mjs event review pr=<n> verdict="code review: approve @ <sha>"`.

End the verdict comment with the output of two commands, pasted as printed (never type the JSON by hand):
- `node .agents/skills/coordinate/scripts/insights.mjs line job job=review-code pr=<pr> sha=<sha> outcome=<pass|fail> model=<model> effort=<effort> tool=<tool> usage_before=<usage-before> usage_after=<usage-after> usage_from=<usage-from>`
- `node .agents/skills/coordinate/scripts/insights.mjs line review pr=<pr> sha=<sha> round=<round> verdict=<pass|changes> must=<must> nice=<nice> categories=<categories> model=<model> effort=<effort> tool=<tool>`

`<sha>` is the commit you reviewed. `outcome` is `pass` for approve, `fail` for request changes; `verdict` is `pass` or `changes` the same way. `<round>` counts your reviews of this pull request, from 1. `<must>` and `<nice>` count your findings. `<categories>` is a comma list of the Check headings your findings fall under (`tests`, `weakened`, `fence`, `architecture`, `code-rules`, `conventions`, `bugs`, `instructions`), or leave `categories=` out with no findings. `<model>` and `<effort>` are what your own session shows, else `unknown`. `<usage-before>` and `<usage-after>` are the provider's usage reading as your tool shows it when you start and now, else `unknown`; never estimate one. `<usage-from>` says where you read it, or where you looked. On request changes, add `send_back=review-must` to the job line.

A critical security hole goes through the `ask` skill as a 🛑 blocker.
