---
name: pr-security
description: Use to check a pull request or branch for security problems ("check this for security issues", "security review", "is this safe to merge", or a brief that says use pr-security) - a fresh audit of the diff against docs/security-policy.md for access control, input validation, secrets, injection, data exposure, dependencies, abuse and money; for risky-lane changes only; posts one verdict that names the commit.
---

# PR security: the gate for risky changes

Runs only on pull requests in the **risky lane** (auth, secrets, personal data, money, migrations, new dependencies, API contract changes).

Start fresh from **`docs/security-policy.md`, the issue and the diff** (`gh pr diff <n>`, run from main). **Don't read the description or the commit messages.** Assume the code works, and look for how it could be abused.

## Check

1. **Who can do this?** Every new route or action has the right auth check. User A can't read or change user B's data. Other people's resources return "not found", not "forbidden."
2. **Input:** validated with a schema at the boundary, unknown fields rejected, size limits in place.
3. **Injection:** SQL, HTML, shell commands, file paths, and anything built from user input.
4. **Secrets:** no keys, tokens or passwords in code, logs, errors or the client bundle.
5. **Data exposure:** responses and logs carry no more than they need.
6. **Dependencies:** maintained, pinned, and under a licence you can use.
7. **Abuse and cost:** rate limits on anything public. Could a bot run up a bill or spam a form?
8. **Money and personal data:** extra care. Flag `needs-human` if you're unsure.
9. **The policy:** anything that breaks a rule in `docs/security-policy.md`.

## Verdict

**One comment** whose first line is `Security review: approve @ <commit sha>` or `Security review: request changes @ <commit sha>`. Then numbered findings: the file and line, the risk, how it could be exploited, the fix, and the severity (critical, high, medium or low). A verdict covers that commit only. End the comment with the output of `node .agents/skills/coordinate/scripts/insights.mjs line job job=review-security pr=<pr> sha=<sha> outcome=<pass|fail> model=<model> effort=<effort> tool=<tool> usage_before=<usage-before> usage_after=<usage-after> usage_from=<usage-from> started=<started>`, pasted as printed, never typed by hand: `pass` for approve, `fail` for request changes. `<model>` and `<effort>` are what your own session shows, else `unknown`, with `model_from=<why>` added: where you looked. `<started>` is when you started this run, in UTC: run `date -u +%Y-%m-%dT%H:%M:%SZ` before your first step and keep it. The line's last line is the run line people read: job, model, effort, time and the commit (#129). `<usage-before>` and `<usage-after>` are the provider's usage reading as your tool shows it when you start and now, else `unknown`; never estimate one. `<usage-from>` says where you read it, or where you looked (quote it if it has spaces). Your tool shows each reading's window and reset time (`rate_limit_info` has `rateLimitType` and `resetsAt`)? Add `usage_window_before=<window>` and `usage_resets_before=<UTC time>` to the job line for the start reading, and `usage_window_after` and `usage_resets_after` for the end one. Leave out what it doesn't show; never estimate one (`../coordinate/references/insights.md`, "What a run cost"). On request changes, add `send_back=review-must` to the job line.
