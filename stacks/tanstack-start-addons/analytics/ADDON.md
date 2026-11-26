# analytics

Cloudflare Web Analytics: page views, referrers and Core Web Vitals with no cookies and no consent banner.

| | |
|---|---|
| **Choose it when** | the person wants to know how many people visit and which pages are slow, and doesn't need funnels or per-user tracking |
| **Alternatives** | Plausible or Umami (self-hosted, still cookie-free); PostHog when you need funnels, events and session replay |
| **Env vars** | `VITE_CF_BEACON_TOKEN` (build time; public, it ends up in the HTML) |
| **Packages** | none |
| **Issue** | `Skills: build, web-performance` · lane `tiny` |
| **Vendor setup** | none for this add-on. Picked PostHog instead? Follow `.agents/skills/secrets/setup/posthog.md` |

## What it adds

- `src/components/web-analytics.tsx`: renders the beacon `<script defer>` only when a valid site token is set. No inline JavaScript, so it works under a Content-Security-Policy that allows the beacon host.
- `src/components/web-analytics.test.ts`: no token renders nothing, a bad token renders nothing, a good one renders exactly one external script.

Without a token the build has no analytics and makes no third-party request.

## Apply

1. Copy `files/` into the project root. The CLI does this step: `npx onrails add tanstack-start/analytics`.
2. In `src/routes/__root.tsx`, import the component and render it in `RootDocument`, just before `<Scripts />`:
   ```tsx
   import { WebAnalytics } from '@/components/web-analytics'
   ```
   ```tsx
   <body>
     {children}
     <WebAnalytics token={import.meta.env.VITE_CF_BEACON_TOKEN as string | undefined} />
     <Scripts />
   </body>
   ```
3. Add the name to `.env.example`, with no value:
   ```sh
   # Cloudflare Web Analytics site token (dashboard: Analytics & Logs > Web Analytics > Add a site).
   # Public: it is baked into the HTML at build time. Empty means no analytics.
   VITE_CF_BEACON_TOKEN=
   ```
4. Allow the beacon and its endpoint in the page CSP. The pack has one place for that, `CSP_EXTRA` in `src/lib/security-headers.ts` (never the header string in the guard):
   ```ts
   export const CSP_EXTRA: Readonly<Record<'script' | 'connect' | 'img' | 'frame', readonly string[]>> = {
     script: ['https://static.cloudflareinsights.com'],
     connect: ['https://cloudflareinsights.com'],
     img: [],
     frame: [],
   }
   ```
   Then update the expectation in `src/lib/security-headers.test.ts` ("adds origins from CSP_EXTRA, and ships with none") to these two origins: it guards that nothing else was opened. `public/_headers` needs no change: it carries the baseline, which has no `script-src`.
5. The token is read at build time, so set `VITE_CF_BEACON_TOKEN` in the shell where `pnpm deploy:test` or `pnpm deploy:production` runs (not a secret). Ask the person to create the site in the Cloudflare dashboard; it's free.
6. `pnpm exec eslint --fix . && pnpm format`: the pack's lint sorts imports, including the ones this add-on added.
7. `pnpm check`.

## Verify

- `pnpm test` runs the three beacon tests.
- `pnpm build && pnpm preview`, then `curl -s <the URL it prints> | grep -c beacon.min.js` prints `0`. (The URL string is in the client JS either way; with no token the tag is never rendered.)
- `VITE_CF_BEACON_TOKEN=<32 hex chars> pnpm build && pnpm preview`: the same `curl` finds one `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=...>`, and the browser console shows no CSP error. `pnpm test:e2e` still passes: with no token the beacon is never rendered, so no test loads it.

## Not verified here

Real page views arriving in the Cloudflare dashboard (needs a deployed site and a real token).

If the site is on a Cloudflare zone you own, the dashboard can also inject the beacon for you ("automatic setup"). Use one or the other, never both, or every view counts twice.
