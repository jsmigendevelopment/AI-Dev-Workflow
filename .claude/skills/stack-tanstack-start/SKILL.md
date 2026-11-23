---
name: stack-tanstack-start
description: Use when slice 0 sets up a TanStack Start app from the stack pack, or when building in an app made from it - applying the starter with degit, renaming or deleting the example notes module, adding a module, page, server function, Drizzle table and D1 migration or shadcn/ui component, wiring Clerk auth or Turnstile, changing a security header, the CSP, a rate or body limit, a bundle budget or the crawler policy, the test and production environments, deploys, rollbacks and pull request previews, the versioned /api/v1 HTTP API with Clerk bearer tokens, the Coming soon page and going live, protecting the test and preview URLs with Cloudflare Access or a password, Bot Fight Mode, running setup-cloudflare, and avoiding the known traps of Start on Cloudflare Workers with D1.
---

# Stack pack: TanStack Start on Cloudflare Workers

The pack is `stacks/tanstack-start/` in this kit. TanStack Start, shadcn/ui and Tailwind, Drizzle on D1, Zod, TanStack Query, Clerk, Vitest and Playwright, ESLint with a boundary check, CI. It follows `docs/architecture.md`, with one addition: each module's server folder also has a `<feature>.controller.ts` (see Conventions). It starts secure, fast, accessible and search-ready, with no keys needed (see On by default).

## Slice 0: apply the pack

1. In the new project folder: `npx degit jsmigendevelopment/AI-Dev-Workflow/stacks/tanstack-start .`
2. If degit fails, use a sparse clone:
   ```sh
   git clone --depth 1 --filter=blob:none --sparse https://github.com/jsmigendevelopment/AI-Dev-Workflow.git /tmp/kit
   git -C /tmp/kit sparse-checkout set stacks/tanstack-start
   cp -R /tmp/kit/stacks/tanstack-start/. . && rm -rf /tmp/kit
   ```
3. Set `name` in `package.json`, and the Worker and database names in `wrangler.jsonc` (`app`, `app-test`, `app-production`, top level and in each `env` block), and the site's name and description in `src/lib/site.ts`, then `pnpm icons` to redraw the icons and share image (replace `public/favicon.svg` first if there is a logo). Run `pnpm install`, `pnpm check`, `pnpm check:budgets`, then `pnpm exec playwright install chromium` and `pnpm test:e2e`. All must pass before you change anything.
4. The example module: rename `notes` to the core resource, or delete it. To delete, remove `src/modules/notes/`, `src/routes/notes.tsx`, its factory in `src/server/composition.ts`, the header link, `/notes` in `e2e/helpers.ts` and in the budgets and Lighthouse URLs. Either way, while no migration has run outside your laptop, delete `migrations/` and run `pnpm db:generate` again.
5. Fill in "Commands that work here" in `AGENTS.md` from the pack's README. The pack's `.github/workflows/ci.yml` replaces the kit template.
6. Ask the person for the production URL; it becomes `SITE_URL` (a variable on the GitHub `production` environment, read at build time). Accounts, keys and the first production deploy stay with the person: ask them.
7. Cloudflare, once the repo is on GitHub (after `setup-github.mjs`): run `node scripts/setup-cloudflare.mjs --dry-run`, show the person the output, and run it without `--dry-run` only after a yes (see Environments and deploys). The dry run lists three ways to protect the test and preview URLs and, with a custom domain, Bot Fight Mode: ask the person which (Access is the recommendation), and for Access ask for the email that should get the one-time PIN. Never write that email to a file.
8. Production starts on the "Coming soon" page. Tell the person, in plain words, that nobody sees the app on the real address until they say go live (see Coming soon and going live).

## On by default

| Area | What | Where |
|---|---|---|
| Headers | HSTS (no `preload`), nosniff, Referrer-Policy, Permissions-Policy, COOP, a CSP baseline, on every response | `src/lib/security-headers.ts` (Worker) and `public/_headers` (static files); a unit test keeps the two equal |
| CSP | HTML: `script-src 'self' 'nonce-…'`, a fresh nonce per response, Clerk and Turnstile origins only when their keys are set | `pageCsp()` in `src/lib/security-headers.ts`, `src/server/request-guards.ts`, `ssr.nonce` in `src/router.tsx` |
| Limits | Server function and `/api/v1` calls: 64 KiB body cap (413; 411 with no length) and 100 a minute per IPv4 or IPv6 /64 (429, `Retry-After`). Other server routes bound their own body | `src/lib/request-limits.ts`, `ratelimits` in `wrangler.jsonc`, `src/server/request-guards.ts` |
| Errors | One envelope. Guards answer with it; a crashed server function answers `internal`; `call()` turns anything into an `AppError` with a safe message | `src/lib/app-error.ts`, `src/lib/api-call.ts` |
| Env | Zod schema for every variable; a malformed value or half-set pair fails `pnpm dev`, `pnpm build` and the Worker's first request, naming variables, never values | `src/lib/env-schema.ts`, `src/server/env.ts`, `.env.example` |
| Spam | CSRF on server functions; Turnstile on the note form, lazy (loads on first focus), off without keys | `src/start.ts`, `src/server/turnstile.ts`, `src/hooks/use-turnstile.ts` |
| Launch | Production starts **not launched**: every page is a small "Coming soon" page with the app's name (200, `noindex`, no script, light and dark), robots.txt is `Disallow: /`, sitemap.xml and llms.txt are 404, server functions, `/api/v1` and writes answer 503 `unavailable`. Local dev, test and previews are launched | `LAUNCHED` per environment in `wrangler.jsonc` (validated in `src/lib/env-schema.ts`), `src/lib/launch.ts`, `src/lib/plain-page.ts` |
| Test site | The person's choice in setup-cloudflare: Cloudflare Access (one-time PIN for the person, a service token for CI), a password page, or none. Recorded as `SITE_PROTECTION` in `env.test.vars` | `scripts/cloudflare/setup.ts`, `src/lib/site-gate.ts`, `src/lib/open-paths.ts`, `e2e/gate.ts` |
| Bots | Scanner paths (`.php`, `/wp-`, `/.env`, `/.git`) get a plain-text 404 with no render; robots.txt welcomes search and AI search, disallows AI training and the `__usage_ai-training` token | `SCANNER_PATH` in `src/lib/request-limits.ts`, `src/lib/seo-files.ts` |
| SEO | `pageHead()` (title, description, canonical, Open Graph, Twitter), JSON-LD on `/`, sitemap.xml, robots.txt and llms.txt answered by the Worker (`assets.run_worker_first`, so a not-launched site can refuse crawlers), a build-time security.txt, icon set and share image, a real 404 status, `noindex` on app pages and on every host but production and localhost | `src/lib/seo.ts`, `src/lib/site.ts`, `src/lib/site-url.ts`, `src/lib/seo-routes.ts`, the `seoFiles` plugin in `vite.config.ts` (dev) |
| Speed | Budgets in CI, Lighthouse CI, hashed assets cached a year, HTML `private, no-cache`, Clerk's SDK loaded only with keys, preload on intent, system fonts, `ResponsiveImage` for images | `scripts/budgets/`, `lighthouserc.cjs`, `src/components/responsive-image.tsx` |
| Access | Skip link, `outline` focus in the text colour, reduced motion, focus moves to the new `h1` after a client navigation, the form error pattern, axe on every route in both themes on desktop and phone | `src/routes/__root.tsx`, `src/styles.css`, `src/components/route-focus.tsx`, `note-create-form.tsx`, `e2e/a11y.spec.ts` |
| Theme | Dark mode with no flash: an inline script sets `data-theme` before first paint and handles the toggle before hydration | `src/lib/theme.ts`, `src/components/theme-toggle.tsx`, tokens in `src/styles.css` |
| Quality | Dependabot (weekly, grouped, npm and Actions, 7-day cooldown), CI cancels stale runs, `pnpm audit --audit-level=high`, licence allow-list, lefthook pre-commit (Prettier and ESLint on staged files), a dev container | `.github/`, `scripts/check-licenses.ts`, `lefthook.yml`, `.devcontainer/` |

What the e2e suite proves: `e2e/api.spec.ts` (every `/api/v1` route is 401 without a valid bearer token, a cookie alone never signs in, 405 for other methods, 413 before auth, 429), `e2e/security.spec.ts` (headers on every path, nonce on every inline script, zero CSP violations and console errors per route, cache headers, scanner 404s, 413, 411, 429, CSRF, no Turnstile request without keys, the build-time files), `e2e/seo.spec.ts` (metadata in the server HTML, noindex, unique titles, icons, no theme flash), `e2e/a11y.spec.ts` (axe at rest, in the form's error states and on hover and focus; skip link, focus, navigation focus, reduced motion, reflow at 320 by 256), `e2e/coming-soon.spec.ts` (a preview of the same build with `LAUNCHED=false`: the page on every path, noindex, no script, robots, 503s, axe in both themes, desktop and phone), `e2e/site-gate.spec.ts` (a preview with the password gate: 401 page, the header, the cookie's flags, axe with and without the error, the rate limit). The three previews run on ports 4173 to 4175; `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` makes `vite preview` take vars from the shell.

**Browsers.** Playwright is the test runner and the gate. A person's own browser (for example Claude in Chrome) is used only after Playwright passes, to look at something a test can't judge, never instead of a test.

## Environments and deploys

| Where | Worker | D1 | How it gets there | GitHub environment |
|---|---|---|---|---|
| local | none | `app`, local | `pnpm dev`, tests | |
| test | `app-test` | `app-test` | every push to main, `deploy-test.yml` | `test` |
| previews | aliases of `app-test` | `app-test` | every pull request, `preview.yml` | `preview` |
| production | `app-production` | `app-production` | Run workflow on `deploy-production.yml`, then the person approves | `production` |

- **Test:** build, migrate test D1, deploy, `pnpm test:deployed` (smoke, a11y, API) against the URL, with the protection's headers from the environment's secrets; on failure `wrangler rollback` and an issue labelled `needs-human`.
- **Previews:** `wrangler versions upload --preview-alias pr-<n>` on the test Worker, one PR comment kept up to date. Test D1 and test keys, never migrated (the comment warns when the PR adds a migration). A quick check that the preview answers 200, with the protection's headers. Skipped for forks, Dependabot and `lane:tiny`.
- **Production:** build, D1 Time Travel bookmark (refuses to migrate without one), migrate, deploy, smoke on the workers.dev URL (outside the zone, so Bot Fight Mode never challenges it): `pnpm test:coming-soon` while `env.production.vars.LAUNCHED` is "false", `pnpm test:deployed` once it is "true"; on failure roll back the code and print `wrangler d1 time-travel restore DB --bookmark=<b> --env production -c wrangler.jsonc`. Restoring data is always the person's call (always-stop list).
- Each workflow has its own concurrency group and never cancels a deploy half-way. Secrets by name: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and in `test` and `preview` the protection's `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` or `SITE_PASSWORD`; variables `SITE_URL` (production) and `APP_URL` (where to smoke-test when there is no workers.dev URL).
- A rollback restores code, not data: write migrations that the previous release also works with (add first, remove in a later release).

**setup-cloudflare** (`scripts/setup-cloudflare.mjs`, logic and tests in `scripts/cloudflare/`): dry run first, then ask. It checks `wrangler whoami` (not signed in: the person runs `pnpm exec wrangler login`), creates the D1 databases and writes their ids into `wrangler.jsonc`, creates the R2 buckets and queues that add-ons declared, prints `CLOUDFLARE_ACCOUNT_ID` and sets it in the `test`, `production` and `preview` GitHub environments, prints the deploy token's permissions and the `gh secret set` commands the person types the token into, runs the kit's `push-secrets.mjs --wrangler`, and, with a custom domain and a zone token (`CLOUDFLARE_ZONE_TOKEN` in `.env.cloudflare.local`), sets Always Use HTTPS, TLS 1.2+, AI training Disallow and a WAF rule for scanner paths. Then the test and preview protection (below). Idempotent; reads run in a dry run too, writes never.

- **Bot Fight Mode** (`--bot-fight-mode`): recommended once the production custom domain exists, the person's call. It is zone-wide (test and previews are on workers.dev, outside any zone). The page CSP allows its same-origin `/cdn-cgi/challenge-platform/` and `/cdn-cgi/bm/` for script and connect, on the `SITE_URL` host only (`botChallengeOrigin` in `src/lib/security-headers.ts`); Cloudflare's docs say it adds the response's CSP nonce to the script it injects. It can't be skipped per path and it strips ETags. The trade-off: production's workers.dev URL stays on for the smoke test, so it skips the zone's bot settings (it is noindex, and the rate limits still apply). Managed robots.txt stays off (`--managed-robots`): it would duplicate the app's own.

### Protecting the test and preview URLs

The test Worker's workers.dev URL and every preview URL are public by default (always `noindex`). Ask the person which of three, then run setup-cloudflare with it; the choice is written to `SITE_PROTECTION` in `env.test.vars` (commit it).

| | `--protect access --access-email <email>` (recommended) | `--protect password` | `--protect none` |
|---|---|---|---|
| What | Cloudflare Access in front of the whole test Worker: workers.dev, previews, routes, static files | a password page in the app, test and previews only | nothing |
| People | a one-time PIN by email to that address (asked at setup, never written to a file) | one random password (`SITE_PASSWORD`, 32 URL-safe characters, never the repo name), shown once; an HttpOnly, Secure, SameSite=Lax session cookie holding an HMAC of it | |
| CI and agents | `CF-Access-Client-Id` and `CF-Access-Client-Secret` from GitHub secrets `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (a service token, Service Auth policy) | `x-site-password: <password>` from the secret `SITE_PASSWORD`; never `Authorization` (`/api/v1` reads Bearer tokens) | |
| Needs | Zero Trust on the account (Free plan; it can ask for a payment method, so that is the person's call) and an account token in `CLOUDFLARE_ACCESS_TOKEN` with Access: Apps and Policies, Service Tokens, and Organizations, Identity Providers, and Groups (all Edit) and Workers Scripts Read. The test Worker must be deployed once | nothing | |
| Leaves open | the paths in `OPEN_PATHS` (as public overrides) | `OPEN_PATHS`, and static files (hashed JS and CSS, icons): the assets layer answers them before the Worker | everything |

How Access is set up, through the API (sources: the Workers "Cloudflare Access" docs and the 2026-08-14 changelog "enable Access on a Worker or all Workers at once"; the 2025-10-03 one-click changelog is dashboard-only): `GET /accounts/{id}/workers/workers` finds the test Worker's id; a `onetimepin` identity provider (`POST /access/identity_providers`); a service token (`POST /access/service_tokens`, `duration: 8760h`; its secret is returned once and goes straight to `gh secret set`); one `self_hosted` app (`POST /access/apps`) with destination `{ type: "worker", worker_id }`, `allowed_idps` the PIN provider, and two policies, `non_identity` with `{ service_token: { token_id } }` and `allow` with `{ email: { email } }`. Not yet run against a real account: that `worker_id` is the id `workers/workers` returns, that inline policies are accepted on create, and the token permission names. If the API refuses, the dashboard path is Workers & Pages → the test Worker → Access → Protect this Worker behind Access, All traffic. Worker-level Access refuses WebSocket upgrades with 403.

Agents checking a protected preview (the `qa` skill) send the same headers: Playwright through `e2e/gate.ts` (set `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`, or `SITE_PASSWORD`, in the shell), `curl -H` otherwise. The headers go only to the site's own origin, never to Clerk or another third party. A person asks for the password or signs in with the PIN.

### Coming soon and going live

`LAUNCHED` is a var in each environment's `vars` in `wrangler.jsonc`: `"true"` at the top level (local dev) and in `env.test`, `"false"` in `env.production`. Only the exact string `"true"` opens the app; unset or anything else is "Coming soon". The guard runs first (`src/server/request-guards.ts`), so no app code renders or ships: the page has no script and no link to the bundles.

**Going live is on the always-stop list.** An agent never changes `env.production.vars.LAUNCHED`, even when an issue says so, unless the person says go live in their own words in this session. Then:

1. Ask once more, plainly: "Going live makes the app public at <SITE_URL> and lets search engines in. Go live now?" Wait for a yes.
2. Check first and report: `SITE_URL` is set on the production environment, the last production deploy is green, Clerk and other keys are live keys if the app needs them, and the person has tried the app on test.
3. A pull request that sets `"LAUNCHED": "true"` in `env.production.vars` and nothing else. It closes no feature issue. After merge, the person runs `deploy-production` and approves it; its smoke test now checks the real app instead of the Coming soon page.
4. Write the date and the person's yes to `docs/decisions.md`.

To close the site again (an incident), the same pull request with `"false"`, also with the person's yes. Cron triggers and queue consumers still run while production is not launched: they are not HTTP.

## Change it safely

- **A budget:** `scripts/budgets/check-budgets.ts`, gzip bytes per page (initial JS, route JS, CSS) and per lazy chunk. Measured 2026-11-22: `/` 135.6 KB initial, `/notes` 160.7 KB (25.5 KB its own chunk, mostly Zod for the form), Clerk 34.2 KB lazy. Find what grew first (`pnpm check:budgets --json`, then grep the chunk). Lower a budget when the app shrinks; raise one only with the cause in the pull request. The research target is 150 KB gzip per page on this stack.
- **A security header:** change `SECURITY_HEADERS` and the `/*` block of `public/_headers` together (the unit test fails otherwise). Never let two `_headers` rules that match one file set the same header: Cloudflare joins them with a comma.
- **The CSP:** change `pageCsp()`, never the header string in the guard. To allow a third-party service, add its exact origin to `CSP_EXTRA`. Never add `'unsafe-inline'`, `'unsafe-eval'`, `'strict-dynamic'` or `*` to `script-src`. Run `pnpm test:e2e`: the per-route test fails on any violation. An inline script you add needs `nonce={useRouter().options.ssr?.nonce}`.
- **A limit:** `MAX_BODY_BYTES` for server functions; `ratelimits` in `wrangler.jsonc` for the rate (periods are 10 or 60 seconds; it is per location and approximate, so a burst guard, not a quota). A daily quota needs storage (D1 or a Durable Object). Certain junk belongs in a Cloudflare WAF rule, where a block isn't even counted.
- **The crawler policy:** `AI_TRAINING_CRAWLERS` in `src/lib/seo-files.ts`. Re-check names in each vendor's docs. Cloudflare's AI "Training" setting must be Allow or Disallow, never Block (Block also stops Google, Bing and Apple search). The person changes dashboard settings.
- **A path a protected test site must leave open** (a signed webhook): add it to `OPEN_PATHS` in `src/lib/open-paths.ts` (exact, or a prefix ending in `/*`), update its unit test, and rerun setup-cloudflare, which prints a mismatch with the Access app's public paths. Never open a page or `/api/v1`.
- **A variable:** add it to `src/lib/env-schema.ts`, `.env.example` and, for a secret, `src/env.d.ts`. Build-time values are public; secrets are runtime only, set per environment (`wrangler secret put NAME --env test`).
- **A binding** (queue, bucket, var, Hyperdrive): add it at the top level and inside `env.test` and `env.production` with that environment's resource name. Each already has a `"vars"` block: add a var to it, never a second `"vars"` key (the later one wins and drops `LAUNCHED`, which closes the site). Bindings are not inherited; a missing one makes it optional in the generated types and `pnpm typecheck` fails. Then rerun `setup-cloudflare`.

## Gotchas (checked 2026-11)

1. D1 has no interactive transactions. `db.transaction()` fails on `BEGIN`. Use one statement or `db.batch([...])` inside one repository method, and put the condition in SQL.
2. Read bindings with `import { env } from 'cloudflare:workers'` inside a handler or `createServerOnlyFn`, never at module scope.
3. `start.ts`, `*.functions.ts` and `server/*.ts` are also bundled for the browser. Server-only calls must sit inside `.server()`, `.handler()` or `createServerOnlyFn`, or the client build fails on `cloudflare:workers`.
4. A Zod schema passed straight to `.validator()` throws on bad input, and the browser gets a plain error with no field messages. Use the pass-through and return the envelope. The method is `.validator()`, not `.inputValidator()`.
5. Server function results must be serializable. A field typed `unknown` fails typecheck.
6. Having `src/start.ts` turns off Start's default CSRF check. Keep `createCsrfMiddleware` in `requestMiddleware`, after `requestGuards`.
7. `GET` server functions put their input in the query string. Nothing private, nothing big.
8. `clerkMiddleware()` throws without a secret key, and `auth()` throws without the middleware. The pack checks for keys first. Clerk's React SDK uses `<Show when="signed-in">`. There is no `SignedIn` component.
9. Binding `undefined` throws `D1_TYPE_ERROR`; use `null`. A statement takes at most 100 bound parameters, so chunk bulk inserts.
10. Create the `QueryClient` inside `getRouter()`. A module-level client leaks one user's cache into another's HTML.
11. TanStack Query 5.108 deprecates `ensureQueryData` and `prefetchQuery`. Use `queryClient.query()` and `queryClient.infiniteQuery()`.
12. Pin `wrangler` to the version `@cloudflare/vite-plugin` depends on (`pnpm view @cloudflare/vite-plugin@<v> dependencies`). If they differ, two workerd builds install.
13. Keep TypeScript on 6.0.x until typescript-eslint supports 7.
14. eslint-plugin-boundaries skips package imports and imports inside one element unless `checkAllOrigins` and `checkInternals` are on. Prove a rule fails on a deliberate violation before you trust it.
15. Edit `wrangler.jsonc`, never `dist/server/wrangler.json`. `pnpm typecheck` reruns `wrangler types`. Secrets go in `src/env.d.ts`.
16. Request middleware runs before Start reads a server function's body, so limits belong there, first in `requestMiddleware`. Its `next({ context })` is what `getGlobalStartContext()` returns inside `getRouter()`: that is how the nonce reaches the router.
17. A JSON response Start didn't serialize reaches the caller oddly: the client spreads it, returns `body.result` and throws `body.error`. The guards answer with the plain envelope and `call()` maps the thrown `{ code, message }`. A test that fakes a server function answers `{ result: envelope }`.
18. A query error rendered on the server is dehydrated as a plain `Error` and loses `code`, so the view picks another branch and React throws hydration error 418. `appErrorAdapter` (registered in `src/start.ts`) keeps `AppError` intact, and `retryOnMount: false` keeps the server's error instead of flashing a loading state (that flash was the `/notes` LCP, 2.2 s).
19. Zod probes for eval with `Function('')` on its first parse; under the CSP that logs a violation in every browser. `src/router.tsx` sets `globalThis.__zod_globalConfig.jitless`. `z.config()` would do the same but pulls all of Zod into the entry chunk.
20. React 19 moves a plain `<script>` in `<head>` after the stylesheets and hoisted meta. The theme script still runs before first paint (tested with the app bundle blocked); don't move it into `head()`.
21. `public/_headers` never applies to Worker responses, and every page here is a Worker response. The guards set headers for those; the unit test keeps both lists equal.
22. `vite preview` serves JS uncompressed, so Lighthouse there overstates transfer and LCP. `pnpm lhci` runs `wrangler dev -c dist/server/wrangler.json`, which compresses. It clears `.lighthouseci/` first, or old runs are averaged in. Lighthouse 13 renamed `third-party-summary` to `third-parties-insight`; asserting the old id passes without checking.
23. Clerk's React SDK is about 35 KB gzip. It loads lazily and only with keys; with keys, hydration waits for that chunk. The CSP reads Clerk's Frontend API host from the publishable key (base64 of the host). Not yet run with real Clerk keys: check the console for CSP errors the first time.
24. Locally the rate limiter trusts a `cf-connecting-ip` header (tests use it for their own bucket); on Cloudflare the edge sets it and a client can't. Its windows are fixed: a test must cross the limit twice over to pass on a window boundary.
25. Vite 8's native config loader wants explicit `.ts` extensions on files `vite.config.ts` imports (`tsconfig.node.json` allows them). `src/lib/site.ts` stays free of `import.meta.env` because the config imports it.
26. The React Compiler lint (`react-hooks/refs`) rejects a ref returned inside a hook's result object. Create the ref in the component and pass it in (see `useTurnstile`).
27. Turnstile's test secrets answer with hostname `example.com`; `verifyTurnstile` accepts that only for a test secret. Test keys: site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` (always pass).
28. Never name a server file `*.client.*` (for example `stripe.client.ts`): Start's import protection treats it as browser-only code and the build breaks. Use `.adapter.ts`, `.payments.stripe.ts` and similar.
29. The environment is chosen at **build** time: `CLOUDFLARE_ENV=test pnpm build`, then `wrangler deploy` (its `--env` must match or be left out). The build leaves `.wrangler/deploy/config.json`, which redirects later wrangler commands to the flattened config: pass `-c wrangler.jsonc` to D1 commands and `wrangler types`, and delete that file before `wrangler secret put --env` (setup-cloudflare does).
30. `wrangler d1 time-travel info` is remote-only and takes no `--remote`. Its `--json` prints `{ bookmark, … }`; parse from the first `{`.
31. `auth()` from `@clerk/tanstack-react-start/server` does read header tokens: `clerkMiddleware` calls `authenticateRequest` with `acceptsToken: 'any'`, a token in `Authorization` takes precedence over the cookie, and `auth()` (default `session_token`) turns an API key or M2M token into signed-out. Checked in the package source (1.7.19, backend 3.31.4) and on the built Worker with a self-signed key as `CLERK_JWT_KEY`: valid token 200, expired 401, another user's note 404, cookie alone 401. Not yet run against a real Clerk instance. Clerk session JWTs carry a `cat` header; a hand-made test token without it is a `token-type-mismatch`.
32. `CLERK_JWT_KEY` (networkless verification) must be the PEM on one line or with real newlines, never with literal `\n`: Clerk strips newlines and reads the modulus, so `\n` gives `token-invalid-signature`.
33. A server route with no handler for a method falls through to the HTML shell with 200. Every `/api/v1` route has `ANY: methodNotAllowed(...)`.
34. A non-HTML response that sets its own CSP keeps it (the guards add the baseline only when none is set); HTML always gets the page CSP.
35. `pnpm exec playwright test` with `BASE_URL` set skips the local web servers: that is how the deploy workflows test a deployed URL. The rate-limit tests skip there (the edge sets the client address). Pass projects as `--project=desktop`: `--project desktop e2e/x.spec.ts` reads the file as a second project name.
36. `vite preview` reads vars from `dist/server/wrangler.json` and `.dev.vars`; with `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` it also takes them from the shell, on top of the config. That is how the e2e suite previews one build launched, not launched and password-gated.
37. Static files are answered before the Worker, so a guard can't see them. robots.txt, sitemap.xml and llms.txt are in `assets.run_worker_first` (and not in the build) so a not-launched environment can answer them; the password gate can't cover the hashed bundles (Access can).
38. Playwright's `extraHTTPHeaders` go to every host a page calls, Clerk included. `e2e/gate.ts` adds the protection headers with a route on the site's own origin only. A Playwright fixture's callback must not be named `use` here: the React hooks lint flags it.

## Netlify

Netlify is the only alternative host. Swap `@cloudflare/vite-plugin` for `@netlify/vite-plugin-tanstack-start`, and move the data off D1, because `cloudflare:workers` and D1 bindings don't exist there. The rate-limit binding goes too: use the host's own limits.

## Optional add-ons

- **Local-first with Dexie:** IndexedDB as the client's owner of a resource, an outbox synced with last-write-wins on a server `version`, and undo history from Immer patches. One owner per resource: never the same rows in TanStack Query and Dexie. Add client-made ids, `baseVersion` and tombstones to the server side when you do.
- **Prerendered marketing pages:** `prerender` in `tanstackStart()` for pages that don't depend on the session; they are served without running the Worker. A prerendered page can't carry a per-response nonce: give it a hash-based CSP built from the final HTML instead, in its own `_headers` rule. List unlinked pages in `pages[]`.
- **A static 404 for unknown URLs:** only once every page is prerendered (`not_found_handling: "404-page"`); until then the Worker renders the 404 and scanner paths are answered without a render.
- **File uploads** to R2 through a server route, not a server function, with its own body cap (`r2-uploads` add-on).

The add-ons in `stacks/tanstack-start-addons/` follow the environments: each binding goes in all three blocks, `sentry` and `jobs` wrap Start's handler in `src/server.ts` (so the guards still run), and third-party origins go in `CSP_EXTRA`.
