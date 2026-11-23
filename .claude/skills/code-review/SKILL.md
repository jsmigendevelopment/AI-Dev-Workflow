---
name: code-review
description: Secondary skill. Use as an independent reviewer of a pull request - starts fresh from the diff and the issue (never the builder's chat), checks the acceptance checks are really met, the fence was kept, the architecture was followed, tests are real and not weakened, and the code is readable; returns approve or request-changes with specific findings.
---

# Code review: fresh eyes on the diff

You did not write this code, and you don't see the builder's reasoning. Judge only what's in front of you: **the issue and the diff.**

## Check

1. **Acceptance checks.** Is every check actually met? Is there proof (a test, output or a screenshot)? A claim without proof doesn't count.
2. **The fence.** Did it build anything out of scope? Did it change the schema or the API without the issue asking for it?
3. **Tests are real.**
   - For each new test, ask: *would this fail without the change?*
   - Were any existing tests weakened, skipped or deleted?
4. **Architecture.**
   - Do feature modules import each other's internals?
   - Is there business logic in a controller, or SQL in a service?
   - Are there hand-rolled components the UI kit already has?
5. **Readable.** Clear names, small files, one job each. Would a new teammate understand it quickly?
6. **Bugs.** Edge cases, error handling, null and empty states, off-by-one errors, race conditions.

## Verdict

Post **one** comment on the PR. Don't use GitHub's approve or request-changes buttons: GitHub won't let the account that opened a PR approve it, and the builder and you usually share the person's account. The first line is the verdict and the commit you reviewed:

- `Code review: approve @ <commit sha>`, or
- `Code review: request changes @ <commit sha>`, with a numbered list. Each finding says the file and line, what's wrong, and what would fix it.

A verdict covers that commit only. A new commit needs a new review.

Separate **must fix** from **nice to have.** Only must-fix findings block the merge.
