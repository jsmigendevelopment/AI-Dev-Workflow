# Go API platform: research dossier

<!-- From the research skill. The store lives in research/go-api-platform/ (references/desk-research.md).
     Each claim carries its ID from claims.csv and its label. Opinion says "I think". -->

**Date:** 2026-11-27. The status and the re-check date live in the index, `README.md`. Re-check in 3 months: prices, free tiers and fast-moving tools drive every answer here.

## The question

When does an app outgrow Cloudflare Workers, and when it does, where should its Go API run, with which database, migration tool, query layer and sign-in check?

**Why it matters:** decision 344-1 (the owner, 2026-11-27, in #279) says an app with a backend that isn't on Workers gets a Go backend with a TypeScript web frontend. The Go pack (#279's children: #352, #353, #354, #356) will bake in a host, a database and a sign-in check. Each is expensive to change once projects are built on it. And the `stack` grill needs a plain question that tells "Workers is fine" from "this needs Go".

**Constraints:** the kit's web pack runs TanStack Start on Workers with D1 and Clerk. No GitHub Actions: checks and deploys run from the agent's session with a CLI. The person pays nothing until they choose to, and signing up or paying is on the always-stop list. The owner is a beginner. The full bar is in `go-api-platform/briefs/author.md`, written before the first search.

**What good looks like:** primary sources read on 2026-11-27 with their page dates; at least three options per question compared on the same columns; a recommendation with its confidence; and what would change it.

**How to read the labels.** Each claim has an ID and a label, like `[c12 · read]`. The ID is its row in `go-api-platform/claims.csv`, which names its sources.

| Label | Means |
|---|---|
| `read` | Read in the vendor's own docs, pricing page, package page or the Go module proxy (`read-in-source`). |
| `vendor` | The vendor says so about its own product, and nobody independent tested it (`vendor-claim`). |
| `[inferred]` | My own reasoning or arithmetic from the claims next to it. Not a finding, and not in `claims.csv`. |

Every claim in this dossier is one of these. No claim rests only on a search snippet: where a search found a page, the page itself was read.

## Summary

| Question | Pick | Confidence |
|---|---|---|
| 1. When an app outgrows Workers | One grill question with seven signs (below). Any "yes" means a Go backend off Workers. Everything else stays on Workers. | **High** for the limits, **medium** for where the line sits |
| 2. Where the Go service runs | **Google Cloud Run**, deployed with `gcloud run deploy --source .` and previewed with tagged revisions. Fly.io is the runner-up. | **Medium** |
| 3. The database from Go | **Postgres on Neon**, through **pgx**, with **goose** migrations and **sqlc** queries. Not D1 over HTTP. | **High** against D1 over HTTP, **medium** for the rest |
| 4. Sign-in | **Clerk's Go SDK** middleware. golang-jwt v5 with keyfunc v3 is the no-SDK fallback. | **Medium** |

**The main reasons:** Cloud Run and Fly.io both cost $0 for a small app once a card is on file [c50, c52, c104, c33, c34 · read]. Cloud Run wins on a preview URL per change from the CLI alone [c55 · read], where Fly's own guide uses GitHub Actions [c38 · read], and on building Go with no Dockerfile [c54 · read]. Neon pairs with it: free, scales to zero, and a branch per preview from the CLI [c69, c71 · read]. Cloudflare's own docs call D1's HTTP API best for admin use, under a 1,200 requests per five minutes account-wide limit [c64, c66 · read].

## 1. When does an app outgrow Workers?

### The limits, as of 2026-11-27

All from Cloudflare's docs, page dates 2026-10-30 to 2026-11-25.

| Limit | Free | Paid ($5 a month minimum [c10 · read]) | Claim |
|---|---|---|---|
| CPU per HTTP request | 10 ms | 30 s by default, 5 min maximum | c1 |
| Wall time per HTTP request | no hard limit | no hard limit | c2 |
| Wall time per Cron Trigger or Queue consumer | 15 min | 15 min | c3 |
| Memory per isolate | 128 MB | 128 MB | c4 |
| Subrequests per invocation | 50 | 10,000 by default, up to 10 million | c5 |
| Connections waiting for a reply at once | 6 | 6 | c101 |
| Request body | 100 MB on a Free or Pro zone, 200 MB Business, up to 5 GB Enterprise | same | c7 |
| Worker size and startup | 64 MiB, 1 s | 64 MiB, 1 s | c8 |
| Cron Triggers per account | 5 | 1,000 | c9 |
| Requests | 100,000 a day | 10 million a month included | c10, c11 |
| Queue message, batch, throughput | 128 KB, 100 messages, 5,000 a second per queue | same | c12 |
| Durable Object | 1,000 requests a second soft limit; 1 GB storage per object | 10 GB storage per object (the page's table gives 10 GB with no plan split) | c14, c103 |
| Workflow step | 10 ms CPU | 30 s CPU by default, 5 min maximum; wall time unlimited | c16 |

**What Workers can't run.** Its first-class languages are JavaScript, TypeScript, Python and Rust. Go appears only as a language that compiles to WebAssembly [c17 · read]. So no native binary such as `ffmpeg` or a headless browser runs in a Worker [inferred]. Cloudflare itself points such work at Containers: "any programming language", apps that need "CPU cores running in parallel, large amounts of memory or disk space", or "a full filesystem, specific runtime, or Linux-like environment" [c20 · read].

**What is not a sign, though it sounds like one.** I think these belong in the grill's notes so it doesn't push an app off Workers by mistake [inferred from the claims named]:
- Long waits on other services. Wall time for HTTP requests has no hard limit; only CPU counts [c2 · read].
- WebSockets and real-time. Durable Objects keep clients connected while hibernating, without duration charges [c15 · read].
- A Postgres or MySQL database elsewhere. Hyperdrive connects Workers to it, on Free and Paid [c19 · read], and outbound TCP works with `connect()` [c18 · read].
- Background jobs, schedules and multi-step flows. Cron Triggers, Queues and Workflows cover them, with 15 minutes per cron or queue run and unlimited wall time per Workflow step [c3, c16 · read].

### Options

| Option | Strengths | Weaknesses | Cost | Fit |
|---|---|---|---|---|
| **A. Stay on Workers (TypeScript backend).** | One platform, one CLI, the web pack as it is. Cheap: $5 a month covers a lot [c10 · read]. | The hard walls: 128 MB, 5 min CPU, no native binaries, 6 connections waiting at once [c1, c4, c101, c17 · read]. | Free, then $5 a month. | Right for most apps. Decision 344-1 keeps TypeScript here. |
| **B. Workers plus a Cloudflare Container for the heavy part.** | Same account and CLI. Up to 12 GiB and 4 vCPU per instance [c24 · read]. GA since 2026-04-13 [c21 · read]. | Needs Workers Paid [c22 · read]. A Worker and a Durable Object sit in front of every container [c27 · read], so the app has two backends. No built-in autoscaling yet [c26 · read]. | $5 a month plus usage. | Good for one heavy job beside a Workers app. Under decision 344-1 the container could hold Go. |
| **C. A Go service on another host.** | No Workers limits at all. Decision 344-1's default for any backend off Workers. | A second vendor, a second bill, a second deploy. | See question 2. | The pick when a sign is hit. |

### The grill question (AC-340-2)

**Pick: one question, with the signs as a checklist. Any "yes" means a Go backend off Workers (option C).** Confidence **high** that each sign is a real wall (each is a documented limit), **medium** that this is where the line should sit: I found no study of which limit apps hit first.

> **Will any part of your app need one of these?** (Limits from Cloudflare's docs, read 2026-11-27.)
> 1. **Heavy number-crunching in one go:** more than 5 minutes of pure computing for one request, or more than 15 minutes for one scheduled or queued job. Think video encoding, big reports, training a model. [c1, c3]
> 2. **Lots of memory at once:** more than 128 MB held in memory, like a large image, a big spreadsheet or an AI model loaded whole. [c4]
> 3. **A program that isn't JavaScript, TypeScript, Python or Rust:** a tool like `ffmpeg`, a headless browser, LibreOffice, or a library that only exists for Go, Java or .NET. [c17, c20]
> 4. **Huge uploads in one request:** files over 100 MB sent straight to your server. [c7]
> 5. **Many calls at once from one request:** more than 6 calls to other services waiting for a reply at the same time. [c101]
> 6. **A server that never stops:** a game server, a raw TCP or UDP service, or one process that keeps state in memory for hours. [c18, c20] Inbound TCP to Workers is only in public beta [c18 · read].
> 7. **A big single database:** more than 10 GB in one database, D1's ceiling on the paid plan. [c67]
>
> Live updates, websockets, scheduled jobs, queues and an existing Postgres database are all fine on Workers.

**What would change the answer:** Cloudflare raising the 128 MB memory or the 5 minute CPU cap, or Go becoming a first-class Workers language. A study showing which limit apps hit first would firm up the line.

## 2. Where does a Go service run?

### Compared

Prices as listed on 2026-11-27. "Small load" here means one small instance serving a few requests a minute.

| | Cloudflare Containers | Fly.io | Railway | Google Cloud Run | Small VPS |
|---|---|---|---|---|---|
| **Free tier** | None: needs Workers Paid, $5 a month [c22 · read] | $1 once, no card, expires in 7 days; $5 of usage a month with a card [c33 · read] | $1 of usage a month, no card; $5 once on Trial [c42 · read] | 180,000 vCPU-s, 360,000 GiB-s, 2 million requests a month [c50 · read]; $300 trial for 90 days needs a card [c53 · read] | None found |
| **Cost at idle** | $5 a month; container stops after its Durable Object goes idle [c22, c27 · read] | Stopped Machine: $0.15 per GB of root filesystem a month [c35 · read] | Sleeps after 5 to 10 minutes idle [c47 · read] | $0: idle instances that aren't minimum instances aren't charged [c52 · read] | Always on: EUR 5.49 to 6.49 a month at Hetzner, $4 at DigitalOcean [c59, c61 · read]. Both Hetzner plans read were marked unavailable [c58, c105 · read] |
| **Small load** | About $6.75 a month for a lite instance always on, nearly $5 if it sleeps [inferred from c22, c24, c100] | $2.19 a month for 256 MB always on [c34 · read], inside the $5 monthly usage with a card [inferred from c33] | Hobby $5 a month includes $5 of usage [c43 · read]; 256 MB always on is about $2.50 of RAM [inferred from c44] | $0 inside the free tier [inferred from c50, c51] | Same as idle |
| **Cold start** | "often in the 1-3 second range", depending on image size and code start-up [c102 · vendor] | "about 2 seconds or more"; a few hundred ms from suspend [c37 · vendor] | "a small amount of time", no number [c47 · read] | No number found; minimum instances avoid it [c52 · read] | None: always on |
| **Regions** | Region:Earth, no choice described [c32 · read] | 17 [c39 · read] | 4 [c48 · read] | Many, listed by price tier (not counted) | Hetzner: Germany, Finland, Singapore, USA [c60 · read] |
| **Logs from a CLI** | Billed on Observability pricing from 2026-12-01 [c31 · read] | `fly logs`; 7 days of search [c40 · read] | `railway logs` [c46 · read] | `gcloud run services logs read` [c57 · read] | Whatever the person sets up |
| **Preview per pull request** | `wrangler preview` per branch, with its own containers [c30 · read] | Fly's guide uses a GitHub Actions workflow [c38 · read] | PR environments open with each GitHub pull request; the page doesn't say how Railway is connected [c45 · read]. `railway environment new` from the CLI [c46 · read] | `--no-traffic --tag` gives each revision its own URL from the CLI [c55 · read] | None built in |
| **Deploy from the session, no workflow** | `wrangler deploy`; Docker needed when the image is a Dockerfile [c28 · read] | `fly launch` writes a Dockerfile, then `flyctl deploy` [c41 · read] | `railway up`; Railpack builds Go from `go.mod` [c46, c49 · read] | `gcloud run deploy --source .`, no Dockerfile needed [c54 · read] | Kamal over SSH; Docker installed on the server [c62 · read] |
| **Notable limits** | No autoscaling yet; disk ephemeral [c26 · read] | | | Request timeout up to 60 minutes [c56 · read] | Hetzner's CX23 and CPX02 were both "currently unavailable" [c58, c105 · read] |

**Cloudflare Containers at small load, worked out** [inferred]: a lite instance (256 MiB) on for a 730-hour month uses about 182 GiB-hours of memory, 157 above the 25 included, so about $1.42. Its 2 GB disk uses 1,460 GB-hours, 1,260 above the 200 included, so about $0.32. CPU is billed only while used [c100 · read]. Total about $6.75 with the $5 plan.

### Recommendation

**Pick: Google Cloud Run.** **Confidence: medium.**

Why [each step cites its claims]:
- It costs $0 at idle and at small load: a monthly free tier of usage [c50 · read] and no charge for idle instances [c52 · read]. Fly also reaches $0, but through a $5 monthly credit that an always-on instance draws down [c33, c34 · read; inferred]. The person pays nothing until the app has real traffic.
- It builds a Go app from source with no Dockerfile [c54 · read]. The agent needs no Docker in its sandbox.
- A preview per change works from the CLI alone: deploy with `--no-traffic --tag pr-12` and test the tagged URL [c55 · read]. That fits the kit's no-Actions rule.
- A request can run for up to 60 minutes [c56 · read].

**What holds it at medium:**
- Google needs a payment method for its free trial [c53 · read], and a billing account to use the Free Tier at all [c104 · read]. A card on file is a step the person must take (their own login), even at $0.
- Google Cloud's setup (a project, billing, APIs to turn on) is heavier for a beginner than Fly's or Railway's. Not measured here.
- Preview revisions share the service's settings. Pointing each at its own Neon branch needs per-revision environment variables, which I did not verify [inferred].
- No cold start figure was found for Cloud Run.

**Runner-up: Fly.io.** Simpler for a beginner, $2.19 a month for an always-on instance that fits inside the monthly $5 of usage once a card is added [c33, c34 · read], and a volume for SQLite [c35 · read]. It drops to second because its own per-PR previews are built on GitHub Actions [c38 · read], and a CLI-only path was not found on the pages read. Both hosts need a card for $0 use [c33, c104 · read].

**When to pick something else:**
- **Cloudflare Containers** when the person already pays for Workers Paid and the Go part is one heavy job beside a Workers app (option B in question 1). Its per-branch `wrangler preview` [c30 · read] and one-vendor setup are real strengths. It isn't the default because it costs $5 a month from day one [c22 · read], has no autoscaling yet [c26 · read], and puts a Worker and a Durable Object in front of the Go service [c27 · read].
- **Railway** when the person wants a dashboard and accepts $5 a month; its free plan's $1 a month [c42 · read] doesn't cover an always-on instance [inferred from c44].
- **A VPS** only for steady load where a fixed EUR 5 to 6 a month beats usage billing [c59 · read], and the person accepts running a server.

**What would change the answer:** Google cutting the Cloud Run free tier or charging for idle; Fly adding a CLI-only preview path or a card-free monthly allowance; Cloudflare adding Containers to the Free plan.

## 3. The database from Go

### Where the data lives

| Option | Strengths | Weaknesses | Cost | Fit |
|---|---|---|---|---|
| **A. D1 over its HTTP API** | Same database as the web pack. An official endpoint [c63 · read] and a Go client method [c68 · read]. | Cloudflare calls the REST API best for admin use [c64 · read] and the control plane [c65 · read]. The global API limit is 1,200 requests per five minutes per user [c66 · read], about 4 a second for the whole account [inferred]. | Free up to 500 MB [c67 · read]. | **Poor** as an app's main database. |
| **B. Postgres on Neon** | Free: 1 GB per project, 100 CU-hours, 10 branches, scales to zero after 5 minutes [c69 · read]. A branch per preview from the CLI [c71 · read]. Pay as you go with no minimum [c70 · read]. pgx is a maintained pure-Go driver [c85 · read]. | Scale to zero means a first-query wake-up (time not measured here). 1 GB on Free. | $0, then usage. | **The pick.** |
| **C. Postgres on Supabase** | 500 MB free with auth and storage around it [c72 · read]. | Free projects pause after a week idle; 2 active projects; branches cost $0.01344 an hour; Pro from $25 a month [c72, c73 · read]. | $0, then $25 a month. | Fair. The pause hurts a test app nobody opens for a week. |
| **D. SQLite on a volume** | No database server. A pure-Go driver, no cgo [c76 · read]. Litestream is active (v0.5.18, 2026-11-03) [c75 · read]. | Needs a persistent disk, so not Cloud Run or Containers, whose disk is ephemeral [c26 · read]. LiteFS is outside Fly's support and pre-1.0 [c74 · read]. One machine only, and no branch per preview. | Fly volume $0.15 per GB a month [c35 · read]. | Good on Fly or a VPS; not with the Cloud Run pick. |

**Pick: Postgres on Neon, through pgx.** **Confidence: high** that D1 over HTTP is the wrong main database (Cloudflare's own words [c64 · read]); **medium** for Neon over Supabase (on free-tier terms, not measured performance).

### The migration tool

| Tool | Strengths | Weaknesses | Fit |
|---|---|---|---|
| **goose** | SQL or Go migrations; Postgres, SQLite, Turso and more; MIT; released 2026-11-25 [c78 · read]. One file per migration with an optional Down section; `goose down` rolls back one [c99 · read]. | Go-function migrations tie a migration to the binary [inferred]. | **The pick.** |
| **golang-migrate** | MIT; up and down files; drivers for Postgres, pgx v5 and SQLite; a CLI [c79 · read]. | Two files per migration [c79 · read]. Released 2026-09-09, less recent than goose [c79, c78 · read]. | Good fallback. |
| **Atlas** | Active (v1.4.0, 2026-11-17) [c82 · read]; declarative schemas. | The Apache 2.0 Community Edition lacks `down`, `checkpoint`, `rebase` and drift detection [c81 · read]. The full binary is under the Atlas MSA, and Pro ($9 per developer a month plus usage) adds automated CI/CD; the pricing page disagrees with itself on whether linting is Pro-only [c81, c106 · read]. | Poor: the free open build drops features, and the rest needs a login or a plan. |

**Pick: goose.** **Confidence: medium.** Plain SQL files with Up and Down in one file are the easiest for an agent and a beginner to read.

### The query layer

| Library | What it is | Last release | Fit |
|---|---|---|---|
| **sqlc** | Generates type-safe Go from SQL; MIT [c83 · read]. PostgreSQL and MySQL stable, SQLite beta [c107 · read]. | 2026-04-22 [c83 · read] | **The pick**, on pgx. |
| **pgx used directly** | Pure Go Postgres driver with a pool; MIT [c85 · read]. | 2026-11-11 [c85 · read] | The driver under sqlc. Hand-written queries lose the types. |
| **sqlx** | Extensions on `database/sql`; MIT [c84 · read]. | 2024-04-15: none in over two years [c84 · read] | Poor: stalled. |
| **GORM** | A full ORM; MIT [c86 · read]. | 2026-06-22 [c86 · read] | Fair. Hides the SQL an agent should see. |
| **Bun** | SQL-first ORM for PostgreSQL, MySQL, MSSQL, SQLite, Oracle; BSD-2-Clause [c87 · read]. | 2026-10-01 [c87 · read] | Fair. |
| **Ent, Jet** | Not read beyond their versions. | 2026-03-17, 2026-10-06 [c88 · read] | Not judged. |

**Pick: sqlc on pgx.** **Confidence: medium.** SQL stays SQL, which agents write well, and the generated code is typed. I think sqlc's seven months since its last release is fine for a code generator, but it is the oldest of the picks.

**What would change the answer:** Cloudflare documenting a supported data-plane path to D1 from outside Workers; Neon cutting its free tier or ending scale to zero; sqlc going a year without a release.

## 4. Sign-in from Go

| Option | How it gets Clerk's key | Strengths | Weaknesses | Fit |
|---|---|---|---|---|
| **A. Clerk's Go SDK** (`clerk-sdk-go/v2`, v2.10.0, 2026-11-23 [c92 · read]) | Fetches the JWK from the Clerk API and caches it for one hour [c93 · read]. | Official, MIT, Go 1.24+; ready middleware that returns 403 without a valid session [c91 · read]. Leeway for clock skew and an `azp` check built in [c94 · read]. The same SDK calls Clerk's Backend API when the app needs user data [inferred]. | A vendor SDK in the API. It needs the Clerk secret key on the server [c109 · read]. One key fetch an hour to Clerk. | **The pick.** |
| **B. golang-jwt v5 with keyfunc v3** | Reads the JWKS from the Frontend API URL plus `/.well-known/jwks.json` [c108 · read]. | No vendor SDK, and no secret key needed just to check tokens [inferred from c108]. keyfunc refreshes the key set and refetches on an unknown `kid` [c98 · read]. golang-jwt has leeway, audience and algorithm options [c97 · read]. MIT and Apache-2.0. | The app must check `azp`, `exp` and `nbf` itself, as Clerk's guide lists [c90 · read]. | Good fallback. |
| **C. lestrrat-go/jwx** | Same JWKS URL [c108 · read]. | v3's `jwk.Cache` refreshes in the background [c95 · read]. MIT. | v4.7.0 shipped on 2026-11-27 and moved the cache to a separate `jwkfetch` module [c96 · read]: a moving target today. | Poor for now. |

**Pick: Clerk's Go SDK middleware.** **Confidence: medium.** It does the checks Clerk's own guide asks for [c90 · read] without the app writing them, and its one-hour key cache means verification makes no network call per request [c93 · read]. It costs one more secret on the server [c109 · read], which a backend that reads Clerk user data needs anyway [inferred]. golang-jwt plus keyfunc is the fallback if the SDK's API churns, or if the Go service should hold no Clerk secret.

**What would change the answer:** a Clerk SDK major version that breaks the middleware; Clerk changing where its keys live.

## Hypotheses, checked

From `go-api-platform/hypotheses.md`, written before the first search.

| | Hypothesis | Result |
|---|---|---|
| H1 | Paid Workers: 5 min CPU, 128 MB memory; memory is the wall. | **Held.** 5 min CPU [c1], 128 MB on both plans and not configurable on the page [c4]. Which wall apps hit first: not found. |
| H2 | Containers run Go but need Workers Paid, no free tier. | **Held.** [c20, c22] |
| H3 | Fly has no free tier for new accounts; scales to zero. | **Partly wrong.** $1 once with no card, and $5 of usage a month with a card [c33]. Scale to zero held [c36]. |
| H4 | Cloud Run has the most generous always-free allowance and scales to zero. | **Held** among these five [c50, c52]. Railway's $1 a month needs no card [c42]. |
| H5 | Only Railway (and Fly by CLI) do previews per PR without a workflow. | **Wrong.** Cloud Run tags [c55] and Cloudflare's `wrangler preview` [c30] do it from the CLI. Fly's guide uses GitHub Actions [c38]; Railway's PR environments open with each GitHub pull request, set up in its dashboard [c45]. |
| H6 | D1's HTTP API is for admin use and rate limited. | **Held.** [c64, c65, c66] |
| H7 | sqlc, pgx and goose are current. | **Held.** All released in 2026 [c78, c83, c85]. |
| H8 | Clerk's Go SDK verifies against cached keys, no call per request. | **Held.** Cached for one hour [c93]. |

## Gaps

- **No measurements.** No cold start, wake-up or query time was measured: no accounts, by the rules. Cold start numbers are the vendors' own [c102, c37].
- **Cloud Run:** no cold start figure; regions not counted; per-revision environment variables for previews not verified (the traffic page doesn't mention them).
- **Railway:** whether PR environments need its GitHub app, and on which plans, is not on its environments page [c45].
- **Fly:** a CLI-only review app path was not read; only the Actions guide [c38].
- **Containers:** no per-container connection or body limits found; logging details beyond pricing not read.
- **Turso / libSQL:** not compared. Its Go client has no tagged release on the module proxy (a 2026-05-28 pseudo-version), checked but not logged as a claim.
- **Ent, Jet, sqlx's databases, GORM's databases:** READMEs not read.
- **jwx options** for `azp` and leeway not read.
- **GitHub pages:** release pages and the GitHub API were refused in this sandbox (s99). Versions and dates come from the Go module proxy (s67 to s84), which records the tag and its time.

## Fact-check

The research skill asks for a fresh session. The coordinator told this builder it could not start one, so the author's own session ran it as a separate pass after the dossier was written, under `go-api-platform/briefs/fact-check.md`: it re-fetched every source named in `claims.csv` and checked each claim word for word. That is weaker than a fresh session on another model, and the pull request says so. The findings and what was done with each are in `go-api-platform/fact-check.csv`.

**What it found:** 22 findings: 11 fixed, 1 disputed, 10 accepted. No pick changed, but Cloud Run's case is narrower: Fly.io also costs $0 for a small app once a card is on file, so the lead rests on CLI-only previews and builds with no Dockerfile. The fixes: the six-connection limit counts only calls waiting for a reply [c101]; Durable Object storage is 1 GB on Free [c103]; Cloud Run's Free Tier needs a billing account, which closes a gap [c104]; both Hetzner plans were out of stock [c105]; Atlas's pricing page disagrees with itself on linting [c106]; sqlc's SQLite support is beta [c107]; Clerk's key sources were reworded [c108]; and Clerk's Go SDK needs the secret key [c109], now a stated trade-off. Railway's PR environments and the container cold start were reworded to match their pages. The one dispute: a second read of Fly's Go guide said it never mentions a Dockerfile; the page's own intro does. Corrected claims are new rows in `claims.csv` (c101 to c109); the old rows stay.

## Provenance

The model, effort, harness and dates for every role are in `go-api-platform/provenance.json`. Each role's brief is in `go-api-platform/briefs/`, verbatim. The first session's helper briefs were never sent: the second author did the reading itself.
