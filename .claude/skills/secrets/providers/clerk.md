# Clerk

Last checked: 2026-11-23. Official docs:
- https://clerk.com/docs/cli
- https://clerk.com/docs/getting-started/quickstart/setup-clerk
- https://clerk.com/docs/guides/development/managing-environments
- https://clerk.com/docs/guides/development/deployment/production
- https://clerk.com/docs/guides/development/deployment/expo
- https://clerk.com/docs/guides/development/clerk-environment-variables
- https://clerk.com/docs/guides/sessions/manual-jwt-verification
- https://clerk.com/docs/guides/dashboard/dns-domains/subdomain-allowlist
- Clerk's agent-setup prompt, `prompts/cli-setup.md` in `clerk/clerk-docs`
- `clerk env pull` and the framework table in `clerk/cli` (`packages/cli-core/src/commands/env/README.md`, `src/lib/framework.ts`)

How: clerk.com was blocked here, so these were read from Clerk's public repos (`clerk/clerk-docs`, commit of 2026-11-22; `clerk/cli`, commit of 2026-11-20). `[V]` = matches that source. `[U]` = not checked. Nothing here was run against a real Clerk account.

**What it's for.** Sign-in. The pack reads:

```text
CLERK_PUBLISHABLE_KEY   pk_test_... or pk_live_...   public
CLERK_SECRET_KEY        sk_test_... or sk_live_...   secret
CLERK_JWT_KEY           optional, the JWKS Public Key (PEM), public
```

The mobile app (monorepo pack) reads `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`: the same key as the web app.

**Which keys where.** A Clerk app has two instances. `[V]`

| Where | Instance | Keys |
|---|---|---|
| local, test (workers.dev), previews | Development | `pk_test_`, `sk_test_` |
| production on your own domain | Production | `pk_live_`, `sk_live_` |

Production keys need a domain you own and can add DNS records to. They don't work on a host's shared domain such as `*.workers.dev`. `[V]` (Clerk names `*.vercel.app`; workers.dev is the same case.)

## Clerk's CLI, and its agent prompt (reviewed copy)

Clerk publishes a CLI and a setup prompt for agents. This is the part that fits this kit, checked against the sources above on 2026-11-23. `[V]` unless marked.

- Run it with `pnpm dlx clerk@latest` (npm: `npx -y clerk@latest`). Never install it globally.
- **This pack already has Clerk wired.** That's Clerk's "existing Clerk project" case: **never run `clerk init`.** A signed-out `init` can make a second app and replace the keys.
- **Accountless (keyless) mode doesn't apply to this pack.** `init` and the SDK can make a claimable app with temporary keys and no account. But the pack turns Clerk off unless both keys are set (`src/server/auth.ts`, read on 2026-11-23), so with no keys there's no sign-in at all, keyless or not. Local dev without a Clerk account works; sign-in is just off.
- **Clerk's agent skills.** `npx skills add clerk/skills`. Offer them; install only on a yes.
- **Agent rules from Clerk's prompt that the kit keeps:** never read env files or the claim files (`.clerk/keyless.json`, `.clerk/.tmp/keyless.json`); never choose an app for the person; never pull production keys without `--print`; never write your own pipe into a host's CLI.
- Other commands: `clerk doctor` (checks the setup), `clerk config pull` and `clerk config patch --dry-run` (sign-in options), `clerk enable orgs`, and for tests in an automated browser `clerk users create --email <unique>+clerk_test@example.com --password <random> --yes` with code `424242`. Ask before creating users in an existing app.

Not copied on purpose: Clerk's Next.js, Vercel and iOS steps, and anything naming one person's app.

## 1. Development keys (local, test, previews) · about 5 minutes

1. Make an account and an app (skip if you have one): https://dashboard.clerk.com/sign-up, then the **Create application** card. Pick how people sign in (email, Google and so on). `[V]`
2. In your own terminal, in the app folder, sign the CLI in and pick the app:
   ```bash
   pnpm dlx clerk@latest auth login
   pnpm dlx clerk@latest apps list --json
   pnpm dlx clerk@latest link --app <the app id you chose>
   ```
3. Pull the development keys into the local file, and into the test file the secrets script reads. The agent may run these: they write files and print no values. `[V]` flags:
   ```bash
   pnpm dlx clerk@latest env pull --instance dev
   pnpm dlx clerk@latest env pull --instance dev --file .env.test.local
   ```
4. **Rename one line in both files.** Clerk's CLI writes `VITE_CLERK_PUBLISHABLE_KEY` for TanStack Start (`[V]`, from `framework.ts`), but this pack reads `CLERK_PUBLISHABLE_KEY`. Open each file in your editor and change the name, keep the value:
   ```text
   CLERK_PUBLISHABLE_KEY=
   ```
5. Optional, for `/api/v1` without a call to Clerk: on https://dashboard.clerk.com/~/api-keys copy the **JWKS Public Key** into `CLERK_JWT_KEY` in the same files. `[V]` page, `[U]` exact label placement.
6. Check:
   ```bash
   pnpm dlx clerk@latest doctor
   ```

No CLI? Open https://dashboard.clerk.com/~/api-keys. In **Quick copy**, click **Insert a new secret key**, copy both keys into `.env.local` and `.env.test.local`. The secret key is shown once. `[V]`

When it worked: `pnpm dev` shows a sign-in button, and you can sign up. The keys start with `pk_test_` and `sk_test_`.

## 2. Production keys (only with your own domain) · about 15 minutes, plus DNS time

This is a production step: the person says yes first (always-stop list).

1. Make the production instance. The agent can run this after the person names the domain:
   ```bash
   pnpm dlx clerk@latest deploy --mode agent --domain <your domain>
   ```
   Follow each `nextAction` in its JSON report: the DNS records to add and the OAuth credentials to enter. In the dashboard instead: the **Development** menu at the top → **Create production instance**. `[V]`
2. Add the DNS records it lists (or see https://dashboard.clerk.com/~/domains). It can take up to 48 hours. Check:
   ```bash
   pnpm dlx clerk@latest deploy status --mode agent
   ```
   It exits 0 only when production is complete. `[V]`
3. **The person, in a separate terminal of their own, not the agent's session:**
   ```bash
   pnpm dlx clerk@latest env pull --instance prod --print
   ```
   It prints two `KEY=value` lines. `[V]`
4. Open `.env.production.local` (git-ignored) in your editor. Paste the two lines. Rename `VITE_CLERK_PUBLISHABLE_KEY` to `CLERK_PUBLISHABLE_KEY`. Save. Clear the terminal.
5. The agent pushes them, names only, after a dry run and the person's yes:
   ```bash
   node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run --wrangler --env production
   ```
6. Turn on **Allowed subdomains**: https://dashboard.clerk.com/~/domains → **Allowed subdomains** tab → **Enable allowed subdomains**, add only the subdomains the app uses. `[V]`

Mobile app in production: also enable the **Native API** on https://dashboard.clerk.com/~/native-applications with the production instance selected, or calls fail with `native_api_disabled`. `[V]`

When it worked: the production site's sign-in shows your domain, not `accounts.dev`, and keys start with `pk_live_` and `sk_live_`.

## Free tier

A development instance is capped at 100 users and shows a "Development" banner. Paid features work in development, but production asks you to upgrade if you use them. `[V]` For today's free limits in production, see https://clerk.com/pricing (`[U]`, not read here).

## Why / if it goes wrong

- **Why the person runs `--print`:** a plain `env pull --instance prod` writes production keys over your development keys. `--print` touches no file, and running it in your own terminal keeps the values out of the agent's chat log. The secrets script then sends each value to GitHub and Cloudflare on stdin and prints names only.
- **"Missing env: CLERK_PUBLISHABLE_KEY"** after `env pull`: the rename in step 4 was missed.
- **Two apps by mistake:** someone ran `clerk init`. Pick one app; don't switch without the person's yes.
- **Users don't copy** from development to production. Production starts empty. `[V]`
- **Social logins:** development uses Clerk's shared OAuth credentials. Production needs your own for each provider. `[V]`
- **Pack gaps found while checking (not fixed here):** the pack doesn't set Clerk's `authorizedParties`, which Clerk strongly recommends; and `.clerk/` isn't in the pack's `.gitignore`, so a claim file could be committed if anyone runs `init` or keyless mode.
