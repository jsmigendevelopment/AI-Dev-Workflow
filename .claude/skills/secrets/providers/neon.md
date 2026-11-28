# Neon (a Go service's database)

Last checked: 2026-11-28. Official docs:
- https://neon.com/pricing
- https://neon.com/docs/reference/cli-branches
- https://neon.com/docs/introduction/regions

How: these pages were read for the platform dossier (`research/go-api-platform.md`, decision 340-1) on 2026-11-27. `[V]` = matches the dossier's reading of the page. `[U]` = not checked, written from the CLI's usual shape. Nothing here was run against a real Neon account or the real CLI.

**What it's for.** The database of a Go service (decision 340-1): Postgres on Neon, reached through pgx. Free to start, it scales to zero after 5 idle minutes, and it can branch from its CLI. `[V]` Three values:

```text
DATABASE_URL     the project's connection string, one per environment   secret
NEON_API_KEY     signs the Neon CLI in; setup only, never in the service   secret
NEON_PROJECT_ID  the project's ID, for a CLI call that names the project   public
```

`DATABASE_URL` holds the database password. It goes into the git-ignored `.env.test.local` or `.env.production.local`, and the push script sends it to Secret Manager (cloud-run.md). `NEON_API_KEY` stays in the person's shell, or a git-ignored `.env.neon.local` the agent never opens, and the app never reads it.

**For `pnpm connect`.** Every file in this folder has a block (`cli/test/connect-blocks.test.mjs`). A Go service has no `pnpm connect`, and the block names only `NEON_PROJECT_ID`. `DATABASE_URL` is also the Supabase add-on's name, so a block that filled it would make the script in a Supabase web app walk this file. `NEON_API_KEY` stays out too: the secret rows are counted by `cli/test/keys-on-full.test.mjs`, and the person makes that key by hand. It walks last (order 70) if it ever does.

```json connect
{
  "title": "Neon",
  "order": 70,
  "url": "https://console.neon.tech/app/projects",
  "steps": "## 1.",
  "vars": {
    "NEON_PROJECT_ID": {"secret": false, "scope": ["test", "production"], "to": [".env.local"]}
  }
}
```

## Make each key

For an agent driving the browser once the person has signed in (`secrets`, "Keys on Full"). Open the page and fill in what the row says. The button that makes or shows a secret value, and any code after it, are the person's. Not checked against a live page: `[U]` throughout.

| Variable | Open | Pick |
|---|---|---|
| `NEON_API_KEY` | https://console.neon.tech/app/settings/api-keys | Only for the Neon CLI. **Create new API key**, name it `<app> setup`. Stop there: the person presses **Create** and copies the key once. `[U]` |
| `NEON_PROJECT_ID` | https://console.neon.tech/app/projects | Open the test project: its ID is on the project's **Settings** page. Nothing to make. Not secret. `[U]` |
| `DATABASE_URL` | https://console.neon.tech/app/projects | Open the test project, then **Connect**. The string holds the password: the person copies it in their own editor, into `.env.test.local`. Production is its own project and the person's go-ahead first. `[U]` |

## 1. A test project and its connection string · about 10 minutes

1. Make an account: https://console.neon.tech/signup. `[U]`
2. Make the test project. Neon runs on AWS only, and a project's region can't change after it is made, so pick one close to the Cloud Run region (cloud-run.md). `[V]` Note the project's ID from its **Settings** page: it is not secret. `[U]`
3. Open the project and click **Connect**. Copy the connection string. It holds the password: copy it in your own editor and never into the chat. `[U]`
4. Open `.env.test.local` (git-ignored) and paste the string after `DATABASE_URL=`. Save. `[U]`
5. The agent pushes it, names only, dry run first and then on the person's yes:
   ```bash
   node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run --cloud-run --project <Project ID> --region <region>
   ```
6. Check, by name only: `gcloud secrets list` shows `api-test-DATABASE_URL`.

When it worked: the push script's last line says `Every value is stored somewhere.`

## 2. Production · the person's go-ahead first

Production is on the always-stop list. Make a second project, with its own connection string. The person pastes it into `.env.production.local`, and the agent pushes it with `--env production`, as step 5 shows. Test and production never share a project: a bad migration on test would hit real data.

## 3. The Neon CLI, only if you use it · about 5 minutes

The dossier names the Neon CLI for one job, a database branch for a preview. `neon branches create` prints the new branch's connection string unless `--no-secrets` is passed. `[V]` So the agent always passes `--no-secrets`, and a string never reaches a log. Nothing picks how a preview gets its branch's string into a deploy: until the Go pack's deploy script does (#354), a preview uses the test values.

1. Install the Neon CLI from the page the branches reference links to. The kit never installs it. `[U]`
2. In your own terminal, sign in. A browser opens. `[U]`
   ```bash
   neon auth
   ```
3. Or sign in with a key: the person makes it (the first row above) and sets `NEON_API_KEY` in their own shell, never as a command's argument. `[U]`

## Free tier

Free: 100 projects, 1 GB of storage per project, 100 CU-hours per project and 10 branches per project. Compute suspends after 5 idle minutes, which can't be turned off. `[V]` For today's limits: https://neon.com/pricing.

## Why / if it goes wrong

- **The first request after a quiet spell is slow.** The database wakes on the next query, typically in a few hundred milliseconds by Neon's own account. `[V]` That is the scale to zero, not a bug.
- **Rotating the password:** reset it in Neon, put the new string in `.env.<env>.local`, push it (a new Secret Manager version), then deploy that environment again. Write the date and reason in `docs/decisions.md`, never the string.
- **A connection string shows up in a log or the chat:** don't repeat it. Reset the password in Neon (rule 9 in `AGENTS.md`).
- **The wrong region:** it can't change after the project is made. `[V]` Make a new project in the right region, move the data, and drop the old one.
