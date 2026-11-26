import { describe, expect, it } from 'vitest'

import { createPreferencesMemoryRepository } from './preferences.memory.ts'
import { createPreferencesService } from './preferences.service.ts'

const setup = () => {
  const repository = createPreferencesMemoryRepository()
  return { repository, service: createPreferencesService({ repository }) }
}

describe('the preferences service', () => {
  it('answers the defaults on a fresh data folder: page size 25, refresh 30 seconds', async () => {
    expect(await setup().service.get()).toEqual({ pageSize: 25, refreshSeconds: 30 })
  })

  it('saves a change and answers every preference back', async () => {
    const { service } = setup()
    const saved = await service.update({ pageSize: 50 }, { requestId: 'r-1' })
    expect(saved).toEqual({ pageSize: 50, refreshSeconds: 30 })
    expect(await service.get()).toEqual(saved)
  })

  it('writes one audit row per save, with the request ID and no values', async () => {
    const { service, repository } = setup()
    await service.update({ pageSize: 40, refreshSeconds: 60 }, { requestId: 'r-2' })
    expect(repository.auditRows).toEqual([{ requestId: 'r-2' }])
  })

  it('stores nothing and writes no audit row when the change holds nothing', async () => {
    const { service, repository } = setup()
    expect(await service.update({}, { requestId: 'r-3' })).toEqual({ pageSize: 25, refreshSeconds: 30 })
    expect(repository.auditRows).toEqual([])
  })

  it('falls back to the default for a stored value that no longer passes the check', async () => {
    const { service, repository } = setup()
    await repository.save({ 'list.page_size': 5000, 'list.refresh_seconds': 60 }, { requestId: 'r-4' })
    expect(await service.get()).toEqual({ pageSize: 25, refreshSeconds: 60 })
  })
})
