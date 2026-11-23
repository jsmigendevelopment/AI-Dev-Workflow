import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** The idempotency ledger: one row per job id that has started. */
export const jobRuns = sqliteTable(
  'job_runs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status', { enum: ['running', 'done'] }).notNull(),
    attempts: integer('attempts').notNull(),
    startedAt: integer('started_at').notNull(), // epoch ms
    finishedAt: integer('finished_at'),
  },
  (t) => [index('job_runs_status_finished').on(t.status, t.finishedAt)],
)
