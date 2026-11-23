import type { JobMessage } from '../types'
import { PRUNE_JOB } from './jobs.service'

/**
 * Which jobs each Cron Trigger enqueues. Every key must also be in wrangler.jsonc
 * `triggers.crons` (a test checks it). Add your own rows.
 */
export const CRON_JOBS: Record<string, readonly string[]> = {
  '17 3 * * *': [PRUNE_JOB],
}

/**
 * The jobs for one cron firing. The id includes the scheduled time, so if Cloudflare fires the
 * same schedule twice, the second copy is a duplicate and does nothing.
 */
export function jobsForCron(cron: string, scheduledTime: number): JobMessage[] {
  return (CRON_JOBS[cron] ?? []).map((type) => ({ id: `cron/${type}/${scheduledTime}`, type }))
}
