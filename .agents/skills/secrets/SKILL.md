---
name: secrets
description: Use when an app needs API keys, environment variables or accounts wired up ("set up the env vars", "add my keys", "wire up Clerk", "the app needs secrets", or slice 0 of a new app) - lists every variable from .env.example with where to get it, asks whether the person wants to handle keys themselves or have the agent wire them, and pushes values to local, test and production without ever showing them in chat.
---

# Secrets: wire every key without pasting it into chat

Wiring environment variables is the slowest part of a new app. This makes it a checklist plus one script. **Key values never appear in the chat,** and you never read them: rule 9 in `AGENTS.md`.

The rules behind it (local, test, preview and production; committed config; the env schema; rotation; onboarding) are in `guide/environments.md` in the kit. Any agent that needs a value from the person comes through this checklist, never through chat.

## The `.env.example` convention

Every variable the app needs is listed in `.env.example`, with **no value**, under one comment line:

```bash
# Clerk publishable key · get it: https://dashboard.clerk.com → API keys · scope: local,test,production · secret: no
VITE_CLERK_PUBLISHABLE_KEY=
# Clerk secret key · get it: https://dashboard.clerk.com → API keys · scope: local,test,production · secret: yes
CLERK_SECRET_KEY=
```

When a step adds a service, it adds its variables here in this format.

## Steps

**When:** right after the issues are written, before the build starts (`idea` step 9 and `join`), so the first deploy is never stuck waiting on a key. Don't wait to be asked.

1. **List what's needed.** Read `.env.example` and show a table of the name, what it's for, where to get it, which environments, and whether it's secret. Mention any accounts to create first (for example Cloudflare, Clerk, Stripe).

2. **Ask once:** *"Do you want to set the keys up yourself, or should I wire them for you? Yourself means running one command in your own terminal that walks you through it. Either way, you'll type the values into a local file or a prompt, never into this chat."*

3. **Walk them through one provider at a time.** (Doing it themselves with `pnpm connect`? The script prints each walkthrough, so skip item 5 below; still do items 1 to 4, then go to step 4.) Each provider has a click-by-click file in [`providers/`](providers/). Group the variables by provider, finish one provider, then start the next.

   | Provider file | Fills |
   |---|---|
   | `cloudflare.md` | `wrangler login`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_TOKEN`, `CLOUDFLARE_ACCESS_TOKEN`, Zero Trust, `TURNSTILE_*`, `VITE_CF_BEACON_TOKEN` |
   | `github.md` | the `test`, `production` and `preview` environments, and every secret and variable the workflows read |
   | `clerk.md` | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` |
   | `google-oauth.md`, `github-oauth.md`, `facebook.md`, `linkedin.md`, `yandex.md`, `entra.md` | `ACCESS_<LOGIN>_CLIENT_ID`, `ACCESS_<LOGIN>_CLIENT_SECRET` (and `ACCESS_ENTRA_TENANT_ID`) for Cloudflare Access |
   | `stripe.md` | `STRIPE_*` |
   | `resend.md` | `RESEND_API_KEY`, `EMAIL_FROM` |
   | `sentry.md` | `SENTRY_*`, `VITE_SENTRY_DSN` |
   | `supabase.md` | `DATABASE_URL`, the Hyperdrive config |
   | `expo.md` | `EXPO_PUBLIC_*`, EAS, `E2E_*` |

   For each provider:
   1. **Re-check the official docs first.** Dashboards change. Fetch each URL under "Official docs" at the top of the file. If a page says something different from the file (a renamed button, a moved page, a new permission), follow the official docs, tell the person what changed, and open an issue to update the file, quoting the doc URL and what changed. The file is the kit's, so the issue also says "fix upstream in the kit". If you can't reach the docs, say so and use the file as it is.
   2. **If "Last checked" is more than 90 days old,** tell the person: *"These steps were last checked on <date>. Screens may have moved."*
   3. **Steps marked `[U]` weren't verified.** Say so when you give them.
   4. **Prefer the provider's CLI** where the file gives one (`wrangler`, `gh`, the Clerk CLI, the Stripe CLI, `sentry`, `supabase`, `eas`). Commands that sign in to the person's account run in **their** terminal. If the provider publishes agent skills or an MCP server, offer them; install only on a yes.
   5. Give the file's walkthrough as one "Setup step for you" from the `ask` skill: its numbered steps, links and copy blocks, what they'll see when it worked, and how long it takes. Keep the "Why / if it goes wrong" part for when they're stuck.

4. **If they'll do it themselves:** they run `pnpm connect` in **their own terminal**, not yours. Say: *"In a terminal in the app folder, run `pnpm connect`. It walks you through each service one at a time, opens the page, and asks for each key with hidden input. It takes about 10 minutes for Cloudflare and Clerk, longer with add-ons. Tell me when it's done."*
   - `pnpm connect clerk` does one provider. `--force` sets a value again. `--dry-run` shows what's set and what it would ask, by name only.
   - It lists the providers the app needs (from `.env.example` and the workflows' `secrets.*` and `vars.*`), prints each walkthrough's steps short, and asks before it opens a page.
   - It checks each value's shape where the provider has a rule, and asks before each destination: `.env.local` (mode 600), `wrangler secret put`, `gh secret set` or `gh variable set`. Values go on stdin, never in a command's arguments, and are never printed. Production needs its own yes.
   - Every value is read hidden; a public one is shown after Enter unless it looks like a secret key, which is refused. Typing from before a question is dropped, and a y/N question shows only y, n or yes, so a key pasted in the wrong place is never shown. A failing `wrangler` or `gh` prints only its exit code and the command to rerun by hand. It refuses to run without a terminal, so you never run it for them. Afterwards, check by name: `pnpm connect --dry-run` (✓ set, ✗ missing, ? couldn't check).
   - A step the script can't do (for example `wrangler login`, Clerk's CLI, a DNS record) stays in the printed steps for them to do.
   - Pack without the script? Give each variable's link, the `.env.local` line, and `gh secret set NAME --env <env>` or `npx wrangler secret put NAME --env <env>`, which ask for the value without showing it.

5. **If you're wiring them:**
   1. Copy `.env.example` to `.env.local`, and to `.env.test.local` and `.env.production.local` if the app deploys. Check all three are git-ignored.
   2. Ask the person to open those files and paste each value in, then tell you when they're done. Don't open the files yourself.
   3. Run the push script dry first. It prints names only:
      ```bash
      node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run
      ```
      On a Cloudflare stack, add `--wrangler`.
   4. Show the list and ask *"Push these?"* On a yes, run it again without `--dry-run`.
   5. Offer to delete `.env.production.local` now that the values are stored in GitHub and Cloudflare.

6. **Check it works.** Start the app. A missing variable fails at startup with its name (the pack's env schema does this). Then report which variables are set where, by name only.

## The connect block

Each file in `providers/` carries one fenced `json connect` block that `pnpm connect` reads. The steps stay in the markdown; the block only says what to ask and where it goes. Edit both together.

```jsonc
{
  "title": "Clerk",                       // shown as the provider's name
  "order": 30,                            // walk order: Cloudflare 10, GitHub 20, sign-in 30, add-ons 40+
  "url": "https://dashboard.clerk.com/~/api-keys",   // the page to open
  "steps": "## 1.",                       // the heading whose numbered steps are printed
  "vars": {
    "CLERK_SECRET_KEY": {
      "secret": true,                     // hidden input; a GitHub secret, not a variable
      "scope": ["local", "test", "production"],   // also "preview" (a GitHub environment)
      "to": [".env.local", "wrangler"],   // "wrangler", "github", "github-repo", or a file
      "shape": { "prefix": ["sk_test_", "sk_live_"] }   // optional; also "min", "max", and "notInProduction" (documented test values)
    }
  }
}
```

- A bare file name is in the app's folder (`.env.local`, `.env.cloudflare.local`). A path is from the repo root (`apps/mobile/.env`). No `..` or absolute paths; the script writes only inside the repo (symlinks followed) and only to a file git says it ignores.
- GitHub destinations go to the repo named by `origin`, passed as `-R owner/repo`; an inherited `GH_REPO` is dropped.
- A prefix with `_test_` is refused in production, and one with `_live_` everywhere else. A `-----BEGIN …-----` prefix reads the key to its matching END line.
- Local and test share one value; `"split": true` asks for them separately. Production is always asked separately, after its own yes.
- A variable may name its own `"steps"` heading and `"url"`.
- A provider with nothing to store (Supabase) has no block and says why. `cli/test/connect-blocks.test.mjs` checks every file.

`pnpm connect` is based on Matt Pocock's wizard (MIT): https://github.com/mattpocock/skills/tree/main/skills/engineering/wizard

## Rules

- Production values live only in the GitHub `production` environment and the host's production secrets. Never in the repo, never in a test environment.
- Use test or sandbox keys for local and test (for example Stripe test mode, Clerk development instance).
- A variable without `secret: yes` is public. It's fine in a GitHub variable or a `VITE_` client value. A secret never gets a `VITE_` prefix.
- Settings that aren't secret go in committed config per environment (for example `vars` in `wrangler.jsonc`), not in a secret store.
- Previews use the test values. `scope` lists `local`, `test` and `production`.
- New variable later? In one pull request, add it to `.env.example` in the same format, to the env schema (`lib/env.ts`) and to the docs. Then run this skill again.
- **Rotating a key:** make the new key first, set it everywhere it lives (test, then production), deploy test and check, then revoke the old one. Write the date and reason in `docs/decisions.md`, never the value. The person does production. Full steps: `guide/environments.md`.
- A command that prints a key (for example Clerk's `env pull --print`) runs only in the person's own terminal, never in yours. They paste the output into the git-ignored file; the push script takes it from there.
- If the person pastes a value into chat anyway, don't repeat it. Tell them, and ask them to rotate that key.
