import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Logger } from '../lib/logger.ts'
import type { DataStore } from './database.ts'
import { openData } from './database.ts'
import { MIGRATIONS } from './migrations.ts'
import { preferences } from './schema.ts'

let dataDir: string
const opened: DataStore[] = []
const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined }
const clock = () => new Date('2026-11-26T10:00:00Z')
const open = (migrations = MIGRATIONS) => {
  const store = openData({ dataDir, clock, log: silent, migrations })
  opened.push(store)
  return store
}
const dbFile = () => path.join(dataDir, 'app.db')
const raw = () => new DatabaseSync(dbFile())

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'app-db-'))
})
afterEach(() => {
  for (const store of opened.splice(0)) store.close()
  rmSync(dataDir, { recursive: true, force: true })
})

const columnsOf = (db: DatabaseSync, table: string) =>
  db.prepare(`select name, type, "notnull", pk from pragma_table_info('${table}') order by cid`).all()

const STAMPS = [
  { name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 },
  { name: 'updated_at', type: 'TEXT', notnull: 1, pk: 0 },
]

describe('the data file', () => {
  it('WHEN the engine starts on an empty data folder THEN preferences and audit_events exist with their columns', () => {
    expect(open().isOk).toBe(true)
    const db = raw()
    expect(columnsOf(db, 'preferences')).toEqual([
      { name: 'id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'key', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'value', type: 'TEXT', notnull: 1, pk: 0 },
      ...STAMPS,
    ])
    expect(columnsOf(db, 'audit_events')).toEqual([
      { name: 'id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'actor', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'action', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'object_type', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'object_id', type: 'TEXT', notnull: 0, pk: 0 },
      { name: 'request_id', type: 'TEXT', notnull: 1, pk: 0 },
      ...STAMPS,
    ])
    db.close()
  })

  it('WHEN a row breaks a check constraint THEN SQLite refuses it', () => {
    open()
    const db = raw()
    const at = '2026-11-26T10:00:00.000Z'
    const preference = db.prepare('insert into preferences values (?, ?, ?, ?, ?)')
    preference.run('p1', 'list.page_size', '25', at, at)
    expect(() => preference.run('p2', 'list.page_size', '50', at, at)).toThrow(/UNIQUE/)
    expect(() => preference.run('p3', 'theme.colour', '"red"', at, at)).toThrow(/CHECK/)
    const audit = db.prepare('insert into audit_events values (?, ?, ?, ?, ?, ?, ?, ?)')
    audit.run('a1', 'person', 'preferences_changed', 'preferences', null, 'r1', at, at)
    expect(() => audit.run('a2', 'robot', 'preferences_changed', 'preferences', null, 'r2', at, at)).toThrow(
      /CHECK/,
    )
    expect(() => audit.run('a3', 'person', 'preferences_read', 'preferences', null, 'r3', at, at)).toThrow(
      /CHECK/,
    )
    expect(() => audit.run('a4', 'person', 'preferences_changed', 'event', null, 'r4', at, at)).toThrow(
      /CHECK/,
    )
    db.close()
  })

  it('WHEN a migration is pending at start THEN the database file is copied before it runs', () => {
    open().close()
    const pending = [...MIGRATIONS, { tag: '9999_test_marker', sql: 'CREATE TABLE `markers` (`id` text);' }]
    expect(open(pending).isOk).toBe(true)
    const backups = readdirSync(path.join(dataDir, 'backups'))
    expect(backups).toEqual(['app-2026-11-26T10-00-00Z-before-9999_test_marker.db'])
    const copy = new DatabaseSync(path.join(dataDir, 'backups', backups[0] ?? ''))
    const tables = copy.prepare("select name from sqlite_master where type = 'table' order by name").all()
    // The copy holds every table the shipped migrations made, and not the pending one's.
    expect(tables.map((t) => t['name'])).toEqual(['audit_events', 'preferences'])
    copy.close()
    const db = raw()
    expect(db.prepare("select name from sqlite_master where name = 'markers'").get()).toBeDefined()
    db.close()
  })

  it('makes no copy when no migration is pending, or when the file is new', () => {
    open().close()
    open()
    expect(readdirSync(dataDir)).not.toContain('backups')
  })

  it('WHEN the database file cannot be opened THEN the store is not ok and asking it for data fails with data_unreadable', () => {
    mkdirSync(dbFile())
    const store = open()
    expect(store.isOk).toBe(false)
    expect(store.driver).toBe('node:sqlite')
    expect(() => store.db()).toThrow(expect.objectContaining({ code: 'data_unreadable' }))
  })

  it('WHEN a migration fails THEN it is rolled back and the store is not ok', () => {
    open().close()
    const store = open([
      ...MIGRATIONS,
      { tag: '9999_broken', sql: 'CREATE TABLE `a` (`id` text);\nNOT SQL;' },
    ])
    expect(store.isOk).toBe(false)
    const db = raw()
    expect(db.prepare("select name from sqlite_master where name = 'a'").get()).toBeUndefined()
    expect(db.prepare('pragma user_version').get()).toEqual({ user_version: MIGRATIONS.length })
    db.close()
  })

  it('reads and writes through Drizzle', async () => {
    const db = open().db()
    const at = '2026-11-26T10:00:00.000Z'
    await db
      .insert(preferences)
      .values({ id: 'p1', key: 'list.page_size', value: '50', createdAt: at, updatedAt: at })
    expect(await db.select({ key: preferences.key, value: preferences.value }).from(preferences)).toEqual([
      { key: 'list.page_size', value: '50' },
    ])
  })

  it('lists every migration drizzle-kit wrote, in its order', () => {
    const journal = JSON.parse(
      readFileSync(new URL('./migrations/meta/_journal.json', import.meta.url), 'utf8'),
    ) as { entries: { tag: string }[] }
    expect(MIGRATIONS.map((m) => m.tag)).toEqual(journal.entries.map((e) => e.tag))
  })
})
