# Add-ons for the TanStack Start pack

Optional pieces for an app made from `stacks/tanstack-start`. The tech grill (`stack` skill) offers one only when the app needs it. An agent then applies it by following its `ADDON.md` exactly.

| Add-on | Adds | Packages | Lane |
|---|---|---|---|
| [`analytics`](analytics/ADDON.md) | Cloudflare Web Analytics beacon, off without a token | none | tiny |
| [`sentry`](sentry/ADDON.md) | errors from the Worker and the browser, source maps uploaded from CI | `@sentry/cloudflare`, `@sentry/react`, `@sentry/vite-plugin` | normal |
| [`email-resend`](email-resend/ADDON.md) | `EmailSender` port, Resend over `fetch`, memory fake, one escaped template | none | risky |
| [`jobs`](jobs/ADDON.md) | Queues producer and consumer, Cron Triggers, an idempotent job ledger | none | normal |
| [`stripe`](stripe/ADDON.md) | `billing` module: Checkout, the portal, a signed, idempotent webhook, test mode only | `stripe` | risky |
| [`r2-uploads`](r2-uploads/ADDON.md) | `files` module: metadata row first, streamed upload to R2, limits, owner-scoped | none | risky |
| [`database-supabase`](database-supabase/ADDON.md) | D1 → Supabase Postgres through Hyperdrive, with the same repository port | `pg` | risky |

## How an add-on is laid out

```
<add-on>/
  ADDON.md   what it adds, when to choose it, env var names, the exact apply steps, the issue's Skills and lane, how to verify
  files/     new files, at their paths in the project
```

## Applying one

```sh
npx onrails add tanstack-start --list-addons
npx onrails add tanstack-start/<add-on>      # copies files/, skips files you have (--force overwrites)
```

The CLI copies `files/` and prints the rest of the `## Apply` steps. Those are small edits to `composition.ts`, `wrangler.jsonc`, `env.d.ts` and `eslint.config.js`, plus installs with pinned versions. Do them in order, then run `pnpm check`.

The rules every add-on keeps:

- **No keys, no feature.** With no keys, the app builds, tests pass, and the feature is hidden or fails closed.
- **Layers.** Each one follows the pack's layers: functions → controller → service → repository or client port → adapter, with a memory fake for tests and the composition root as the only place that reads env.
- **Keys stay with the person.** Agents never create accounts or set production secrets.
- **Bindings per environment.** `wrangler.jsonc` has a top level (local dev) and `env.test` and `env.production`. Bindings (`queues`, `r2_buckets`, `hyperdrive`, `vars`) are not inherited, so an add-on adds its binding to all three, with the environment's own resource names. `scripts/setup-cloudflare.mjs` creates the deployed buckets and queues.
- **Limits and headers.** The pack's request guards cap bodies and rate-limit server functions and `/api/v1` only. Any other server route an add-on adds (uploads, webhooks) bounds its own body with `checkBody(request, itsOwnCap)` or a bounded read. Every response still gets the security headers; a non-HTML response keeps a stricter CSP it sets itself. Third-party origins go in `CSP_EXTRA` in `src/lib/security-headers.ts`.

The pack's `src/server.ts` (the Worker entry) answers the two paths Start handles before any middleware (`beforeStart`, #65), then calls Start's handler. `jobs` and `sentry` each replace it with a version that keeps that call; their ADDON.md files show the combined file. It wraps Start's handler, so the pack's request middleware still runs on every request. `database-supabase` replaces four pack files and changes the dialect of every table; apply it before the add-ons that add tables, or port their tables as its ADDON.md describes.
