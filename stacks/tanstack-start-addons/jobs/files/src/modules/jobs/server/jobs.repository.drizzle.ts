import { and, eq, lt, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import type { JobsRepository } from './jobs.repository'
import { jobRuns } from './jobs.table'

/** The D1 adapter. The claim is one upsert whose WHERE decides who wins. */
export function drizzleJobsRepository(db: Db): JobsRepository {
  return {
    async claim(id, type, now, staleBefore) {
      const won = await db
        .insert(jobRuns)
        .values({ id, type, status: 'running', attempts: 1, startedAt: now, finishedAt: null })
        .onConflictDoUpdate({
          target: jobRuns.id,
          set: { startedAt: now, attempts: sql`${jobRuns.attempts} + 1` },
          setWhere: and(eq(jobRuns.status, 'running'), lt(jobRuns.startedAt, staleBefore)),
        })
        .returning({ id: jobRuns.id })
      if (won.length === 1) return 'claimed'
      const [row] = await db.select({ status: jobRuns.status }).from(jobRuns).where(eq(jobRuns.id, id))
      return row?.status === 'done' ? 'done' : 'busy'
    },

    async complete(id, now) {
      await db.update(jobRuns).set({ status: 'done', finishedAt: now }).where(eq(jobRuns.id, id))
    },

    async release(id) {
      await db.delete(jobRuns).where(and(eq(jobRuns.id, id), eq(jobRuns.status, 'running')))
    },

    async pruneFinished(before) {
      const gone = await db
        .delete(jobRuns)
        .where(and(eq(jobRuns.status, 'done'), lt(jobRuns.finishedAt, before)))
        .returning({ id: jobRuns.id })
      return gone.length
    },
  }
}
