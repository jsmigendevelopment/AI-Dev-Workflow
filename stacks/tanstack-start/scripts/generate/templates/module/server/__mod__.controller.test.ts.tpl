import { describe, expect, it, vi } from 'vitest'

import { __plural__Controller } from './__mod__.controller'
import { memory__Plural__Repository } from './__mod__.repository.memory'
import { create__Plural__Service, type __Plural__Service } from './__mod__.service'

const ann = { userId: 'user_ann' }
const id = '00000000-0000-4000-8000-000000000001'
const service = () => create__Plural__Service({ repo: memory__Plural__Repository(), now: () => 1000, newId: () => id })

describe('__words__ controller contract', () => {
  it('answers a valid create with exactly the DTO', async () => {
    expect(await __plural__Controller(service()).create(ann, { title: '  First  ' })).toEqual({
      ok: true,
      data: { id, title: 'First', createdAt: 1000, updatedAt: 1000 },
    })
  })

  it('answers bad input or an unknown field with a validation error and never calls the service', async () => {
    const create = vi.fn<__Plural__Service['create']>()
    const controller = __plural__Controller({ ...service(), create })
    expect(await controller.create(ann, { title: '   ' })).toMatchObject({
      ok: false,
      error: { code: 'validation', fields: { title: ['Give it a title.'] } },
    })
    expect(await controller.create(ann, { title: 'Hi', ownerId: 'user_bob' })).toMatchObject({
      ok: false,
      error: { code: 'validation' },
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('maps anything unexpected to internal without leaking the cause', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing: __Plural__Service = { ...service(), list: () => Promise.reject(new Error('no such table')) }
    expect(await __plural__Controller(failing).list(ann, {})).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Something went wrong. Try again.' },
    })
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})
