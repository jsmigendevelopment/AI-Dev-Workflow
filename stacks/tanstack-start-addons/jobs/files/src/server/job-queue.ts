import type { Job, JobQueue } from '@/lib/jobs'

/** The Cloudflare Queues producer adapter. */
export const cloudflareJobQueue = (queue: Queue<Job>): JobQueue => ({
  send: async (job, options) => {
    await queue.send(job, { contentType: 'json', ...options })
  },
})
