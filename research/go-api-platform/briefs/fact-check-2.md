# Brief: fresh-session fact-check

Received 2026-11-27 from the coordinator by the second fact-checker, a fresh session that never saw the author's thread. Committed with its results, since the session had no earlier commit to put it in. Verbatim below, except the path of the coordinator's local setup notes, which is left out.

---

You're a fresh fact-checker in the onRails build loop. **Use the `research` skill's fact-check step** (read `.agents/skills/research/SKILL.md` and its fact-check brief from fresh `origin/main`, and the branch's own `research/go-api-platform/briefs/fact-check.md`). First read the setup notes at (path left out) (read only) and follow them (REST-only GitHub; write nothing outside your own `mktemp -d` TMPDIR and this worktree; `set -u`; never run the real `claude` or `codex`). Owner rules: Opus only; no paid services; public repo: name no private projects, people or accounts. You are the "fresh session" issue #340's AC-340-3 asks for: you haven't seen the author's reasoning, only its files.

## The job: a fresh-session fact-check of pull request #384 (issue #340)

Branch `feat/340-research-workers-to-go`, head `170f055733df83eb2bfa3e30f0e43235b5e76e66`. Read issue #340 (AC-340-3 especially) and the dossier `research/go-api-platform.md` plus its store `research/go-api-platform/` (`claims.csv`, `sources.csv`, `fact-check.csv`, `provenance.json`). Don't read the PR description or the author's comments.

1. `git fetch origin feat/340-research-workers-to-go && git checkout -B feat/340-research-workers-to-go 170f055733df83eb2bfa3e30f0e43235b5e76e66`.
2. Re-check every claim the picks rest on (the seven Workers limits, Cloud Run vs Fly.io and the others compared, Neon/pgx/goose/sqlc, D1 over HTTP, Clerk's Go SDK and the golang-jwt/keyfunc fallback, every price and free-tier claim) by opening the cited source yourself (web fetch or search), and also look for one strong counter-source per pick. Record your results the way the store expects for a fresh-session fact-check (add rows to `fact-check.csv` marked as a separate session, and update `provenance.json` so the fact-check's model, session and date show it's independent). Fix any wrong claim with a new corrected row (keep old rows), update the dossier text if a pick or its confidence changes, and say so plainly.
3. Run `node .agents/skills/research/scripts/check-research.mjs research/ --base origin/main` and the repo's tests that scan `research/` and `docs/decisions/`; all pass.
4. Commit (end the message with the attribution lines in your system prompt, if any), push with `git push origin feat/340-research-workers-to-go` (no force). If the push is refused, stop and report it. Post one comment on #384: the claims re-checked, what changed, whether any pick changed, and that this is the fresh-session check AC-340-3 asks for.
5. Never merge, push to main, force-push or bump a version. Remove your TMPDIR and check nothing you started is running.

## Final report to me

New head sha, how many claims you re-checked, what you fixed, whether any pick or confidence changed, check results, and the comment URL.
