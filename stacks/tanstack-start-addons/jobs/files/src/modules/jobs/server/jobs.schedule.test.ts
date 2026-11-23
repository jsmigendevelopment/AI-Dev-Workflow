import { describe, expect, it } from 'vitest'
import { unstable_readConfig } from 'wrangler'
import { CRON_JOBS, jobsForCron } from './jobs.schedule'

describe('cron schedule', () => {
  it('maps every Cron Trigger in wrangler.jsonc to jobs, and nothing else', () => {
    const crons = unstable_readConfig({ config: 'wrangler.jsonc' }).triggers.crons ?? []
    expect([...crons].sort()).toEqual(Object.keys(CRON_JOBS).sort())
  })

  it('gives each firing stable ids, so a double firing dedupes', () => {
    const [cron] = Object.keys(CRON_JOBS)
    expect(jobsForCron(cron!, 1700000000000)).toEqual(jobsForCron(cron!, 1700000000000))
    expect(jobsForCron(cron!, 1700000000000)[0]?.id).not.toBe(jobsForCron(cron!, 1700086400000)[0]?.id)
    expect(jobsForCron('0 0 1 1 *', 1)).toEqual([])
  })
})
