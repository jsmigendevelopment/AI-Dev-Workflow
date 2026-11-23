import handler from '@tanstack/react-start/server-entry'
import type { Job } from '@/lib/jobs'
import { onQueue, onScheduled } from '@/server/jobs'

/**
 * The Worker entry (wrangler.jsonc "main"): Start handles HTTP, and the jobs add-on handles the
 * queue consumer and Cron Triggers. Bindings are read with `import { env } from 'cloudflare:workers'`.
 */
export default {
  fetch: (request) => handler.fetch(request),
  queue: onQueue,
  scheduled: onScheduled,
} satisfies ExportedHandler<Cloudflare.Env, Job>
