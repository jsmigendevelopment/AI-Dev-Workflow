import { readdirSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { createDb } from '@/db/client'
import type { FileRow, FilesRepository } from './files.repository'
import { drizzleFilesRepository } from './files.repository.drizzle'
import { memoryFilesRepository } from './files.repository.memory'

const row = (n: number, over: Partial<FileRow> = {}): FileRow => ({
  id: `f${n}`,
  ownerId: 'ann',
  key: `ann/f${n}`,
  name: `F${n}.png`,
  type: 'image/png',
  size: n,
  status: 'pending',
  createdAt: n,
  updatedAt: n,
  ...over,
})

function contract(name: string, make: () => Promise<FilesRepository>) {
  describe(`files repository contract: ${name}`, () => {
    it('inserts a pending row once and returns the stored row on a repeat', async () => {
      const repo = await make()
      expect(await repo.insertPending(row(1))).toEqual(row(1))
      expect(await repo.insertPending(row(1, { ownerId: 'bob', name: 'x' }))).toEqual(row(1))
    })

    it('finds, readies and deletes only for the owner', async () => {
      const repo = await make()
      await repo.insertPending(row(1))
      expect(await repo.findOwned('bob', 'f1')).toBeNull()
      expect(await repo.markReady('bob', 'f1', 9)).toBe(false)
      expect(await repo.markReady('ann', 'f1', 9)).toBe(true)
      expect(await repo.markReady('ann', 'f1', 10)).toBe(false)
      expect(await repo.findOwned('ann', 'f1')).toEqual(row(1, { status: 'ready', updatedAt: 9 }))
      expect(await repo.delete('bob', 'f1')).toBeNull()
      expect(await repo.delete('ann', 'f1')).toMatchObject({ id: 'f1' })
      expect(await repo.findOwned('ann', 'f1')).toBeNull()
    })

    it('lists only the owner’s ready rows, newest first, with keyset paging', async () => {
      const repo = await make()
      for (const r of [row(1), row(2), row(3, { createdAt: 2 }), row(4, { ownerId: 'bob' }), row(5)])
        await repo.insertPending(r)
      for (const id of ['f1', 'f2', 'f3']) await repo.markReady('ann', id, 9)
      await repo.markReady('bob', 'f4', 9)
      const ids = async (after: { createdAt: number; id: string } | null, limit = 10) =>
        (await repo.listReady('ann', { after, limit })).map((r) => r.id)
      expect(await ids(null)).toEqual(['f3', 'f2', 'f1'])
      expect(await ids({ createdAt: 2, id: 'f3' })).toEqual(['f2', 'f1'])
      expect(await ids(null, 1)).toEqual(['f3'])
    })

    it('finds and deletes stale pending rows only', async () => {
      const repo = await make()
      await repo.insertPending(row(1))
      await repo.insertPending(row(2))
      await repo.insertPending(row(50))
      await repo.markReady('ann', 'f2', 3)
      expect((await repo.listStalePending(10, 10)).map((r) => r.id)).toEqual(['f1'])
      expect(await repo.deletePending('f2')).toBe(false)
      expect(await repo.deletePending('f1')).toBe(true)
      expect(await repo.listStalePending(100, 10)).toMatchObject([{ id: 'f50' }])
    })
  })
}

contract('memory', async () => memoryFilesRepository())

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
  await proxy.env.DB.prepare('DELETE FROM files').run()
  return drizzleFilesRepository(createDb(proxy.env.DB))
})
