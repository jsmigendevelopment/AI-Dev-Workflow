# GitHub sign-in for Cloudflare Access

Last checked: 2026-11-23. Official docs:
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/github/
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app

How: read from the public docs repos (`cloudflare/cloudflare-docs`, commit of 2026-11-22; `github/docs`, commit of 2026-11-20). `[V]` = matches that source. `[U]` = not checked.

**What it's for.** A "Sign in with GitHub" button on the Access page. It can also allow a whole GitHub org (`--allow-github-org`). Fills, in `.env.cloudflare.local` (git-ignored):

```text
ACCESS_GITHUB_CLIENT_ID=
ACCESS_GITHUB_CLIENT_SECRET=
```

You need your **team domain**: `<team>.cloudflareaccess.com` (setup-cloudflare prints it).

## Walkthrough · about 3 minutes

1. Open https://github.com/settings/applications/new. This is an **OAuth app**, not a GitHub App. (Same page: profile picture → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.) `[V]`
2. **Application name:** your app's name. **Homepage URL:** `[V]`
   ```text
   https://<team>.cloudflareaccess.com
   ```
   **Authorization callback URL:** `[V]`
   ```text
   https://<team>.cloudflareaccess.com/cdn-cgi/access/callback
   ```
3. Click **Register application**. Copy the **Client ID**. Click **Generate a new client secret** and copy it. `[V]`
4. Paste both into `.env.cloudflare.local` after the names above. Never into chat.
5. After the agent runs setup-cloudflare: open **Zero Trust → Integrations → Identity providers → GitHub**, click **Finish setup**, then **Authorize**. It asks to read orgs and teams, and email addresses. `[V]`

When it worked: setup-cloudflare says `exists  GitHub login`, and **Test** next to GitHub in Zero Trust signs you in. `[V]`

## Free tier

Free on every GitHub plan.

## Why / if it goes wrong

- **Org policy blocks someone who just joined the org:** they must revoke the app in their GitHub settings, then sign in again. `[V]`
- **Two-factor on GitHub:** sign in to GitHub first, then come back to Access. `[V]`
- **Leave "Enable Device Flow" off.** Access doesn't need it.
- The secret is shown once. Lost it? Generate a new one and update the file.
