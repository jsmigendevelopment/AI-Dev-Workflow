# Environments and environment variables

Where each setting and secret lives, how to add one, how to rotate one, and how a new teammate gets set up. The `secrets` skill runs the steps. This page has the rules and the reasons. Rule 16 in [app-conventions.md](app-conventions.md) is the short version.

The examples name the default stack (Cloudflare Workers, deployed from the agent's session). Another host keeps the rule and swaps the tool. A Go service runs on Google Cloud Run with its database on Neon (decision 340-1), and each example has its **Go service** form beside it. No environment is deployed by GitHub Actions: every repo is `ci = "local"` (`docs/stack.md`).

## 1. Four environments

| Environment | What it is | Who deploys | Keys |
|---|---|---|---|
| **local** | the app on a developer's machine | the developer | test or sandbox keys, in their own `.env.local` |
| **test** | the shared test site. Main is deployed to it after each merge | the session (`pnpm deploy:test`; a Go service: `gcloud run deploy --source .` to its test service) | test keys, in the host |
| **preview** | one short-lived copy per pull request, if the host offers it | the session (`pnpm deploy:preview <n>`; a Go service: a tagged revision of the test service, `gcloud run deploy --no-traffic --tag`) | the test environment's values |
| **production** | the real app with real users | the session, only after the person's yes | production keys, only in the host |

**Agents get test keys only.** Production keys and settings stay with the person (the always-stop list in `AGENTS.md`).

**Why:** a preview or test site that can reach production data turns a bad pull request into a real incident. Separate keys keep a mistake inside the test world.

## 2. Each developer has their own `.env.local`

- Copy `.env.example` to `.env.local` and fill it with your own test keys.
- It's git-ignored. Never commit it, never share it, never paste it in chat.
- Agents never open it. They refer to a variable by name only (rule 9 in `AGENTS.md`).

**Why:** a shared `.env` file gets passed around in chat and email, and nobody knows who has it. Your own file with your own test keys can be thrown away.

## 3. Settings that aren't secret go in committed config

A setting that's safe to read in public (an app name, a feature flag's default, a public URL, a Clerk publishable key) goes in committed config, per environment: for example `vars` under each `env` in `wrangler.jsonc`. A Go service sets every variable on every deploy (its plain ones on the Cloud Run service), never just once: a new revision keeps the values of the one before it, so a variable left out of a deploy stays as it was.

**Why:** committed config shows up in review, has history, and is the same for everyone. A setting kept only in a dashboard changes with no record.

## 4. Secrets live only in secret stores

- **The host's secret store:** `npx wrangler secret put NAME --env test`. A Go service: Secret Manager. The person types the value into their git-ignored `.env.test.local`, and `node .agents/skills/secrets/scripts/push-secrets.mjs --cloud-run` sends it to Secret Manager with the value on stdin, never in an argument. The deploy wires each secret into the service (`--update-secrets`).
- **The deploy's own values** (the test site's service token for the smoke test): the shell or a git-ignored `.env.cloudflare.local`, read by the deploy script and handed only to the smoke test.
- Never in the repo, a committed config file, a log, an error message or the client bundle.
- A secret never gets a `VITE_` prefix. That prefix ships it to every browser.

**Why:** a secret in git stays in the history forever, even after you delete the line.

**Setup-only secrets** stay on the machine that runs the setup. The tokens a setup script needs, and the OAuth client secrets for a sign-in page such as Cloudflare Access (`ACCESS_GOOGLE_CLIENT_SECRET` and the like), go in a git-ignored file such as `.env.cloudflare.local` or the shell. A Go service's one setup-only secret is the Neon API key, in a git-ignored `.env.neon.local`. Its host login (`gcloud auth login`) is the person's own, in their terminal, and leaves no file. Never a command-line argument: those show up in shell history and in the process list. The script sends the value to the one service that needs it and never prints it.

**Why:** the app never needs these at runtime. Keeping them out of the host means one less place they can leak.

## 5. Who can open each environment

| Environment | Default | Option |
|---|---|---|
| **test** and **preview** | open, but `noindex` | Cloudflare Access (a sign-in page: Google, GitHub and others, or a one-time PIN by email) or a password page. The person picks at setup |
| **production** | open to everyone (a "Coming soon" page until launch) | Access in front of all of it (an internal tool) or of some paths (`/admin/*`). A production change: dry run, then the person's yes |

With Access on, the app also checks Access's signed token on every protected request, and refuses anything without a valid one. The deploy scripts' smoke tests get in with a service token of their own, one for test and one for production.

**Why:** a test site with real-looking data, or an admin page, should not be one leaked link away from anyone. Checking the token in the app too means a mistake in the Access settings fails closed, not open.

## 6. One typed, validated env schema

- `lib/env.ts` reads every variable through one Zod schema at startup. Nothing else reads `process.env` or the Worker's `env` directly.
- A Go service reads one typed `Config` struct, loaded once at start in `cmd/api`. Only `main` calls `os.Getenv`. The shape and its example are section 16 of [app-conventions-go.md](app-conventions-go.md#16-environment-variables), not repeated here.
- A missing or malformed variable fails startup with a message that **names the variable, never its value:** `Missing env: CLERK_SECRET_KEY`.
- The schema marks each variable as secret or public, and as server-only or client-safe.

**Why:** an app that starts with a missing key fails later, in front of a user, with a confusing error. Failing at startup with the name is a one-minute fix.

## 7. `.env.example` lists every variable

Every variable is in `.env.example` with no value, under one comment line in the format the `secrets` skill uses:

```bash
# Clerk secret key · get it: https://dashboard.clerk.com → API keys · scope: local,test,production · secret: yes
CLERK_SECRET_KEY=
```

`scope` lists `local`, `test` and `production`. Previews use the test values.

## 8. Adding a variable

One pull request does all of it:
1. the line in `.env.example`, in the format above;
2. the entry in `lib/env.ts` (a Go service: the field in the `Config` struct);
3. the docs: `docs/stack.md` if it's a new service, and the module's doc if it uses it;
4. for a setting that isn't secret, the value in committed config for each environment.

Then the `secrets` skill sets the values. A test checks that `.env.example` and the schema (a Go service: the struct) list the same names.

**Why:** a variable added in only one of those places breaks the next deploy, or the next teammate's first run.

## 9. Rotating a key

Do this when a key may have leaked, when someone with access leaves, or on the service's schedule.

1. Make a new key in the service's dashboard. Keep the old one working.
2. Set the new value in each place it lives: `.env.local`, `npx wrangler secret put NAME --env <env>`, `gh secret set NAME --env <env>`. Test first, then production. A Go service: the git-ignored `.env.<env>.local`, then `push-secrets.mjs --cloud-run --env <env>`, which adds a new Secret Manager version.
3. Deploy test and check it works. The person deploys production.
4. Revoke the old key in the dashboard.
5. Write the date and the reason in `docs/decisions.md`. Never the value.

A leaked production key is a 🛑 blocker through the `ask` skill. The person does steps 1, 2 and 4 for production.

**Why:** making the new key before revoking the old one means no downtime. Revoking last means the leak stops for good.

## 10. Onboarding a new teammate

1. Give them access to the GitHub repo and the test accounts of each service (Cloudflare, Clerk, and the rest in `docs/stack.md`; a Go service: Google Cloud and Neon). Not production, unless the person decides so.
2. They clone the repo, install, and copy `.env.example` to `.env.local`.
3. They run the `secrets` skill. It lists each variable with where to get it.
4. They start the app. A missing variable fails with its name, so they know what's left.
5. They read `AGENTS.md` and `docs/state.md`.

**Why:** a first day spent hunting for keys is a lost day. The list plus the schema make it an hour.

## 11. How agents ask the person for a value

- **Always through the `secrets` skill's checklist,** never in chat. The agent names the variable, says where to get it, and says which file or command takes it. The person types the value into the file or a prompt that hides it.
- Each step uses the "Setup step for you" format from the `ask` skill: numbered steps, the exact link, the exact text to copy, what you'll see when it worked, and how long it takes.
- The agent never asks the person to paste a value in chat. If they do anyway, the agent says so, doesn't repeat it, and asks them to rotate that key (rule 9).

**Why:** a value in chat is stored in the chat log, outside every secret store, and can't be taken back.
