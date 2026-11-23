import type { JobMessage, RunOutcome } from '../types'
import type { JobsRepository } from './jobs.repository'

/** A job's work. It must be safe to run again if it fails part-way (it will be retried). */
export type JobHandler = (job: JobMessage) => Promise<void>

export interface JobsDeps {
  repo: JobsRepository
  now: () => number
  /** Job types this app handles, by `type`. Wired in src/server/composition.ts. */
  handlers: Record<string, JobHandler>
  /** A running claim older than this is treated as a dead Worker's and taken over. */
  staleAfterMs?: number
  /** How long finished ledger rows are kept, so late redeliveries still dedupe. */
  keepFinishedMs?: number
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** The built-in job: trims the ledger. Scheduled daily by the cron in wrangler.jsonc. */
export const PRUNE_JOB = 'jobs.prune'

/**
 * Runs a job at most once to completion, however many times the queue delivers it.
 * Claim, run, mark done; on failure, release the claim and let the queue retry.
 */
export function createJobsService({
  repo,
  now,
  handlers,
  staleAfterMs = 15 * MINUTE,
  keepFinishedMs = 30 * DAY,
}: JobsDeps) {
  const builtIn: Record<string, JobHandler> = {
    [PRUNE_JOB]: async () => {
      await repo.pruneFinished(now() - keepFinishedMs)
    },
  }
  const all = { ...builtIn, ...handlers }

  return {
    async run(job: JobMessage): Promise<RunOutcome> {
      const handler = all[job.type]
      if (!handler) return 'unknown'
      const at = now()
      const claim = await repo.claim(job.id, job.type, at, at - staleAfterMs)
      if (claim === 'done') return 'duplicate'
      if (claim === 'busy') return 'busy'
      try {
        await handler(job)
      } catch (error) {
        await repo.release(job.id)
        throw error
      }
      await repo.complete(job.id, now())
      return 'done'
    },
  }
}

export type JobsService = ReturnType<typeof createJobsService>
