# Google Cloud Run (a Go service's host)

Last checked: 2026-11-28. Official docs:
- https://docs.cloud.google.com/run/docs/deploying-source-code
- https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration
- https://docs.cloud.google.com/run/docs/configuring/services/environment-variables
- https://docs.cloud.google.com/run/docs/locations
- https://docs.cloud.google.com/free/docs/free-cloud-features
- https://cloud.google.com/run/pricing

How: these pages were read for the platform dossier (`research/go-api-platform.md`, decision 340-1) on 2026-11-27, and the push script's `gcloud` calls are in decision 537-1. `[V]` = matches the dossier's reading of the page. `[U]` = not checked, written from the CLI's usual shape. Nothing here was run against a real Google Cloud project or a real `gcloud`.

**What it's for.** The host of a Go service (decision 340-1): an app that needs a backend and outgrows Cloudflare Workers. The service is deployed with `gcloud run deploy --source .`, each preview as a tagged revision of the same service, and every variable is set on every deploy. There is no key to paste: the sign-in is the person's own `gcloud auth login`, in their terminal. Two plain values go with it, neither secret:

```text
CLOUD_RUN_PROJECT   the Google Cloud project ID   public
CLOUD_RUN_REGION    the region the service runs in, close to the Neon project's   public
```

These two names are this file's pick. The Go pack's deploy script (#354) is not on main yet, so it may read others: nothing is picked. The push script takes the same two values as `--project` and `--region`. They are not secret, so once the deploy script says where, they belong in committed config (`guide/environments.md`, section 3), not in a secret store.

**For `pnpm connect`.** Every file in this folder has a block (`cli/test/connect-blocks.test.mjs`). A Go service has no `pnpm connect`, and no web pack's `.env.example` lists these two names, so the script in a web app never walks this file. It walks last (order 70) if one ever does. The steps below are the walkthrough, read by an agent.

```json connect
{
  "title": "Google Cloud Run",
  "order": 70,
  "url": "https://console.cloud.google.com/projectcreate",
  "steps": "## 1.",
  "vars": {
    "CLOUD_RUN_PROJECT": {"secret": false, "scope": ["test", "production"], "to": [".env.local"], "shape": {"min": 6, "max": 30}},
    "CLOUD_RUN_REGION": {"secret": false, "scope": ["test", "production"], "to": [".env.local"], "url": "https://console.cloud.google.com/run"}
  }
}
```

## Make each key

For an agent driving the browser once the person has signed in (`secrets`, "Keys on Full"). Open the page and fill in what the row says. The button that makes or shows a secret value, and any code after it, are the person's. Nothing here is a secret, and nothing here was checked against a live page: `[U]` throughout, except the region list.

| Variable | Open | Pick |
|---|---|---|
| `CLOUD_RUN_PROJECT` | https://console.cloud.google.com/projectcreate | **Project name:** `<app>-test`. Note the **Project ID** under the name: it is the value, and it can't change later. Production gets its own project, after the person's go-ahead. Not secret. `[U]` |
| `CLOUD_RUN_REGION` | https://console.cloud.google.com/run | Nothing to make. The region is picked at deploy. Pick one near the Neon project's AWS region (neon.md): the list is on the locations page above. Not secret. `[V]` the list, `[U]` the page. |

## 1. Billing, a project and your login · about 15 minutes

1. Sign in to Google Cloud: https://console.cloud.google.com/. A Google Cloud billing account is needed to use the Free Tier, Cloud Run's free usage included. `[V]` A Free Trial account closes after 90 days, or when its $300 is spent, unless it is upgraded to a Paid billing account. `[V]` Adding a card or upgrading is paying: it is the person's own step, and the agent stops there (🛑).
2. Make the test project: https://console.cloud.google.com/projectcreate. Name it `<app>-test` and note its **Project ID**. `[U]`
3. Install the `gcloud` CLI from Google's page, https://cloud.google.com/sdk/docs/install: your own install, the kit never does it. `[U]`
4. In your own terminal, sign in:
   ```bash
   gcloud auth login
   ```
   A browser opens. Pick your account and click **Allow**. `[U]`
5. Check it. The agent may run this: it prints the signed-in account's name, no key.
   ```bash
   gcloud auth list
   ```
6. Tell the agent the **Project ID** and the region. Neither is secret.

When it worked: `gcloud auth list` shows your account marked as the active one.

## 2. Production · the person's go-ahead first

Production is on the always-stop list, so its project is the person's own step: `<app>-production`, made as step 2 does, with its own **Project ID**. Test and production never share a project.

## Keys for the service

The service's own secrets (the database's connection string, Clerk's secret key) are not made here. The person puts each in a git-ignored `.env.test.local` or `.env.production.local`, and the agent runs the push script, dry first:

```bash
node .agents/skills/secrets/scripts/push-secrets.mjs --dry-run --cloud-run --project <Project ID> --region <region>
```

On a yes it runs again without `--dry-run`. Each secret goes to Secret Manager as `api-<env>-<NAME>`, with the value on stdin, and each plain variable to the service `api-<env>` from a temp file, never an argument (decision 537-1). The deploy wires each secret into the service: `--update-secrets NAME=<id>:latest`. `[V]` the script's behaviour, `[U]` against a live project.

Check by name, never a value:

```bash
gcloud secrets list
```

## Free tier

Cloud Run on request-based billing gives 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests a month free. `[V]` Source deploys keep their built images in Artifact Registry, whose free 0.5 GB can fill with preview images. `[V]` For today's limits: https://cloud.google.com/run/pricing (`[U]`).

## Why / if it goes wrong

- **A variable you left out of a deploy is still there.** A revision keeps the settings of the one before it, and `--set-env-vars` replaces the whole list. `[V]` So the Go pack sets every variable on every deploy, and a preview that pointed at its own database never leaves that address behind.
- **A preview gets its own address** from `--no-traffic --tag`, with no production traffic. `[V]`
- **A rotated secret needs a deploy.** The push script adds a new Secret Manager version. Deploy the test service again so a new revision starts, then check it. `[U]`
- **A first push or deploy says an API isn't enabled** (Secret Manager, Cloud Run, Cloud Build or Artifact Registry): the person turns it on at the page the message names. `[U]`
- **A value shows in a log or the chat:** don't repeat it. Rotate that key (rule 9 in `AGENTS.md`).
