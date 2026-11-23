import handler from '@tanstack/react-start/server-entry'
import type { Job } from '@/lib/jobs'
import { onQueue, onScheduled } from '@/server/jobs'
import { beforeStart } from '@/server/request-guards'

/**
 * The Worker entry (wrangler.jsonc "main"): Start handles HTTP (after the pack's `beforeStart`), and
 * the jobs add-on handles the queue consumer and Cron Triggers. Bindings are read with `import { env } from 'cloudflare:workers'`.
 */
export default {
  fetch: (request) => beforeStart(request) ?? handler.fetch(request),
  queue: onQueue,
  scheduled: onScheduled,
} satisfies ExportedHandler<Cloudflare.Env, Job>
