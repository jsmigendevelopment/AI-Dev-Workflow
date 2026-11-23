# Security policy

The security reviewer reads this before every risky change. Keep it short and true.

## What's sensitive here

| Data or asset | Why it matters | Who may see or change it |
|---|---|---|
|  |  |  |

## Trust boundaries

Where untrusted input comes in: forms, API routes, webhooks, uploads, third-party calls.

- 

## Rules

- Every route checks auth. Other people's resources return "not found".
- All input is validated with a schema at the boundary. Unknown fields are rejected.
- No secrets in code, logs, errors or the client bundle.
- Public endpoints are rate-limited.
- Agents use test credentials only. Production keys stay with the person.

## Risks we accept, and why

| Risk | Why it's accepted | Revisit when |
|---|---|---|
|  |  |  |
