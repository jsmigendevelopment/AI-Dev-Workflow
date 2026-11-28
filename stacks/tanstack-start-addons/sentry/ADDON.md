# sentry

Error monitoring with Sentry: uncaught errors and the controllers' "unhandled" logs from the Worker, React errors from the browser, and readable stack traces from source maps uploaded by the deploy builds.

| | |
|---|---|
| **Choose it when** | real people use the app and you need to hear about errors before they tell you |
| **Alternatives** | Cloudflare Workers Logs alone (already on: `observability` in `wrangler.jsonc`, server side only); Highlight or GlitchTip (self-hosted, Sentry-compatible) |
| **Env vars** | Worker: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`. Build: `VITE_SENTRY_DSN`. Deploy builds: `SENTRY_AUTH_TOKEN` (secret), `SENTRY_ORG`, `SENTRY_PROJECT` |
| **Packages** | `@sentry/cloudflare@11.19.0`, `@sentry/react@11.19.0`; dev: `@sentry/vite-plugin@11.19.0` |
| **Why these packages** | On Workers, `@sentry/cloudflare` (`withSentry`) is the SDK that runs. Sentry's TanStack Start guide adds `@sentry/tanstackstart-react` only for server-function tracing (off here), and it needs a `@ts-expect-error`: decision 257-1. Checked on npm 2026-11-27. |
| **With a Go backend** | fits for the web app: the browser, and its Worker while the web app runs on Workers. The Go service reports through Sentry's Go SDK, set up in the Go service; no Go add-on exists yet: file one when an app needs it |
| **Issue** | `Skills: build, web-security` · lane `normal` (`risky` if the person's risk dial treats a new data processor as risky) |
| **Vendor setup** | Sentry's agent handoff and CLI sign-in, the kit's way (the handoff code is a credential): `.agents/skills/secrets/setup/sentry.md`. Keys: `.agents/skills/secrets/providers/sentry.md` |

## What it adds

- `src/server.ts`: the pack's Worker entry (it answers `//x` and an empty server function ID with `beforeStart`, then calls Start's handler), wrapped in `Sentry.withSentry`, with `captureConsoleIntegration` for `console.error`, so the `respond()` helper's `unhandled` log (and the request guards' `server function failed` and `api route failed`) becomes an event without changing it. The pack's request middleware (`src/start.ts`: request guards, CSRF, Clerk) runs inside `handler.fetch`, so the security headers, the nonce CSP, the body caps, the rate limit and the `/api/v1` guards all still apply. Never answer a request in `src/server.ts` before `handler.fetch` except through `beforeStart`: that would skip all of them.
- `src/client.tsx`: Start's default browser entry plus `Sentry.init` and React 19's error hooks. Initialised only when `VITE_SENTRY_DSN` was set at build time.
- `src/lib/monitoring.ts` and its test: one options function for both sides, and `sentryIngestOrigin(dsn)` for the CSP. No DSN means `enabled: false`. Errors only (`tracesSampleRate: 0`). `beforeSend` drops cookies, auth and webhook-signature headers, request bodies, query strings, IP addresses and emails.

With no DSN the app builds, tests pass and nothing is sent.

## Apply

1. Copy `files/` into the project root. The CLI does this step: `npx onrails add tanstack-start/sentry`.
   The pack already has a `src/server.ts` (the Worker entry, calling `beforeStart` before Start's handler). Replace it with this one (`--force` for that file); it keeps that call.
   The pack already has a `src/client.tsx` (Start's entry plus an `onCaughtError` that doesn't report an `AppError` a section's boundary showed). Replace it with this one (`--force` for that file), then keep that rule so expected errors (signed out, not found) don't become Sentry events:
   ```tsx
   const report = Sentry.reactErrorHandler()
   /** An AppError a section's boundary showed is expected: not an incident. */
   function onCaughtError(error: unknown, info: ErrorInfo) {
     if (!(error instanceof AppError)) report(error, info)
   }
   // in hydrateRoot's options:
   { onUncaughtError: report, onCaughtError, onRecoverableError: report }
   ```
   with `import { AppError } from '@/lib/app-error'` and `type ErrorInfo` from `react`.
2. Install:
   ```sh
   pnpm add @sentry/cloudflare@11.19.0 @sentry/react@11.19.0
   pnpm add -D @sentry/vite-plugin@11.19.0
   ```
3. `wrangler.jsonc`: the Worker's entry stays the pack's (`main` is already this).
   ```jsonc
   "main": "src/server.ts",
   ```
4. `src/env.d.ts`: add the two Worker vars inside `interface Env`, and the build-time DSN to `ImportMetaEnv`.
   ```ts
   SENTRY_DSN?: string
   SENTRY_ENVIRONMENT?: string
   ```
   ```ts
   readonly VITE_SENTRY_DSN?: string
   ```
   `wrangler.jsonc`: name each deployed environment. Vars are not inherited, and each of `env.test` and `env.production` already has a `"vars"` block (with `LAUNCHED` and `SITE_PROTECTION`): add the name to it, never a second `"vars"` key (the later one would replace the first and drop `LAUNCHED`, which closes the site).
   ```jsonc
   "vars": { "LAUNCHED": "true", "SITE_PROTECTION": "none", "SENTRY_ENVIRONMENT": "test" },
   // env.production: "SENTRY_ENVIRONMENT": "production", next to its own LAUNCHED
   ```
5. `vite.config.ts`: add the plugin and hidden source maps, both only when a token is present.
   ```ts
   import { sentryVitePlugin } from '@sentry/vite-plugin'

   // Source maps go to Sentry only when the build has a token (a deploy build). The browser's maps
   // are then deleted from dist/, so they are never served.
   const sentry = process.env.SENTRY_AUTH_TOKEN
     ? sentryVitePlugin({
         org: process.env.SENTRY_ORG,
         project: process.env.SENTRY_PROJECT,
         authToken: process.env.SENTRY_AUTH_TOKEN,
         sourcemaps: { filesToDeleteAfterUpload: ['./dist/client/**/*.map'] },
       })
     : []
   ```
   In `defineConfig`, after `server`, and at the end of `plugins`:
   ```ts
   ...(process.env.SENTRY_AUTH_TOKEN && { build: { sourcemap: 'hidden' } }),
   ```
   ```ts
   plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tailwindcss(), tanstackStart(), react(), sentry],
   ```
   Step 11 formats it (Prettier wraps the plugins list).
6. `eslint.config.js`: keep the SDK out of services. Add to `notInServices`:
   ```js
   '@sentry/**',
   ```
7. `.env.example`: add the names, with no values.
   ```sh
   # Sentry (sentry.io, free tier). The DSN is not a secret, but leave it empty to keep reporting off.
   # Worker: SENTRY_DSN (and SENTRY_ENVIRONMENT, e.g. test). Browser: VITE_SENTRY_DSN, read at build time.
   SENTRY_DSN=
   SENTRY_ENVIRONMENT=
   VITE_SENTRY_DSN=
   # Deploy builds only, for source map upload: SENTRY_AUTH_TOKEN (a secret), SENTRY_ORG, SENTRY_PROJECT.
   ```
8. Upload source maps only from the deploy builds, which run from the session (the pack ships no GitHub Actions workflows): `pnpm deploy:test` and `pnpm deploy:production` hand their build the shell's variables. Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `VITE_SENTRY_DSN` for those two commands only, never for `pnpm deploy:preview` or `pnpm check` (pull requests). For example, keep them in `.env.sentry.local` (git-ignored by `.env.*`) and run `set -a; . ./.env.sentry.local; set +a; pnpm deploy:test` in a shell of its own. Never print the token or pass it as an argument.
9. The page CSP: let the browser SDK reach the ingest host. In `src/lib/security-headers.ts`, import the helper and use it in `CSP_EXTRA`:
   ```ts
   import { sentryIngestOrigin } from './monitoring'
   ```
   ```ts
   export const CSP_EXTRA: Readonly<Record<'script' | 'connect' | 'img' | 'frame', readonly string[]>> = {
     script: [],
     connect: sentryIngestOrigin(import.meta.env.VITE_SENTRY_DSN),
     img: [],
     frame: [],
   }
   ```
   With no DSN at build time the list is empty, so the CSP (and the "ships with none" unit test) are unchanged. Never widen `connect-src` to `https://*.sentry.io`.
10. Keys stay with the person: they create the Sentry project, set `SENTRY_DSN` with `pnpm exec wrangler secret put SENTRY_DSN --env test` and `--env production` (the `vars` from step 4 name the environment), and keep the source-map token where the deploys run (step 8).
11. Sort the imports this add-on added and format its files, and only its files. Make the Worker's types first: `worker-configuration.d.ts` is git-ignored, so a fresh copy has none until a lint or typecheck runs, and without it the typed rules' fixes misread the code (they drop type assertions that are needed, and typecheck fails).
    ```sh
    pnpm cf-typegen &&
    pnpm exec eslint --fix src/server.ts src/client.tsx src/lib/monitoring.ts src/lib/monitoring.test.ts src/lib/security-headers.ts src/env.d.ts vite.config.ts eslint.config.js &&
    pnpm exec prettier --write src/server.ts src/client.tsx src/lib/monitoring.ts src/lib/monitoring.test.ts src/lib/security-headers.ts src/env.d.ts vite.config.ts eslint.config.js wrangler.jsonc
    ```
    The `&&` stops the step if the types can't be made. Never `eslint --fix .` here: a whole-project fix can rewrite files this add-on never touched.
12. `pnpm check`.

### With the `jobs` add-on

Both add-ons own `src/server.ts`, and the CLI won't overwrite the one you already have. Keep one file that wraps `fetch`, `queue` and `scheduled`: the exact file is under "With the `sentry` add-on" in the `jobs` ADDON.md. Checked 2026-11-22 on the v0.4 pack (environments, `/api/v1`): `pnpm check` passes (117 tests), the full Playwright suite passes (63, including the security-header, limit and `/api/v1` tests), and a cron fired twice locally ran one job.

## Verify

- `pnpm test` runs the monitoring tests (off without a DSN, scrubbing).
- Locally: put `SENTRY_DSN=<a test project's DSN>` in `.dev.vars`, **rebuild**, `pnpm preview`, and hit a route that throws. The event shows up in Sentry with no cookie or IP. Remove the DSN, rebuild, and nothing is sent. (`pnpm preview` uses the vars from build time.)
- After a deploy build: `ls dist/client/assets/*.map` finds nothing, and a browser error in Sentry shows original source lines.

Checked for this add-on, locally: with `SENTRY_DSN` pointing at a local HTTP listener, one `console.error('unhandled', …)` and one uncaught error from a route each sent one event to the listener, in the right environment, with no cookie or IP in the payload. With no DSN and a fresh build, nothing was sent.

## Not verified here

- Delivery to sentry.io, source map upload and symbolication (no network to Sentry).
- The browser SDK at runtime (built and type-checked only).

## Costs and licences

- The Worker bundle grows by about 550 KB raw. The browser bundle grows by about 5 KB gzip.
- `@sentry/vite-plugin` pulls in Sentry's CLI (`sentry`), licensed FSL-1.1 (source-available, becomes Apache-2.0 after two years). It is a build-time dev dependency and never ships in the app. The SDKs are MIT.
