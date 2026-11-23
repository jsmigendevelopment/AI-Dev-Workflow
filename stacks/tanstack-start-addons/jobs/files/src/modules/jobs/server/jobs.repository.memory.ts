import type { JobsRepository } from './jobs.repository'

interface Row {
  type: string
  status: 'running' | 'done'
  attempts: number
  startedAt: number
  finishedAt: number | null
}

/** The test fake. Passes the same contract suite as the D1 adapter. */
export function memoryJobsRepository(): JobsRepository {
  const rows = new Map<string, Row>()
  return {
    async claim(id, type, now, staleBefore) {
      const row = rows.get(id)
      if (!row) {
        rows.set(id, { type, status: 'running', attempts: 1, startedAt: now, finishedAt: null })
        return 'claimed'
      }
      if (row.status === 'done') return 'done'
      if (row.startedAt >= staleBefore) return 'busy'
      Object.assign(row, { startedAt: now, attempts: row.attempts + 1 })
      return 'claimed'
    },
    async complete(id, now) {
      const row = rows.get(id)
      if (row) Object.assign(row, { status: 'done', finishedAt: now })
    },
    async release(id) {
      if (rows.get(id)?.status === 'running') rows.delete(id)
    },
    async pruneFinished(before) {
      let n = 0
      for (const [id, row] of rows)
        if (row.status === 'done' && row.finishedAt !== null && row.finishedAt < before) {
          rows.delete(id)
          n++
        }
      return n
    },
  }
}
