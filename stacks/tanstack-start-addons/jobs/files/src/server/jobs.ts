import { consumeBatch } from '@/modules/jobs/server/jobs.consumer'
import { jobsForCron } from '@/modules/jobs/server/jobs.schedule'
import { jobQueue, jobsApi } from './composition'

/** Queue consumer: wired into the Worker in src/server.ts. */
export async function onQueue(batch: MessageBatch<unknown>): Promise<void> {
  await consumeBatch(batch.messages, jobsApi())
}

/** Cron Trigger: enqueue the jobs for this schedule; the queue gives them retries and dedupe. */
export async function onScheduled(controller: ScheduledController): Promise<void> {
  const queue = jobQueue()
  for (const job of jobsForCron(controller.cron, controller.scheduledTime)) await queue.send(job)
}
