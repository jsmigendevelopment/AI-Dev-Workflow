# PostHog (only if the person picks PostHog over the `analytics` add-on)

Last checked: 2026-11-27. Official docs:
- https://posthog.com/docs/libraries/js
- https://posthog.com/docs/libraries/tanstack-start
- https://posthog.com/docs/api

How: fetched those three pages on 2026-11-27. They say the project token and host are on the project settings page (https://us.posthog.com/settings/project), and the host is `https://us.i.posthog.com` (US cloud) or `https://eu.i.posthog.com` (EU cloud). `[V]` Screen and button names below weren't seen: no sign-in was used. `[U]`

**What it's for.** Product events, funnels and session replay. Setup, the wizard and the kit's rules: [`../setup/posthog.md`](../setup/posthog.md). Fills:

```text
VITE_PUBLIC_POSTHOG_PROJECT_TOKEN   phc_...  (public: it ships in the browser bundle)
VITE_PUBLIC_POSTHOG_HOST            https://us.i.posthog.com or https://eu.i.posthog.com
```

Use a separate PostHog project for test and production, so test events never mix with real ones. `[U]` (kit advice)

**For `pnpm connect`.** The block below tells the script which names this file fills, where each one goes and which page to open. The steps stay in the sections below; the script prints them short. Format: the `secrets` skill.

```json connect
{
  "title": "PostHog",
  "order": 50,
  "url": "https://us.posthog.com/settings/project",
  "steps": "## Walkthrough",
  "vars": {
    "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN": {"secret": false, "scope": ["local", "test", "production"], "to": [".env.local", "wrangler"], "shape": {"prefix": ["phc_"]}},
    "VITE_PUBLIC_POSTHOG_HOST": {"secret": false, "scope": ["local", "test", "production"], "to": [".env.local", "wrangler"], "shape": {"prefix": ["https://"]}}
  }
}
```

## Make each key

For an agent driving the browser once the person has signed in (`secrets`, "Keys on Full"). Open the page and fill in what the row says. The button that makes or shows a secret value, and any code after it, are the person's. `[V]` = checked against PostHog's docs on 2026-11-27.

| Variable | Open | Pick |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` | https://us.posthog.com/settings/project | Nothing to make: the project token (`phc_...`) is shown on the project settings page of the test project. EU cloud: the same path on `eu.posthog.com`. Not secret, but it still goes in through the paste, never chat. `[V]` the page, `[U]` the field name. |
| `VITE_PUBLIC_POSTHOG_HOST` | https://us.posthog.com/settings/project | Nothing to make: `https://us.i.posthog.com` for the US cloud, `https://eu.i.posthog.com` for the EU cloud, matching the region in `docs/decisions/`. Not secret. `[V]` |

## Walkthrough · about 5 minutes

1. Make an account at https://app.posthog.com/signup and pick US or EU cloud, as recorded in the decision. Never sign up for the person. `[V]` the page
2. Make a project for test (and later one for production). `[U]`
3. Open the project settings page: https://us.posthog.com/settings/project (EU: `eu.posthog.com`). Copy the project token. `[V]`
4. Paste it into `.env.test.local` as `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`, with `VITE_PUBLIC_POSTHOG_HOST` next to it. The production project's values go in `.env.production.local`.
5. The agent pushes them, names only: `node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run --wrangler`.

When it worked: one `track()` call shows up once in PostHog's activity view. `[U]` the view's name.

## Free tier

PostHog has a free monthly allowance of events and recordings. `[U]`, see https://posthog.com/pricing.

## Why / if it goes wrong

- **"Project token invalid":** the token is from another project or region, or the host doesn't match the region. `[V]` (the API page)
- **Nothing arrives:** the host is missing `i.` (`us.i.posthog.com`), or the CSP blocks it: add the host to `CSP_EXTRA` (`../setup/posthog.md`).
- **A personal API key (`phx_...`) is a different thing:** it reads data and is secret. The app doesn't need one. `[U]`
