---
name: browser-test
description: Secondary skill. Use after a merge deploys to the test environment, or before telling the person a feature is ready - drives a real browser (a browser extension, Playwright, or your tool's built-in browser) through every changed feature using the issue's acceptance checks, on desktop and phone sizes, and reports ready or opens a bug issue.
---

# Browser test: prove it works before the person looks

The person shouldn't see a feature until an agent has used it in a real browser.

## Steps

1. **Find what changed.** Read the merged PR, its issue and the acceptance checks.
2. **Open the test environment,** not production.
3. **Click through every acceptance check** in a real browser. Use whatever you have: a browser extension, Playwright, or your tool's built-in browser. Check:
   - the happy path;
   - one or two edge cases (empty, too long, wrong input);
   - a phone-sized screen as well as desktop;
   - the browser console for errors.
4. **Check nothing nearby broke:** the main flow from `docs/vision.md`.
5. **Report.**
   - **Pass:** tell the person "ready to try," list what you tested, and attach 1–3 screenshots.
   - **Fail:** open a bug issue with the steps, what you expected, what happened, and a screenshot. Link the PR.

## Rules

- Never test against production unless the person says to.
- Never type real personal data or real payment details. Use test accounts and test cards.
