import { describe, expect, it } from 'vitest'

import { AppError } from '@/lib/app-error'

import { memory__Plural__Repository } from './__mod__.repository.memory'
import { create__Plural__Service } from './__mod__.service'

const ann = { userId: 'user_ann' }
const bob = { userId: 'user_bob' }

function setup() {
  let clock = 1000
  let ids = 0
  return create__Plural__Service({
    repo: memory__Plural__Repository(),
    now: () => clock++,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  })
}

/** The AppError code a promise rejects with, so tests assert codes and not copy. */
const code = (run: Promise<unknown>) =>
  run.then(
    () => 'resolved',
    (e: unknown) => (e instanceof AppError ? e.code : 'threw something else'),
  )

describe('__words__ service', () => {
  it('creates a __word__ owned by the actor, with a server-made id and times', async () => {
    const service = setup()
    const created = await service.create(ann, { title: 'First' })
    expect(created).toEqual({ id: '00000000-0000-4000-8000-000000000001', title: 'First', createdAt: 1000, updatedAt: 1000 })
    expect(await service.list(ann, { limit: 10 })).toEqual([created])
  })

  it('lists newest first, up to the limit', async () => {
    const service = setup()
    for (const title of ['a', 'b', 'c']) await service.create(ann, { title })
    expect((await service.list(ann, { limit: 2 })).map((x) => x.title)).toEqual(['c', 'b'])
  })

  it("hides another user's __words__: list is empty and delete says not_found", async () => {
    const service = setup()
    const created = await service.create(ann, { title: 'Private' })
    expect(await service.list(bob, { limit: 10 })).toEqual([])
    expect(await code(service.remove(bob, { id: created.id }))).toBe('not_found')
    expect(await service.list(ann, { limit: 10 })).toHaveLength(1)
  })

  it('deletes once; a second delete is not_found', async () => {
    const service = setup()
    const created = await service.create(ann, { title: 'Temp' })
    expect(await service.remove(ann, { id: created.id })).toEqual({ id: created.id })
    expect(await code(service.remove(ann, { id: created.id }))).toBe('not_found')
  })
})
