# Decisions

The kit's own decisions, one row each. Add a row the moment something is decided. Never delete a row: a new row replaces an old one, and the old one says so.

| # | Date | Decision | Options considered | Why | Originator |
|---|---|---|---|---|---|
| 1 | 2026-11-26 | No GitHub Actions, at all costs. Every check, gate, preview and deploy runs from the agent's session, and the loop never waits on a workflow. It replaces the 2026-11-24 rule, which avoided Actions on private repos only. (#98, #131) | Avoid Actions on private repos only; keep Actions with a local fallback; no Actions at all | Two private onRails apps stalled: every job failed in 0 steps on a billing error, and `coordinate` waited for CI. The owner: "my onrails apps keep getting stuck because of github actions, we need to avoid actions at all costs now." | person |
| 2 | 2026-11-26 | In the kit's own repo, a pull request needs one independent code review, run with the local checks. No separate security, QA or weakening review. (#131) | The app loop's reviews per lane; one code review with the local checks | The owner's call for the kit repo, recorded in #131. | person |
