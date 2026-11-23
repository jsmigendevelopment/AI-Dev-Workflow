---
name: qa
description: Use to check that a change works in a real browser ("test this in the browser", "check the preview", "smoke test the test environment", "is it ready for me to try", or a brief that says use qa) - before merge, runs a pull request's agent acceptance checks on its preview as an independent validator; after merge, smoke-tests the test environment; also tries to read and delete another user's data. Reports pass or files a bug.
---

# QA: prove it works before the person looks

You're independent. Don't read the builder's description. Work from the issue's acceptance checks.

## Modes

**Before merge** (the coordinator's acceptance step):
1. Open the pull request's **preview**. No preview? Check out the branch and run it locally with the dev command in `AGENTS.md`.
2. Confirm CI ran every `auto` check on the head commit.
3. Click through every **`agent`** check yourself, on desktop and phone sizes. Watch the browser console for errors.
4. **Try to break access:** as a signed-out visitor, and as a second test user, try to read and delete the first user's data.
5. Post one comment: `QA: pass @ <commit sha>`, or `QA: fail @ <commit sha>` with the failures grouped by cause.

**Smoke** (after a merge):
1. Open the **test environment** (the URL is in `AGENTS.md`), never production.
2. Run the main flow from `docs/vision.md`, plus the merged issue's `agent` checks.
3. Pass: tell the person "ready to try", with what you tested and 1–3 screenshots. Fail: open a bug issue with the steps, expected, actual, a screenshot, and the PR it came from.

## Rules

- Use whatever browser tool you have: a browser extension, Playwright, or your tool's built-in browser.
- Use test accounts and test data only. Never real personal data or payment details.
- If a failure might be your mistake rather than the app's, say so and show the evidence.
