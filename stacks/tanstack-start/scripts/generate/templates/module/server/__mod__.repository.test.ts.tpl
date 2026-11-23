import { __VITEST__ } from 'vitest'

import type { __Single__Row, __Plural__Repository } from './__mod__.repository'
import { memory__Plural__Repository } from './__mod__.repository.memory'
__DB_IMPORTS__
const row = (n: number, over: Partial<__Single__Row> = {}): __Single__Row => ({
  id: `x${n}`,
  ownerId: 'ann',
  title: `T${n}`,
  createdAt: n,
  updatedAt: n,
  ...over,
})

/** One suite, every adapter: the memory fake is only trustworthy if it passes what the database passes. */
function contract(name: string, make: () => Promise<__Plural__Repository>) {
  describe(`__words__ repository contract: ${name}`, () => {
    it('lists only the owner’s rows, newest first, up to the limit', async () => {
      const repo = await make()
      for (const r of [row(1), row(2), row(3), row(4, { ownerId: 'bob' })]) await repo.insert(r)
      expect((await repo.listByOwner('ann', 10)).map((r) => r.id)).toEqual(['x3', 'x2', 'x1'])
      expect((await repo.listByOwner('ann', 2)).map((r) => r.id)).toEqual(['x3', 'x2'])
    })

    it('deletes only for the owner, once', async () => {
      const repo = await make()
      await repo.insert(row(1))
      expect(await repo.delete('bob', 'x1')).toBe(false)
      expect(await repo.delete('ann', 'x1')).toBe(true)
      expect(await repo.delete('ann', 'x1')).toBe(false)
    })

    it('refuses a duplicate id', async () => {
      const repo = await make()
      await repo.insert(row(1))
      await expect(repo.insert(row(1, { ownerId: 'bob' }))).rejects.toThrow()
    })
  })
}

contract('memory', async () => memory__Plural__Repository())
__DB_CONTRACT__
