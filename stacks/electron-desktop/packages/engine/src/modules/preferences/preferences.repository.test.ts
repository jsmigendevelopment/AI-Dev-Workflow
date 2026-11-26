import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { DataStore } from '../../db/database.ts'
import { openData } from '../../db/database.ts'
import { auditEvents } from '../../db/schema.ts'
import type { Logger } from '../../lib/logger.ts'
import { createPreferencesMemoryRepository } from './preferences.memory.ts'
import type { PreferencesRepository } from './preferences.repository.ts'
import { createPreferencesRepository } from './preferences.repository.ts'

const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined }
const clock = () => new Date('2026-11-26T10:00:00Z')
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function openStore(): DataStore {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'app-preferences-'))
  const store = openData({ dataDir, clock, log: silent })
  cleanups.push(() => {
    store.close()
    rmSync(dataDir, { recursive: true, force: true })
  })
  return store
}

// One contract, both implementations: the memory fake must behave like the data file.
const implementations: [string, () => PreferencesRepository][] = [
  ['memory', createPreferencesMemoryRepository],
  ['sqlite', () => createPreferencesRepository({ db: openStore().db, clock })],
]

describe.each(implementations)('the %s preferences repository', (_name, make) => {
  it('reads nothing from a fresh store', async () => {
    expect(await make().read()).toEqual({})
  })

  it('reads back what it saved, and a second save replaces the first', async () => {
    const repository = make()
    await repository.save({ 'list.page_size': 25, 'list.refresh_seconds': 15 }, { requestId: 'r-1' })
    await repository.save({ 'list.refresh_seconds': 20 }, { requestId: 'r-2' })
    expect(await repository.read()).toEqual({ 'list.page_size': 25, 'list.refresh_seconds': 20 })
  })
})

describe('the sqlite preferences repository', () => {
  it('writes the audit row with the request ID and no values, in the same batch as the values', async () => {
    const store = openStore()
    const repository = createPreferencesRepository({ db: store.db, clock })
    await repository.save({ 'list.page_size': 30, 'list.refresh_seconds': 12 }, { requestId: 'r-9' })
    const rows = await store.db().select().from(auditEvents)
    expect(rows).toEqual([
      {
        id: expect.any(String),
        actor: 'person',
        action: 'preferences_changed',
        objectType: 'preferences',
        objectId: null,
        requestId: 'r-9',
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
    ])
  })

  it('stores nothing when one write in the batch fails', async () => {
    const store = openStore()
    const repository = createPreferencesRepository({ db: store.db, clock })
    // A key outside the list breaks the table's check constraint, after the audit row was queued.
    const bad = { 'list.page_size': 30, 'not.a_key': 1 } as Record<string, unknown>
    await expect(repository.save(bad, { requestId: 'r-10' })).rejects.toThrow()
    expect(await repository.read()).toEqual({})
    expect(await store.db().select().from(auditEvents)).toEqual([])
  })
})
