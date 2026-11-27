# Hypotheses

Written 2026-11-27, before the first search. One line each: what I expect, then what would prove it wrong. The dossier's "Hypotheses, checked" section says how each held up.

- **H1.** Workers' paid plan allows up to 5 minutes of CPU per request and 128 MB of memory per isolate; memory, not CPU, is the hard wall for most apps. *Wrong if* the CPU cap is lower, or memory is configurable above 128 MB.
- **H2.** Cloudflare Containers can run a Go binary but needs the paid Workers plan and has no free tier. *Wrong if* Containers has a free allowance on the free plan.
- **H3.** Fly.io no longer has a free tier for new accounts; it bills by the second with scale to zero. *Wrong if* a free allowance is listed for new sign-ups.
- **H4.** Google Cloud Run has the most generous always-free allowance of the five and scales to zero. *Wrong if* its free tier was cut or another host gives more.
- **H5.** Only Railway (and Fly through a CLI flag or script) gives a preview environment per pull request without a CI workflow. *Wrong if* Railway's PR environments need GitHub Actions, or none of them do it without the GitHub app.
- **H6.** D1's HTTP API is meant for admin use and is rate limited, so it is a poor main database for a Go service outside Workers. *Wrong if* Cloudflare documents it as a supported runtime path with no tight limit.
- **H7.** sqlc plus pgx plus goose is the common Go stack in 2026. *Wrong if* sqlc has stalled (no release in a year) or goose has.
- **H8.** Clerk's Go SDK verifies session tokens against cached JWKS without a network call per request, so it and plain JWKS verification cost the same at runtime. *Wrong if* the SDK calls Clerk's API on each verify.
