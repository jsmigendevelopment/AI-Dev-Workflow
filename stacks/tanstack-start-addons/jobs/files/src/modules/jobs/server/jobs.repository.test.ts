import { readdirSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { createDb } from '@/db/client'
import type { JobsRepository } from './jobs.repository'
import { drizzleJobsRepository } from './jobs.repository.drizzle'
import { memoryJobsRepository } from './jobs.repository.memory'

/** One suite, both adapters: the fake is trustworthy only if it passes what D1 passes. */
function contract(name: string, make: () => Promise<JobsRepository>) {
  describe(`jobs repository contract: ${name}`, () => {
    it('claims a new id once; a second claim is busy while fresh', async () => {
      const repo = await make()
      expect(await repo.claim('a', 't', 100, 0)).toBe('claimed')
      expect(await repo.claim('a', 't', 101, 50)).toBe('busy')
    })

    it('takes over a stale running claim', async () => {
      const repo = await make()
      await repo.claim('a', 't', 100, 0)
      expect(await repo.claim('a', 't', 500, 200)).toBe('claimed')
      expect(await repo.claim('a', 't', 501, 200)).toBe('busy')
    })

    it('says done after complete, however stale', async () => {
      const repo = await make()
      await repo.claim('a', 't', 100, 0)
      await repo.complete('a', 150)
      expect(await repo.claim('a', 't', 10_000, 9_000)).toBe('done')
    })

    it('release lets the next claim win, but never forgets a done job', async () => {
      const repo = await make()
      await repo.claim('a', 't', 100, 0)
      await repo.release('a')
      expect(await repo.claim('a', 't', 101, 0)).toBe('claimed')
      await repo.complete('a', 102)
      await repo.release('a')
      expect(await repo.claim('a', 't', 103, 0)).toBe('done')
    })

    it('prunes only finished rows older than the cut-off', async () => {
      const repo = await make()
      for (const [id, at] of [
        ['old', 10],
        ['new', 90],
      ] as const) {
        await repo.claim(id, 't', at, 0)
        await repo.complete(id, at)
      }
      await repo.claim('running', 't', 5, 0)
      expect(await repo.pruneFinished(50)).toBe(1)
      expect(await repo.claim('old', 't', 100, 0)).toBe('claimed')
      expect(await repo.claim('new', 't', 100, 0)).toBe('done')
      expect(await repo.claim('running', 't', 100, 50)).toBe('claimed')
    })
  })
}

contract('memory', async () => memoryJobsRepository())

// The real thing: local D1 with the real migrations applied.
let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>
beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: false })
  for (const file of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const statement of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) await proxy.env.DB.prepare(statement).run()
}, 30_000)
afterAll(() => proxy?.dispose())

contract('d1', async () => {
  await proxy.env.DB.prepare('DELETE FROM job_runs').run()
  return drizzleJobsRepository(createDb(proxy.env.DB))
})
