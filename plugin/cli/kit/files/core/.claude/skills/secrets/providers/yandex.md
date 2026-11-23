# Yandex sign-in for Cloudflare Access

Last checked: 2026-11-23. Official docs:
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/yandex/

How: read from Cloudflare's public docs repo (`cloudflare/cloudflare-docs`, commit of 2026-11-22). Yandex's own docs (yandex.com/dev/id) were blocked here and have no public docs repo. Cloudflare's page uses older Yandex names (for example "Yandex.Passport API" and "Callback URL #1"); Yandex's screen may say "Yandex ID API" and "Redirect URI" now. Both are given. `[V]` = matches Cloudflare's page. `[U]` = not checked.

**What it's for.** A "Sign in with Yandex" button on the Access page. Fills, in `.env.cloudflare.local` (git-ignored):

```text
ACCESS_YANDEX_CLIENT_ID=
ACCESS_YANDEX_CLIENT_SECRET=
```

You need your **team domain**: `<team>.cloudflareaccess.com` (setup-cloudflare prints it).

## Walkthrough · about 5 minutes

1. Sign in to Yandex and open https://oauth.yandex.com/client/new (Cloudflare: **Open a new OAuth Application → New client**). Fill in the required fields. `[V]` steps, `[U]` the deep link.
2. Under **Yandex.Passport API** (or **Yandex ID API**), tick **Access to email address**, **Access to user avatar** and **Access to username, first name and surname, gender**. `[V]`
3. Platform: **Web services**. In **Callback URL #1** (or **Redirect URI**), paste: `[V]`
   ```text
   https://<team>.cloudflareaccess.com/cdn-cgi/access/callback
   ```
4. Click **Add**, then **Submit** (or **Create app**). `[V]`
5. Copy the **ID** (ClientID) into `ACCESS_YANDEX_CLIENT_ID` and the **Password** (Client secret) into `ACCESS_YANDEX_CLIENT_SECRET`, in `.env.cloudflare.local`. Never into chat. `[V]`

When it worked: setup-cloudflare says `exists  Yandex login`, and **Test** in **Zero Trust → Integrations → Identity providers** signs you in.

## Free tier

Free. `[U]`

## Why / if it goes wrong

- **No email in the sign-in:** the email scope in step 2 wasn't ticked. Access needs the email to match a policy.
- **Redirect error:** the callback URL isn't exact.
- If Yandex's screen differs from both names above, follow Yandex's screen and tell the agent so it opens an issue to fix this file.
