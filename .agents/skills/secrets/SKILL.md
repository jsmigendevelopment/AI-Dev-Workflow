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

1. **List what's needed.** Read `.env.example` and show a table of the name, what it's for, where to get it, which environments, and whether it's secret. Mention any accounts to create first (for example Cloudflare, Clerk, Stripe).

2. **Ask once:** *"Do you want to set the keys up yourself, or should I wire them for you? Either way, you'll type the values into a local file or a prompt, never into this chat."*

3. **If they'll do it themselves:** give the checklist, each variable as a "Setup step for you" from the `ask` skill (numbered steps, the exact link, the exact text to copy, what they'll see when it worked, how long it takes). For each variable:
   - the link where they get it;
   - for local development, the line to add to `.env.local`;
   - for test and production, the commands to run, which ask for the value without showing it:
     ```bash
     gh secret set NAME --env production
     ```
     ```bash
     npx wrangler secret put NAME --env production
     ```
     (use the second only on a Cloudflare stack).

4. **If you're wiring them:**
   1. Copy `.env.example` to `.env.local`, and to `.env.test.local` and `.env.production.local` if the app deploys. Check all three are git-ignored.
   2. Ask the person to open those files and paste each value in, then tell you when they're done. Don't open the files yourself.
   3. Run the push script dry first. It prints names only:
      ```bash
      node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run
      ```
      On a Cloudflare stack, add `--wrangler`.
   4. Show the list and ask *"Push these?"* On a yes, run it again without `--dry-run`.
   5. Offer to delete `.env.production.local` now that the values are stored in GitHub and Cloudflare.

5. **Check it works.** Start the app. A missing variable fails at startup with its name (the pack's env schema does this). Then report which variables are set where, by name only.

## Rules

- Production values live only in the GitHub `production` environment and the host's production secrets. Never in the repo, never in a test environment.
- Use test or sandbox keys for local and test (for example Stripe test mode, Clerk development instance).
- A variable without `secret: yes` is public. It's fine in a GitHub variable or a `VITE_` client value. A secret never gets a `VITE_` prefix.
- Settings that aren't secret go in committed config per environment (for example `vars` in `wrangler.jsonc`), not in a secret store.
- Previews use the test values. `scope` lists `local`, `test` and `production`.
- New variable later? In one pull request, add it to `.env.example` in the same format, to the env schema (`lib/env.ts`) and to the docs. Then run this skill again.
- **Rotating a key:** make the new key first, set it everywhere it lives (test, then production), deploy test and check, then revoke the old one. Write the date and reason in `docs/decisions.md`, never the value. The person does production. Full steps: `guide/environments.md`.
- If the person pastes a value into chat anyway, don't repeat it. Tell them, and ask them to rotate that key.
