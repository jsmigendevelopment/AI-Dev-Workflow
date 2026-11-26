import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { newId } from '@app/contract/ids'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createEngine } from './composition.ts'
import { openData } from './db/database.ts'
import { auditEvents } from './db/schema.ts'
import { resolveDataDir } from './lib/data-dir.ts'

let dataDir: string
const build = { version: '1.2.3', commit: 'abcdef0', flavour: 'e2e' } as const
const start = (dir = dataDir) =>
  createEngine({ build, dataDir: dir, clock: () => new Date('2026-11-26T10:00:00Z') })
const send = (engine: ReturnType<typeof start>, name: string, payload?: unknown) =>
  engine.handle({ id: newId(), name, v: 1, payload })

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'app-engine-'))
})
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('the engine', () => {
  it('answers health.get with engine "running", its data folder and the data file ok with its driver', async () => {
    const id = newId()
    const result = await start().handle({ id, name: 'health.get', v: 1, payload: undefined })
    expect(result).toEqual({
      id,
      ok: true,
      data: { ...build, engine: 'running', data: { isOk: true, folder: dataDir, driver: 'node:sqlite' } },
    })
  })

  it('writes a log file for today in logs/ inside the data folder when it starts', () => {
    start()
    expect(readdirSync(path.join(dataDir, 'logs'))).toEqual(['app-2026-11-26.log'])
  })

  it('WHEN APP_DATA_DIR points at a temp folder THEN the database and logs go there and nothing is written to the default folder', async () => {
    const home = path.join(dataDir, 'home')
    const tempDir = path.join(dataDir, 'temp')
    const engine = start(resolveDataDir({ APP_DATA_DIR: tempDir }, home))
    expect(await send(engine, 'health.get')).toMatchObject({
      ok: true,
      data: { data: { isOk: true, folder: tempDir } },
    })
    expect(readdirSync(tempDir).sort()).toEqual(['app.db', 'logs'])
    expect(existsSync(home)).toBe(false)
  })

  it('WHEN the database file cannot be opened THEN health.get says data.isOk false and preferences.get fails with data_unreadable', async () => {
    mkdirSync(path.join(dataDir, 'app.db'))
    const engine = start()
    expect(await send(engine, 'health.get')).toMatchObject({
      ok: true,
      data: { engine: 'running', data: { isOk: false, driver: 'node:sqlite' } },
    })
    expect(await send(engine, 'preferences.get')).toMatchObject({
      ok: false,
      error: { code: 'data_unreadable' },
    })
  })

  it('refuses an unknown command or a bad payload with validation_failed', async () => {
    const engine = start()
    for (const [name, payload] of [
      ['nope.get', undefined],
      ['health.get', { extra: true }],
      ['preferences.update', { pageSize: 0 }],
      ['preferences.update', { pageSize: 25.5 }],
      ['preferences.update', { theme: 'dark' }],
    ] as const) {
      expect(await send(engine, name, payload), `${name} ${JSON.stringify(payload)}`).toMatchObject({
        ok: false,
        error: { code: 'validation_failed' },
      })
    }
    expect(await send(engine, 'preferences.get')).toMatchObject({
      ok: true,
      data: { pageSize: 25, refreshSeconds: 30 },
    })
  })

  it('WHEN preferences are saved THEN one audit row is written with the request ID and no values, and preferences.changed is pushed', async () => {
    const engine = start()
    const pushed: unknown[] = []
    engine.onEvent((event) => pushed.push(event))
    const id = newId()
    const result = await engine.handle({ id, name: 'preferences.update', v: 1, payload: { pageSize: 75 } })
    expect(result).toEqual({ id, ok: true, data: { pageSize: 75, refreshSeconds: 30 } })
    expect(pushed).toEqual([
      {
        name: 'preferences.changed',
        v: 1,
        at: '2026-11-26T10:00:00.000Z',
        payload: { pageSize: 75, refreshSeconds: 30 },
      },
    ])
    const silent = { info: () => undefined, warn: () => undefined, error: () => undefined }
    const store = openData({ dataDir, clock: () => new Date(), log: silent })
    const rows = await store.db().select().from(auditEvents)
    store.close()
    expect(rows).toEqual([
      {
        id: expect.any(String),
        actor: 'person',
        action: 'preferences_changed',
        objectType: 'preferences',
        objectId: null,
        requestId: id,
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      },
    ])
    expect(JSON.stringify(rows)).not.toMatch(/\b75\b/)
  })
})
