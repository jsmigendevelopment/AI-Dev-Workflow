---
name: security-review
description: Secondary skill. Use as the second, independent reviewer after code review approves a PR - a fresh security audit of the diff for auth and access control, input validation, secrets, injection, data exposure, dependencies and abuse; run one effort level above the code reviewer, and on the strongest model when the change touches personal data or money.
---

# Security review: the second gate

Start fresh from **the issue and the diff.** Assume the code works, and look for how it could be abused.

## Check

1. **Who can do this?** Is every new route or action behind the right auth check? Can user A read or change user B's data? Return "not found" for other people's resources, not "forbidden."
2. **Input.** Is all input validated with a schema at the boundary? Are unknown fields rejected? Are there size limits?
3. **Injection.** SQL, HTML/XSS, shell commands, file paths, and anything that builds a query or command out of user input.
4. **Secrets.** Are keys, tokens or passwords in code, logs, error messages or the client bundle?
5. **Data exposure.** Do responses or logs include more than they need, like emails, IDs or internal errors and stack traces?
6. **Dependencies.** Is every new package maintained, popular enough, pinned, and under a licence you can use?
7. **Abuse and cost.** Rate limits on anything public. Could a bot run up a bill or spam a form?
8. **Money and personal data.** Payments, refunds, personal information, deletion. Apply extra care, and flag `needs-human` if you're unsure.

## Verdict

Post one comment on the PR, not a GitHub approval (the account that opened a PR can't approve it). The first line is `Security review: approve @ <commit sha>` or `Security review: request changes @ <commit sha>`, then numbered findings. A verdict covers that commit only. Each finding gives the file and line, the risk, how it could be exploited, and the fix. Mark how serious each one is: critical, high, medium or low.
