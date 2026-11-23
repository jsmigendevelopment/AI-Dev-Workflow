import { describe, expect, it, vi } from 'vitest'

import { notesController } from './notes.controller'
import { memoryNotesRepository } from './notes.repository.memory'
import { createNotesService, type NotesService } from './notes.service'

const ann = { userId: 'user_ann' }
const id = '00000000-0000-4000-8000-000000000001'
const service = () => createNotesService({ repo: memoryNotesRepository(), now: () => 1000, newId: () => id })
const controller = () => notesController(service())

describe('notes controller contract', () => {
  it('answers a valid create with exactly the DTO', async () => {
    expect(await controller().create(ann, { title: '  Groceries  ' })).toEqual({
      ok: true,
      data: { id, title: 'Groceries', createdAt: 1000, updatedAt: 1000 },
    })
  })

  it('answers bad input with field errors and never calls the service', async () => {
    const create = vi.fn<NotesService['create']>()
    const result = await notesController({ ...service(), create }).create(ann, { title: '   ' })
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'validation',
        message: 'Some fields need attention.',
        fields: { title: ['Give the note a title.'] },
      },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects unknown fields, so an ownerId in the body never reaches the service', async () => {
    const create = vi.fn<NotesService['create']>()
    const result = await notesController({ ...service(), create }).create(ann, {
      title: 'Hi',
      ownerId: 'user_bob',
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'validation' } })
    expect(create).not.toHaveBeenCalled()
  })

  it('browses with a filter and an order, and the /api/v1 list still refuses them', async () => {
    const api = controller()
    await api.create(ann, { title: 'Milk' })
    expect(await api.browse(ann, { q: 'mil', sort: 'oldest', limit: '5' })).toMatchObject({
      ok: true,
      data: { items: [{ title: 'Milk' }], nextCursor: null },
    })
    expect(await api.browse(ann, { sort: 'title' })).toMatchObject({
      ok: false,
      error: { code: 'validation', fields: { sort: expect.any(Array) as unknown } },
    })
    expect(await api.list(ann, { q: 'mil' })).toMatchObject({ ok: false, error: { code: 'validation' } })
  })

  it('gets one note, and refuses an id that is not a UUID', async () => {
    const api = controller()
    await api.create(ann, { title: 'Milk' })
    expect(await api.get(ann, { id })).toMatchObject({ ok: true, data: { id, title: 'Milk' } })
    expect(await api.get(ann, { id: 'nope' })).toMatchObject({ ok: false, error: { code: 'validation' } })
  })

  it('maps a service AppError to its code', async () => {
    expect(await controller().rename(ann, { id, title: 'New' })).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'That note does not exist.' },
    })
  })

  it('maps anything unexpected to internal without leaking the cause', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing: NotesService = {
      ...service(),
      list: () => Promise.reject(new Error('D1_ERROR: no such table: notes')),
    }
    expect(await notesController(failing).list(ann, {})).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Something went wrong. Try again.' },
    })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('applies the list defaults and limits', async () => {
    expect(await controller().list(ann, {})).toEqual({ ok: true, data: { items: [], nextCursor: null } })
    expect(await controller().list(ann, { limit: 101 })).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    })
  })
})
