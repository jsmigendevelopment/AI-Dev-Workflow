# GitHub environments, secrets and variables

Last checked: 2026-11-23. Official docs:
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables
- `gh secret set --help` and `gh variable set --help` (the GitHub CLI)

How: the docs site was blocked here, so the pages were read from GitHub's public docs repo (`github/docs`, commit of 2026-11-20). `[V]` = matches that source. `[U]` = not checked.

**What it's for.** CI deploys with the values stored in three GitHub environments: `test`, `production` and `preview`. Environment secrets are only given to jobs that name that environment, so test jobs never see production keys.

**For `pnpm connect`.** The block below tells the script which names this file fills, where each one goes and which page to open. The steps stay in the sections below; the script prints them short. Format: the `secrets` skill.

```json connect
{
  "title": "GitHub environments",
  "order": 20,
  "url": "https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments",
  "steps": "## Walkthrough",
  "vars": {
    "SITE_URL": {"secret": false, "scope": ["production"], "to": ["github"], "shape": {"prefix": ["https://"]}},
    "APP_URL": {"secret": false, "scope": ["test", "production"], "to": ["github"], "shape": {"prefix": ["https://"]}}
  }
}
```

## What the workflows read

TanStack Start pack (`.github/workflows/deploy-test.yml`, `deploy-production.yml`, `preview.yml`):

| Name | Kind | test | production | preview | Who sets it |
|---|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | yes | yes | yes | you (`cloudflare.md` step 2) |
| `CLOUDFLARE_ACCOUNT_ID` | secret | yes | yes | yes | setup-cloudflare |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | secret | with Access | with Access on production | with Access | setup-cloudflare |
| `SITE_PASSWORD` | secret | with the password gate | no | with the password gate | setup-cloudflare |
| `APP_URL` | variable | optional | optional | no | you, if the URL isn't workers.dev |
| `SITE_URL` | variable | no | yes | no | you: the production origin, no trailing slash |

`GITHUB_TOKEN` is made by GitHub for each run. Never set it.

Add-ons add these (their `ADDON.md` says so):

| Name | Kind | Environments | Add-on |
|---|---|---|---|
| `SENTRY_AUTH_TOKEN` | secret | test, production | sentry |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_DSN` | variable | test, production | sentry |
| `VITE_CF_BEACON_TOKEN` | variable | test, production | analytics |

Monorepo + Expo pack (`.github/workflows/ci.yml`): repository variables (not environment ones) `E2E_API_URL` and `E2E_CLERK_PUBLISHABLE_KEY`. Both public.

## Walkthrough · about 5 minutes

1. Sign in the GitHub CLI once, in your own terminal:
   ```bash
   gh auth login
   ```
2. Make the environments. `setup-github` makes `test` and `production`, setup-cloudflare makes `preview`. To do it by hand: open `https://github.com/<owner>/<repo>/settings/environments`, click **New environment**, type the name, click **Configure environment**. `[V]`
3. Set each secret. The command asks for the value and hides it. Never type the value after the name:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --env test
   ```
4. Set each variable the same way (variables aren't secret, so the value may show):
   ```bash
   gh variable set SITE_URL --env production
   ```
5. Or let the secrets script push them all from `.env.test.local` and `.env.production.local`:
   ```bash
   node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run
   ```
6. Check, by name only:
   ```bash
   gh secret list --env test
   gh variable list --env production
   ```

In the web page instead: **Settings → Environments →** the environment **→ Environment secrets → Add secret**, type the **Name**, the value, then **Add secret**. Variables: **Environment variables → Add variable**. `[V]`

When it worked: `gh secret list --env test` shows each name with a date, and the next run of `deploy-test` gets past "Deploy".

## Free tier

- **Environments and environment secrets on a private repo need GitHub Pro, Team or Enterprise.** On GitHub Free they work on public repos only. `[V]`
- Required reviewers and wait timers on a private repo need Enterprise. Public repos get them on every plan. `[V]`
- `setup-github --plan free|team|enterprise` skips what your plan can't do and says why.

## Why / if it goes wrong

- **Free plan, private repo:** you can't store per-environment secrets. Options: make the repo public; upgrade; or the pack's repository mode, which `setup-github` turns on (repository variable `SECRETS_MODE=repository`): the workflows read repository secrets named `TEST_<name>` and `PRODUCTION_<name>`, and `pnpm connect` and `push-secrets` write those names, for example `gh secret set PRODUCTION_CLOUDFLARE_API_TOKEN`. Test and production keep separate values, but no required reviewer on production, no main-only rule, and every workflow on every branch can read the `PRODUCTION_` secrets. Ask the person; don't pick for them.
- **A secret is empty in the run:** it was set as a repository secret but the job reads the environment one, or the other way round. Check with `gh secret list` and `gh secret list --env <name>`.
- **Environment names aren't case sensitive** but must match the workflow: `test`, `production`, `preview`.
- **Values from forks:** pull requests from forks get no secrets. Previews of fork PRs won't deploy. That's on purpose.
- You can't read a secret back. To change it, set it again.
