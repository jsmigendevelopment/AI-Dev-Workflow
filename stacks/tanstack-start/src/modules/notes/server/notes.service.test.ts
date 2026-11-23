import { describe, expect, it } from 'vitest'

import { AppError } from '@/lib/app-error'

import { memoryNotesRepository } from './notes.repository.memory'
import { createNotesService } from './notes.service'

const ann = { userId: 'user_ann' }
const bob = { userId: 'user_bob' }

function setup() {
  let clock = 1000
  let ids = 0
  return createNotesService({
    repo: memoryNotesRepository(),
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

describe('notes service', () => {
  it('creates a note owned by the actor, with server-made id and times', async () => {
    const service = setup()
    const note = await service.create(ann, { title: 'Groceries' })
    expect(note).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Groceries',
      createdAt: 1000,
      updatedAt: 1000,
    })
    expect((await service.list(ann, { limit: 10 })).items).toEqual([note])
  })

  it("hides another user's notes: list, rename and delete all say not_found", async () => {
    const service = setup()
    const note = await service.create(ann, { title: 'Private' })
    expect((await service.list(bob, { limit: 10 })).items).toEqual([])
    expect(await code(service.rename(bob, { id: note.id, title: 'Mine now' }))).toBe('not_found')
    expect(await code(service.remove(bob, { id: note.id }))).toBe('not_found')
    expect((await service.list(ann, { limit: 10 })).items).toMatchObject([{ title: 'Private' }])
  })

  it('renames and bumps updatedAt only', async () => {
    const service = setup()
    const note = await service.create(ann, { title: 'Draft' })
    const renamed = await service.rename(ann, { id: note.id, title: 'Final' })
    expect(renamed).toEqual({ ...note, title: 'Final', updatedAt: note.updatedAt + 1 })
  })

  it('deletes once; a second delete is not_found', async () => {
    const service = setup()
    const note = await service.create(ann, { title: 'Temp' })
    expect(await service.remove(ann, { id: note.id })).toEqual({ id: note.id })
    expect(await code(service.remove(ann, { id: note.id }))).toBe('not_found')
  })

  it('pages newest first with no gaps or repeats', async () => {
    const service = setup()
    for (let n = 1; n <= 5; n++) await service.create(ann, { title: `N${n}` })
    await service.create(bob, { title: 'not yours' })
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await service.list(ann, { cursor, limit: 2 })
      seen.push(...page.items.map((n) => n.title))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(['N5', 'N4', 'N3', 'N2', 'N1'])
  })

  it('pages oldest first, filtered by title, with no gaps or repeats', async () => {
    const service = setup()
    for (const title of ['Milk', 'Bread', 'Oat milk', 'Milkshake', 'Eggs'])
      await service.create(ann, { title })
    await service.create(bob, { title: 'Milk for bob' })
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await service.list(ann, { cursor, limit: 2, q: 'MILK', sort: 'oldest' })
      seen.push(...page.items.map((n) => n.title))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(['Milk', 'Oat milk', 'Milkshake'])
  })

  it('treats an empty filter as no filter', async () => {
    const service = setup()
    await service.create(ann, { title: 'One' })
    expect((await service.list(ann, { limit: 10, q: '' })).items).toHaveLength(1)
  })

  it("gets one note by id, and another user's note is not_found", async () => {
    const service = setup()
    const note = await service.create(ann, { title: 'Mine' })
    expect(await service.get(ann, { id: note.id })).toEqual(note)
    expect(await code(service.get(bob, { id: note.id }))).toBe('not_found')
  })

  it('rejects a cursor it did not make', async () => {
    expect(await code(setup().list(ann, { cursor: 'not-a-cursor', limit: 2 }))).toBe('validation')
  })
})
