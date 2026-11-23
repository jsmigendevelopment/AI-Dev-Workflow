# Stripe (stripe add-on)

Last checked: 2026-11-23. Official docs:
- https://docs.stripe.com/keys
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/cli
- the Stripe CLI's README in `stripe/stripe-cli` (commit of 2026-11-21)

How: docs.stripe.com and dashboard.stripe.com were blocked here, and Stripe's docs have no public repo. Only the Stripe CLI's README could be read. **Every dashboard step below is `[U]`: written from the add-on's own notes, not checked against Stripe's current screens.** `[V]` = matches the CLI README or the add-on's tested code.

**What it's for.** Subscriptions. Fills:

```text
STRIPE_SECRET_KEY        sk_test_... (secret)
STRIPE_WEBHOOK_SECRET    whsec_...   (secret)
STRIPE_PRICE_ID          price_...   (not secret)
STRIPE_ALLOW_LIVE        only "true", only in production, only set by the person
```

**Test vs live.** Local, test and previews use test keys (`sk_test_` or `rk_test_`). The add-on refuses a live key (`sk_live_`) unless `STRIPE_ALLOW_LIVE=true`. `[V]` (`stripeKeyAllowed` in the add-on). Live keys, the live webhook and `STRIPE_ALLOW_LIVE` are the person's own production step, after launch.

**For `pnpm connect`.** The block below tells the script which names this file fills, where each one goes and which page to open. The steps stay in the sections below; the script prints them short. Format: the `secrets` skill.

```json connect
{
  "title": "Stripe",
  "order": 40,
  "url": "https://dashboard.stripe.com/test/apikeys",
  "steps": "## Walkthrough",
  "vars": {
    "STRIPE_SECRET_KEY": {"secret": true, "scope": ["local", "test", "production"], "to": [".env.local", "wrangler"], "shape": {"prefix": ["sk_test_", "rk_test_", "sk_live_", "rk_live_"]}},
    "STRIPE_WEBHOOK_SECRET": {"secret": true, "scope": ["local", "test", "production"], "to": [".env.local", "wrangler"], "split": true, "url": "https://dashboard.stripe.com/test/webhooks", "shape": {"prefix": ["whsec_"]}},
    "STRIPE_PRICE_ID": {"secret": false, "scope": ["local", "test", "production"], "to": [".env.local", "wrangler"], "url": "https://dashboard.stripe.com/test/products", "shape": {"prefix": ["price_"]}}
  }
}
```

## Walkthrough, test mode · about 10 minutes

1. Make an account and stay in test mode (or a sandbox). Open the API keys page: https://dashboard.stripe.com/test/apikeys. Reveal the **Secret key** (or make a **restricted key**) and paste it into `.env.local` and `.env.test.local` as `STRIPE_SECRET_KEY`. Never into chat. `[U]`
2. Sign in the Stripe CLI, in your own terminal: `[V]`
   ```bash
   pnpm dlx @stripe/cli@1.55.14 login
   ```
3. Make the product and price: https://dashboard.stripe.com/test/products → add a product with a **recurring** price. Copy the price id (`price_...`) into `STRIPE_PRICE_ID`. `[U]`
4. Turn on the customer portal: https://dashboard.stripe.com/test/settings/billing/portal. `[U]`
5. Webhook for the **test site**: https://dashboard.stripe.com/test/webhooks → add an endpoint. URL: `[U]`
   ```text
   https://<test host>/api/stripe/webhook
   ```
   Events: `[V]` (the add-on handles these)
   ```text
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   customer.subscription.paused
   customer.subscription.resumed
   ```
   Copy its **Signing secret** (`whsec_...`) into `.env.test.local` as `STRIPE_WEBHOOK_SECRET`.
6. Webhook for **local dev**: the CLI prints its own `whsec_` for `.env.local`: `[V]` (the add-on's notes)
   ```bash
   pnpm dlx @stripe/cli@1.55.14 listen --forward-to localhost:3000/api/stripe/webhook
   ```
7. The agent pushes the test values, names only: `node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run --wrangler --env test`.

When it worked: on `/billing`, Subscribe and pay with card `4242 4242 4242 4242`. The page shows Active. `[V]` (the add-on's notes)

## Free tier

No monthly fee; Stripe charges per payment. Test mode is free. `[U]`, see https://stripe.com/pricing.

## Why / if it goes wrong

- **Webhook 400:** the signing secret is for a different endpoint. Each endpoint, and each `stripe listen`, has its own `whsec_`.
- **Webhook can't reach the test site behind Cloudflare Access or the password page:** add `/api/stripe/webhook` to `OPEN_PATHS` and to the Access app's public paths (the add-on's step 8).
- **"Billing isn't set up yet":** one of the three values is empty, or a live key was used without `STRIPE_ALLOW_LIVE`.
- **Stripe's agent tools** (`stripe agent setup`, its plugin and MCP server, the implementation planner): [`../setup/stripe.md`](../setup/stripe.md).
- Stripe's dashboard moves often (sandboxes, Workbench). If a link above lands somewhere else, follow Stripe's current docs at https://docs.stripe.com/keys and tell the agent so it opens an issue to fix this file.
