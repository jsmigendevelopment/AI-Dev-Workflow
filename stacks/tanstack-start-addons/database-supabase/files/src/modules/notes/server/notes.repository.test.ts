import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NoteRow, NotesRepository } from './notes.repository'
import { drizzleNotesRepository } from './notes.repository.drizzle'
import { memoryNotesRepository } from './notes.repository.memory'

const row = (n: number, over: Partial<NoteRow> = {}): NoteRow => ({
  id: `n${n}`,
  ownerId: 'ann',
  title: `N${n}`,
  createdAt: n,
  updatedAt: n,
  ...over,
})

/** One suite, every adapter: the memory fake is only trustworthy if it passes what Postgres passes. */
function contract(name: string, make: () => Promise<NotesRepository>) {
  describe(`notes repository contract: ${name}`, () => {
    it('lists only the owner’s rows, newest first, ties broken by id', async () => {
      const repo = await make()
      for (const r of [row(1), row(2), row(3, { createdAt: 2 }), row(4, { ownerId: 'bob' })])
        await repo.insert(r)
      const ids = async (after: { createdAt: number; id: string } | null, limit = 10) =>
        (await repo.listByOwner('ann', { after, limit })).map((r) => r.id)
      expect(await ids(null)).toEqual(['n3', 'n2', 'n1'])
      expect(await ids(null, 2)).toEqual(['n3', 'n2'])
      expect(await ids({ createdAt: 2, id: 'n3' })).toEqual(['n2', 'n1'])
      expect(await ids({ createdAt: 2, id: 'n2' })).toEqual(['n1'])
    })

    it('renames only for the owner and returns the stored row', async () => {
      const repo = await make()
      await repo.insert(row(1))
      expect(await repo.rename('bob', 'n1', 'Stolen', 50)).toBeNull()
      expect(await repo.rename('ann', 'missing', 'X', 50)).toBeNull()
      expect(await repo.rename('ann', 'n1', 'New', 50)).toEqual(row(1, { title: 'New', updatedAt: 50 }))
    })

    it('deletes only for the owner, once', async () => {
      const repo = await make()
      await repo.insert(row(1))
      expect(await repo.delete('bob', 'n1')).toBe(false)
      expect(await repo.delete('ann', 'n1')).toBe(true)
      expect(await repo.delete('ann', 'n1')).toBe(false)
      expect(await repo.listByOwner('ann', { after: null, limit: 10 })).toEqual([])
    })

    it('refuses a duplicate id', async () => {
      const repo = await make()
      await repo.insert(row(1))
      await expect(repo.insert(row(1, { ownerId: 'bob' }))).rejects.toThrow()
    })

    it('keeps epoch-ms times past 2^31 exact', async () => {
      const repo = await make()
      await repo.insert(row(1, { createdAt: 1_800_000_000_123, updatedAt: 1_800_000_000_123 }))
      expect((await repo.listByOwner('ann', { after: null, limit: 1 }))[0]?.createdAt).toBe(1_800_000_000_123)
    })
  })
}

contract('memory', async () => memoryNotesRepository())

// The real thing: Postgres (PGlite, in process) with the real migration files applied.
let pg: PGlite
beforeAll(async () => {
  pg = new PGlite()
  for (const file of readdirSync('migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const statement of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) await pg.exec(statement)
}, 30_000)
afterAll(() => pg?.close())

contract('postgres', async () => {
  await pg.exec('DELETE FROM notes')
  return drizzleNotesRepository(drizzle({ client: pg }))
})
