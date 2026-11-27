# Brief: author

Committed before the first search, 2026-11-27. Two parts, verbatim: the coordinator's brief to this build session, then the goal of issue #340.

## The coordinator's brief (2026-11-27)

> Use the `research` and `build` skills. Do issue #340 on branch `feat/340-research-workers-to-go`: the research dossier and its decision file, in the folders the issue's Modules line names, as a pull request in this repo. Compare at least three options against evidence, cite dated sources, and record provenance and a re-check date, as the `research` skill says. Its fact-check step runs in a fresh sub-agent inside your session. The private research-library capture step needs a repo this session can't push to: skip it and say so in the PR (that's an FYI for the owner, not a wait). No paid services, no sign-ups, no real accounts. Read the issue and ALL its comments first.
>
> Automation level: Full. The owner's words (2026-11-26): "ok, go full automation mode. there is no such thing as needs human, just go with your recommendations. there should be nothing waiting on me, push it through".

## Issue #340's goal (as filed 2026-11-27)

> Run the `research` skill on four questions, so the Go pack is built on evidence, not habit:
> 1. **When does an app outgrow Workers?** Cloudflare's current limits (CPU time, wall time, memory, request size, subrequests, Cron and Queue limits), and what needs long-running processes, heavy compute, background workers or persistent connections. Turn it into a plain-words list of signs the grill can ask about, each with its dated limit.
> 2. **Where a Go service runs:** Cloudflare Containers, Fly.io, Railway, Google Cloud Run and a small VPS. Compare the free tier and the cost at idle and at small load, cold starts, regions, logs, a preview per pull request, and deploying from the session with a CLI (no workflow).
> 3. **The database from Go:** D1 over its HTTP API, Postgres (Supabase, Neon) and SQLite on a volume; the migration tool (goose, Atlas, golang-migrate); the query layer (sqlc and at least two others).
> 4. **Sign-in:** Clerk's Go SDK against plain JWKS verification (for example `lestrrat-go/jwx` or `golang-jwt`).

The owner's rule this serves (decision 344-1, the owner in #279, 2026-11-27): "if an app needs a backend, unless it's like a static content website or something like that is like, using TanStack Start or Next.js. But if it needs a backend, we shouldn't recommend TypeScript backends like we are right now. We should recommend Go." And: "unless it's running on Cloudflare workers, right?"

## What good looks like (the author's bar, written before the search)

- Vendor docs and pricing pages read as of 2026-11-27, each with its date or "no date on the page".
- At least three options per question, compared on the same columns.
- The kit's constraints: no GitHub Actions (checks and deploys run from the session with a CLI), the person pays nothing until they choose to, Clerk is the kit's sign-in on the web pack, D1 is the web pack's database, a beginner owner.
- A recommendation and a confidence per question, and what would change it.
- A re-check date of 3 months: prices and betas drive the answer.
