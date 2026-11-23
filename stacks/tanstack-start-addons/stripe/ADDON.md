# stripe

Subscriptions with Stripe: hosted Checkout, the hosted customer portal, and a signed, idempotent webhook that keeps a `billing` module's table in step with Stripe. Test mode only, unless the person explicitly allows live mode.

| | |
|---|---|
| **Choose it when** | the app charges a recurring price and you want Stripe to hold every card detail, invoice and tax rule |
| **Alternatives** | Lemon Squeezy or Paddle (merchant of record: they handle VAT and sales tax for you, for a higher fee); Stripe Payment Links (no code, no webhook, nothing in the app knows who paid) |
| **Env vars** | `STRIPE_SECRET_KEY` (secret), `STRIPE_WEBHOOK_SECRET` (secret), `STRIPE_PRICE_ID`, `STRIPE_ALLOW_LIVE` (only the person sets it, only in production) |
| **Packages** | `stripe@23.1.0` |
| **Issue** | `Skills: build, web-security` · lane `risky` (money, a public webhook, a new data processor). `pr-security` and the human gate apply. Going live is a separate issue the person approves. |

## What it adds

`src/modules/billing/`, layered like `notes`:

- `schemas.ts`, `types.ts`: inputs are strict empty objects. The price comes from config and the customer from the session, so a `priceId` or `customerId` in a request body is a validation error. The `BillingDto` carries no Stripe ids.
- `server/billing.table.ts`: `billing_customers` (owner → Stripe customer, subscription status, period end, `last_event_at`) and `billing_events` (Stripe event ids already handled).
- `server/billing.repository.ts` with `.memory.ts` and `.drizzle.ts`: `linkCustomer` keeps the first link. `applySubscription` only applies an event at least as new as the last one applied (`WHERE last_event_at <= ?`), so webhooks that arrive out of order can't roll the state back. `recordEvent` and `hasEvent` handle dedupe.
- `server/billing.payments.ts`: the payments port. `billing.payments.stripe.ts` is the Stripe adapter: the fetch HTTP client and Web Crypto, `constructEventAsync` on the raw body, idempotency key `customer/<owner>` on customer creation, and `stripeKeyAllowed` (only `sk_test_`/`rk_test_` keys, unless live mode is allowed). `billing.payments.memory.ts` is the fake.
- `server/billing.service.ts`: `status`, `checkout` (refuses a second subscription), `portal` (own customer only; anyone else gets `not_found`) and `webhook` (verify, skip a duplicate, apply, then record).
- `server/billing.controller.ts`: the envelope for the three server functions. `server/billing.http.ts`: the webhook's HTTP controller. It checks the signature header and size before reading the body, reads at most 256 KB without trusting `Content-Length`, and answers 400 for a bad signature, 413 if too large, 503 when billing is off, 500 on a storage error (so Stripe retries), and 200 otherwise.
- `server/billing.functions.ts`, `hooks/use-billing.ts`, `ui/views/billing-view.tsx`: the page. When billing is off, it says so and shows no buttons.
- Tests: service (off without keys, one customer per user, no double subscription, the portal is owner-scoped, a forged signature changes nothing, a redelivery is a duplicate, an older event never wins), the Stripe adapter with the **real SDK's** signature check (valid, tampered body, wrong secret, stale timestamp, garbage) and the key guard, the webhook route (body unread without a signature, 413 for a declared or a chunked oversize body, status mapping), the controller (rejects smuggled ids), and the repository contract against memory **and local D1**.

`src/routes/billing.tsx` (the page) and `src/routes/api/stripe/webhook.ts` (a server route: it needs the raw body and real status codes, which a server function can't give).

With no keys: the app builds, tests pass, the page says "Billing isn't set up yet", the server functions return `unavailable`, and the webhook answers 503.

## Apply

1. Copy `files/` into the project root. The CLI does this step: `npx ai-dev-workflow add tanstack-start/stripe`.
2. Install: `pnpm add stripe@23.1.0`.
3. `src/env.d.ts`: inside `interface Env`, add:
   ```ts
   STRIPE_SECRET_KEY?: string
   STRIPE_WEBHOOK_SECRET?: string
   STRIPE_PRICE_ID?: string
   STRIPE_ALLOW_LIVE?: string
   ```
4. `src/server/composition.ts`: add the imports and the factories.
   ```ts
   import { getRequestUrl } from '@tanstack/react-start/server'
   import { stripeKeyAllowed, stripePayments } from '@/modules/billing/server/billing.payments.stripe'
   import { billingController } from '@/modules/billing/server/billing.controller'
   import { billingWebhook as webhookHandler } from '@/modules/billing/server/billing.http'
   import { drizzleBillingRepository } from '@/modules/billing/server/billing.repository.drizzle'
   import { createBillingService } from '@/modules/billing/server/billing.service'
   ```
   ```ts
   /** Stripe only when all three are set, and in test mode unless live mode is explicitly allowed. */
   function stripeConfig() {
     const secretKey = env.STRIPE_SECRET_KEY
     const webhookSecret = env.STRIPE_WEBHOOK_SECRET
     const priceId = env.STRIPE_PRICE_ID
     if (!secretKey || !webhookSecret || !priceId) return null
     if (!stripeKeyAllowed(secretKey, env.STRIPE_ALLOW_LIVE === 'true')) return null
     return { secretKey, webhookSecret, priceId }
   }

   function billingService() {
     const stripe = stripeConfig()
     return createBillingService({
       repo: drizzleBillingRepository(createDb(env.DB)),
       payments: stripe ? stripePayments(stripe) : null,
       priceId: stripe?.priceId ?? null,
       appUrl: getRequestUrl().origin,
       now: Date.now,
     })
   }

   export const billingApi = () => billingController(billingService())
   export const billingWebhook = () => webhookHandler(billingService())
   ```
5. `eslint.config.js`: keep the SDK out of services and the payments and HTTP files away from the UI. Add `'stripe',` to `notInServices`, and add two rows to `files`, before the `client` row:
   ```js
   { category: 'adapter', pattern: 'src/modules/*/server/*.payments.stripe.ts' },
   { category: 'server-internal', pattern: 'src/modules/*/server/*.{payments,http}*.ts' },
   ```
6. `.env.example`: add the names, with no values.
   ```sh
   # Stripe, test mode (dashboard.stripe.com > Developers). Empty means billing is off and hidden.
   # A live key (sk_live_) is refused unless STRIPE_ALLOW_LIVE=true, which only the person sets, in production.
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   STRIPE_PRICE_ID=
   STRIPE_ALLOW_LIVE=
   ```
7. `pnpm db:generate --name billing`, read the SQL (two tables and a unique index on `customer_id`), then `pnpm db:migrate:local`.
8. `src/lib/open-paths.ts`: the webhook checks its own signature, so a protected test site (the password gate or Cloudflare Access) must let Stripe reach it. Set `OPEN_PATHS` to `['/api/stripe/webhook']`, update the expectation in `src/lib/site-gate.test.ts` ("keeps only the listed paths open, and ships with none") to that list, and, if the test site uses Cloudflare Access, add the same path as a public path of its Access application (setup-cloudflare prints this when they differ). While production is not launched ("Coming soon"), the webhook answers 503 there and Stripe retries; live mode comes after launch anyway.
9. `pnpm build` once, so the router regenerates `src/routeTree.gen.ts` with `/billing` and `/api/stripe/webhook`. Otherwise `pnpm typecheck` fails on the new routes. Optionally, add a `/billing` link to `src/components/site-header.tsx`.
10. `pnpm check`.
11. The person, in Stripe **test mode**: creates a product with a recurring price (its id goes in `STRIPE_PRICE_ID`), turns on the customer portal (Settings > Billing > Customer portal), and adds a webhook endpoint `https://<test host>/api/stripe/webhook` for `customer.subscription.created`, `.updated`, `.deleted`, `.paused` and `.resumed`. Its signing secret goes in `STRIPE_WEBHOOK_SECRET`. They set the secrets per environment with `pnpm exec wrangler secret put STRIPE_SECRET_KEY --env test` (and the others), or the secrets skill. The webhook route bounds its own body (256 KiB, `billing.http.ts`): the pack's request guards cap only server functions and `/api/v1`. Live keys, the live webhook and `STRIPE_ALLOW_LIVE=true` are the person's own production step.

Never use the original Stripe IDs from a request, never trust the success URL as proof of payment (only the webhook changes `status`), and gate paid features on `status` from `getBilling`, server-side.

## Verify

- `pnpm test`: 24 billing tests.
- Locally, with test keys in `.dev.vars` and the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (it prints a `whsec_` to use as `STRIPE_WEBHOOK_SECRET`). Then on `/billing`, sign in, click Subscribe and pay with `4242 4242 4242 4242`. The page shows Active, and "Manage billing" opens the portal. `stripe events resend <evt_id>` answers `duplicate`.
- Boundary rules, proved by deliberate violations: `import Stripe from 'stripe'` in the service, the service importing `billing.payments.stripe`, and the view importing `billing.http` each fail `pnpm lint`.

Checked for this add-on, locally, on the built Worker (`pnpm preview`, local D1, no network): with no keys, `POST /api/stripe/webhook` answered 400 with no signature and 503 with one, and `/billing` rendered. With a test config and payloads signed by the real SDK: a new event gave 200 `processed`; the same event again gave 200 `duplicate`; an older event gave 200 and left `active` in place; a wrong secret gave 400. `billing_customers` ended `active` with the right period end. The Worker bundle grows by about 617 KB raw (92 KB gzip); the browser bundle doesn't include the SDK.

## Not verified here

Calls to Stripe's API (customer, Checkout and portal creation) and real Stripe deliveries (no network to Stripe). The adapter's request shapes follow the `stripe@23.1.0` types (API version `2026-10-28`), and typecheck passes.

## Gotcha

Don't name a server file `*.client.*`. TanStack Start's import protection denies `**/*.client.*` in the server build, which is why the port is `billing.payments.ts`, not `billing.client.ts`.
