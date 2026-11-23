# jobs

Background jobs and schedules: a Cloudflare Queue that this same Worker produces to and consumes, Cron Triggers that enqueue jobs, and an idempotency ledger in D1, so a job delivered twice runs once.

| | |
|---|---|
| **Choose it when** | work shouldn't block a request (send a receipt, call a slow API, fan out), or must happen on a schedule (nightly cleanup, reminders) |
| **Alternatives** | `ctx.waitUntil()` for fire-and-forget work under 30 s that may be lost; Cloudflare Workflows for long multi-step processes with sleeps; Durable Object alarms for per-object timers |
| **Env vars** | none. Bindings: `JOBS` (queue producer) |
| **Packages** | none |
| **Issue** | `Skills: build` · lane `normal` |

## What it adds

- `src/lib/jobs.ts`: the `Job` type, the `JobQueue` producer port and `memoryJobQueue()` for tests. A service that enqueues work depends on this port only.
- `src/modules/jobs/`: the runner, layered like any module.
  - `schemas.ts`: a queue message is parsed like any input: strict, bounded.
  - `server/jobs.table.ts`: `job_runs`, the ledger (`running` or `done`, attempts, times).
  - `server/jobs.repository.ts` with `.memory.ts` and `.drizzle.ts`: `claim` is one upsert whose `WHERE` decides the winner (D1 has no interactive transactions), plus `complete`, `release` and `pruneFinished`.
  - `server/jobs.service.ts`: `run(job)`. It claims, runs the handler, then marks the job done. A redelivery is a `duplicate` and does no work. A failure releases the claim and rethrows, so the retry runs it. A claim older than 15 minutes (a Worker that died) is taken over. Built-in job: `jobs.prune` drops ledger rows older than 30 days.
  - `server/jobs.consumer.ts`: the queue's controller. It parses each message, runs it, then acks or retries it, message by message. Bad shapes and unknown types are acked and logged, not retried forever. Retries back off 30 s, 60 s, 120 s and so on, up to 15 minutes.
  - `server/jobs.schedule.ts`: cron string → job types. Ids include the scheduled time, so a double firing dedupes.
  - Tests: service (idempotency, release on failure, busy and stale takeover), consumer (double delivery, retry and backoff, poison messages), repository contract against memory **and local D1**, and the schedule (every cron in `wrangler.jsonc` has a row, and the other way round).
- `src/server/job-queue.ts`: the Queues producer adapter. `src/server/jobs.ts`: `onQueue` and `onScheduled`.
- `src/server.ts`: the Worker entry, exporting `fetch` (the pack's `beforeStart`, then Start's handler), `queue` and `scheduled`.

Handlers must still be safe to run again if they fail part-way: the ledger stops a second *successful* run, not a half-finished one. Pass the job id to a provider as its idempotency key (Stripe and Resend both accept one).

With no keys this needs nothing: queues and crons run in local dev too.

## Apply

1. Copy `files/` into the project root. The CLI does this step: `npx onrails add tanstack-start/jobs`.
   The pack already has a `src/server.ts` (the Worker entry, calling `beforeStart` before Start's handler). Replace it with this one (`--force` for that file); it keeps that call.
2. `wrangler.jsonc`: check the entry (the pack already sets it), then add the queue and the cron at the top level, before `"env"` (local dev uses these).
   ```jsonc
   "main": "src/server.ts",
   ```
   ```jsonc
   // Background jobs: one queue, consumed by this same Worker (src/server.ts), plus a dead-letter queue.
   "queues": {
     "producers": [{ "binding": "JOBS", "queue": "app-jobs" }],
     "consumers": [
       { "queue": "app-jobs", "max_batch_size": 10, "max_retries": 5, "dead_letter_queue": "app-jobs-dlq" },
     ],
   },
   // Cron Triggers (UTC), inherited by every environment. Each one must have a row in
   // src/modules/jobs/server/jobs.schedule.ts.
   "triggers": { "crons": ["17 3 * * *"] },
   ```
   Queues are bindings, which environments don't inherit: add a block with the environment's own queue names inside `env.test` and `env.production` (here for test; `-production` in the other). Without it `wrangler types` makes `JOBS` optional and `pnpm typecheck` fails in `composition.ts`.
   ```jsonc
   "queues": {
     "producers": [{ "binding": "JOBS", "queue": "app-jobs-test" }],
     "consumers": [
       { "queue": "app-jobs-test", "max_batch_size": 10, "max_retries": 5, "dead_letter_queue": "app-jobs-test-dlq" },
     ],
   },
   ```
3. `src/server/composition.ts`: add the imports and two factories.
   ```ts
   import type { JobQueue } from '@/lib/jobs'
   import { drizzleJobsRepository } from '@/modules/jobs/server/jobs.repository.drizzle'
   import { createJobsService } from '@/modules/jobs/server/jobs.service'
   import { cloudflareJobQueue } from './job-queue'
   ```
   ```ts
   /** The job runner. Register each job type's handler here; handlers call other modules' services. */
   export function jobsApi() {
     const repo = drizzleJobsRepository(createDb(env.DB))
     return createJobsService({
       repo,
       now: Date.now,
       handlers: {
         // 'send-receipt': (job) => billingApi().sendReceipt(job.payload),
       },
     })
   }

   /** The producer: give it to any service that enqueues work. */
   export const jobQueue = (): JobQueue => cloudflareJobQueue(env.JOBS)
   ```
4. `pnpm db:generate --name jobs`, read the SQL (one `job_runs` table and one index), then `pnpm db:migrate:local`.
5. Before the first deploy, create the four deployed queues: `node scripts/setup-cloudflare.mjs --dry-run`, show the person, then run it without `--dry-run` (it creates the queues the environments declare, and skips the ones that exist). Queues has a free daily allowance; check the current limits on Cloudflare's pricing page. The deploy workflows apply the `job_runs` migration. Add **Account → Queues → Edit** to the CI deploy token: `wrangler deploy` configures the consumer.
6. `knip.jsonc`: `memoryJobQueue` is for the tests of code that enqueues, so keep it until one uses it. Add to `ignoreIssues`:
   ```jsonc
   "src/lib/jobs.ts": ["exports"],
   ```
7. `pnpm exec eslint --fix . && pnpm format`: the pack's lint sorts imports, including the ones this add-on added.
8. `pnpm check`.

To enqueue from a feature: give its service a `queue: JobQueue` dependency (`jobQueue()` in composition, `memoryJobQueue()` in tests), call `queue.send({ id: 'send-receipt/<order id>', type: 'send-receipt', payload: { orderId } })`, and register the handler in `jobsApi()`.

### With the `sentry` add-on

Both own `src/server.ts`. Keep one file that wraps all three handlers, with the pack's `beforeStart` first in `fetch`. Start's request middleware (the pack's request guards, CSRF and Clerk) runs inside `handler.fetch`, so headers, limits and the `/api/v1` guards are unchanged; queue and cron handlers never pass through it (they aren't HTTP):

```ts
import * as Sentry from '@sentry/cloudflare'
import handler from '@tanstack/react-start/server-entry'
import type { Job } from '@/lib/jobs'
import { sentryOptions } from '@/lib/monitoring'
import { onQueue, onScheduled } from '@/server/jobs'
import { beforeStart } from '@/server/request-guards'

export default Sentry.withSentry(
  (env: Cloudflare.Env) => ({
    ...sentryOptions({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT }),
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
  }),
  {
    fetch: (request) => beforeStart(request) ?? handler.fetch(request),
    queue: onQueue,
    scheduled: onScheduled,
  } satisfies ExportedHandler<Cloudflare.Env, Job>,
)
```

## Verify

- `pnpm test`: 22 jobs tests, including the repository contract against local D1.
- End to end, locally: `pnpm db:migrate:local && pnpm build && pnpm preview`, then fire the cron twice with the same time:
  ```sh
  curl "<preview URL>/cdn-cgi/handler/scheduled?cron=17+3+*+*+*&time=1700000000000"   # twice
  pnpm exec wrangler d1 execute DB --local -c wrangler.jsonc --command "SELECT id, status, attempts FROM job_runs"
  ```
  The preview log shows `QUEUE app-jobs 1/1` twice, and the table has exactly one row, `cron/jobs.prune/1700000000000`, `done`, attempt 1.

Checked for this add-on, locally: exactly that result (two fires, two deliveries, one run). Re-checked 2026-11-22 on the v0.4 pack together with `sentry` (the combined file above): one `cron/jobs.prune/1700000000000` row after two fires, `pnpm check` and the full Playwright suite pass.

## Not verified here

Deployed queues and crons on Cloudflare (needs the person's account), and dead-letter behaviour after `max_retries`.
