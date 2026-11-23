# Cloudflare

Last checked: 2026-11-23. Official docs:
- https://developers.cloudflare.com/fundamentals/account/create-account/
- https://developers.cloudflare.com/workers/wrangler/commands/general/#login
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- https://developers.cloudflare.com/fundamentals/api/reference/template/
- https://developers.cloudflare.com/cloudflare-one/setup/
- https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/
- https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- https://developers.cloudflare.com/web-analytics/get-started/

How: the docs site was blocked here, so these were read from Cloudflare's public docs repo (`cloudflare/cloudflare-docs`, commit of 2026-11-22). `[V]` = matches that source. `[U]` = not checked, written generically.

**What it's for.** The host. `wrangler login` lets `setup-cloudflare` and the agent create Workers and databases. Three API tokens do three jobs, so a leak of one can't do the others' work.

| Name | Where it goes | Secret |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | GitHub environments `test`, `production`, `preview` (setup-cloudflare sets it) | no, but stored as one |
| `CLOUDFLARE_API_TOKEN` | GitHub environments `test`, `production`, `preview` (deploys) | yes |
| `CLOUDFLARE_ZONE_TOKEN` | `.env.cloudflare.local` only (setup-cloudflare) | yes |
| `CLOUDFLARE_ACCESS_TOKEN` | `.env.cloudflare.local` only (setup-cloudflare) | yes |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | `.env.local`, then the secrets script | site key no, secret yes |
| `VITE_CF_BEACON_TOKEN` (analytics add-on) | GitHub variable in `test` and `production` | no |

## 1. Account and login · about 3 minutes

1. Sign up (skip if you have an account): https://dash.cloudflare.com/sign-up. Enter **Email** and **Password**, click **Create Account**, then click the link in the email. `[V]`
2. In the app folder, in your own terminal:
   ```bash
   pnpm exec wrangler login
   ```
   A browser opens. Click **Allow**. `[V]` for the command, `[U]` for the button name.
3. Check it:
   ```bash
   pnpm exec wrangler whoami
   ```

When it worked: `whoami` prints your email and account. Then the agent runs `node scripts/setup-cloudflare.mjs --dry-run`.

## 2. The deploy token for GitHub · about 4 minutes

1. Open https://dash.cloudflare.com/profile/api-tokens and click **Create Token**. `[V]`
2. Next to **Edit Cloudflare Workers**, click **Use template**. `[V]` template name, `[U]` button name.
3. Add these permissions (click **+ Add more** for each row). `[V]` names:
   ```text
   Account · D1 · Edit
   Account · Queues · Edit        (only with the jobs add-on)
   ```
4. **Account Resources:** your account only. **Zone Resources:** only the app's domain, or none if you have no domain yet. **Token expiration:** a date about 1 year out. `[V]`
5. Click **Continue to summary**, then **Create Token**. The token is shown once. `[V]`
6. Store it in each GitHub environment. Each command asks for the value and hides it:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --env test
   gh secret set CLOUDFLARE_API_TOKEN --env production
   gh secret set CLOUDFLARE_API_TOKEN --env preview
   ```

When it worked: `gh secret list --env test` lists `CLOUDFLARE_API_TOKEN`, and the next deploy passes its Deploy step.

## 3. The zone token (only with your own domain) · about 3 minutes

1. Open https://dash.cloudflare.com/profile/api-tokens, click **Create Token**, then **Create Custom Token** (`[U]` button name).
2. Permissions (`[V]` names):
   ```text
   Zone · Zone · Read
   Zone · Zone Settings · Edit
   Zone · Zone WAF · Edit
   Zone · Bot Management · Edit
   ```
3. **Zone Resources:** only the app's domain. Set an expiry. **Continue to summary**, **Create Token**. `[V]`
4. Open `.env.cloudflare.local` (git-ignored) in your editor and add one line. Never paste it in chat:
   ```text
   CLOUDFLARE_ZONE_TOKEN=
   ```

When it worked: setup-cloudflare stops saying "Zone settings ... need a zone token".

## 4. Zero Trust and the Access token (only for Cloudflare Access) · about 6 minutes

1. Open https://one.dash.cloudflare.com (or the dashboard, then **Zero Trust**). Pick a **team name**. Pick the **Zero Trust Free plan**. It still asks for payment details, but the Free plan doesn't charge. That's your call. `[V]`
2. Open https://dash.cloudflare.com/profile/api-tokens, click **Create Token**, then **Create Custom Token** (`[U]`).
3. Permissions (`[V]` names):
   ```text
   Account · Access: Apps and Policies · Edit
   Account · Access: Service Tokens · Edit
   Account · Access: Organizations, Identity Providers, and Groups · Edit
   Account · Workers Scripts · Read
   ```
4. **Account Resources:** this account only. Set an expiry. **Continue to summary**, **Create Token**. `[V]`
5. Add it to `.env.cloudflare.local`:
   ```text
   CLOUDFLARE_ACCESS_TOKEN=
   ```
6. For each sign-in you picked, open its file: `google-oauth.md`, `github-oauth.md`, `facebook.md`, `linkedin.md`, `yandex.md`, `entra.md`.

When it worked: setup-cloudflare's dry run lists the Access application it would create. Your team domain is in **Zero Trust → Settings → Team name and domain**. `[V]`

## 5. Turnstile keys (forms that opt in) · about 2 minutes

1. Open https://dash.cloudflare.com/?to=/:account/turnstile and click **Add widget**. `[V]`
2. **Widget name:** the app name. **Region:** Rest of World. **Hostname management:** the test host and the production domain. **Widget mode:** Managed. Click **Create**. `[V]`
3. Copy the **sitekey** to `TURNSTILE_SITE_KEY` and the **secret key** to `TURNSTILE_SECRET_KEY`, in `.env.test.local` and `.env.production.local`. `[V]`

For local dev, use Cloudflare's test keys in `.env.local` (they always pass; not secret):
```text
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

## 6. Web Analytics token (analytics add-on) · about 2 minutes

1. Open https://dash.cloudflare.com/?to=/:account/web-analytics and click **Add a site**. `[V]`
2. Type the site's hostname, pick it, click **Done**. `[V]`
3. In **Manage site**, copy the JS snippet's `token` value. Store it as a variable (not a secret):
   ```bash
   gh variable set VITE_CF_BEACON_TOKEN --env test
   gh variable set VITE_CF_BEACON_TOKEN --env production
   ```

## Free tier

Workers, D1, Turnstile, Web Analytics and Zero Trust (Free plan) have free tiers. Check https://www.cloudflare.com/plans/ for today's limits (`[U]`, not read here).

## Why / if it goes wrong

- **Three tokens, not one.** The deploy token lives in CI. The zone and Access tokens can change your domain and who can log in, so they stay on your machine. Never give them to CI.
- **"Authentication error" on deploy:** the token lacks a permission above, or its Account Resources is the wrong account.
- **`wrangler login` on a remote machine** ends on "This site can't be reached". Run it on your own computer, or see the login doc above.
- **A token is shown once.** Lost it? Roll or delete it on the API Tokens page and make a new one.
- New tokens start with `cfut_`. If yours doesn't, it may be an old Global API Key. Don't use that.
- **Token expiry:** put the date in your calendar. Deploys stop the day it expires.
