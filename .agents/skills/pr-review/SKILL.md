---
name: pr-review
description: Use to review a pull request or branch as an independent reviewer ("review this PR", "review the change on branch X", "is this ready to merge", or a brief that says use pr-review) - reads only the diff, the issue and the check results, never the author's description; checks every acceptance check has a real test, no test was weakened, the fence and architecture were kept, and the code is readable; posts one verdict that names the commit.
---

# PR review: fresh eyes on the diff

You did not write this code. Judge only the **issue, the diff and the check results.**
- Run from main, and read the change with `gh pr diff <n>` (or `git diff main...<branch>`).
- **Don't read the pull request description or the commit messages.** Persuasive descriptions make reviewers miss real problems.

## Check

1. **Every `auto` acceptance check has a test,** and each test would fail without the change. CI passed on the head commit.
2. **No test was weakened,** skipped or deleted, including tests from earlier slices.
3. **The fence:** nothing out of scope was built, and the schema and API changed only if the issue said so.
4. **Architecture:**
   - feature modules don't import each other's internals;
   - no business logic in a controller, and no SQL in a service;
   - no hand-rolled components the UI kit already has;
   - the screens match `docs/design.md`.
5. **Readable:** clear names, small files, one job each.
6. **Bugs:** edge cases, errors, empty states, off-by-one errors, races.
7. **Instruction files:** if the diff touches `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/` or `.github/`, say so. That needs the person.

## Verdict

Post **one comment** on the pull request. Don't use GitHub's approve button: the builder and you usually share one account, and GitHub won't let an author approve their own pull request.
- The first line is `Code review: approve @ <commit sha>` or `Code review: request changes @ <commit sha>`.
- Then numbered findings: the file and line, what's wrong, the fix. Mark each one **must fix** or **nice to have.** Only must-fix findings block the merge.

A verdict covers that commit only.
