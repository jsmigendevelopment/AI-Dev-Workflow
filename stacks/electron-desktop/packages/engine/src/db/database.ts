import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import { DatabaseSync } from 'node:sqlite'

import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

import { EngineError } from '../lib/engine-error.ts'
import type { Logger } from '../lib/logger.ts'
import type { Clock } from '../lib/time.ts'
import type { Migration } from './migrations.ts'
import { MIGRATIONS } from './migrations.ts'

/** The SQLite driver: the one built into Electron's Node, so no native module ships. */
export const DRIVER = 'node:sqlite'

/** The Drizzle client repositories query through. */
export type Db = SqliteRemoteDatabase

/** The data file as the engine sees it: whether it opened, the driver, and the client. */
export interface DataStore {
  isOk: boolean
  driver: typeof DRIVER
  /** The client; throws `data_unreadable` when the file could not be opened or migrated. */
  db(): Db
  close(): void
}

/** What `openData` needs. `migrations` is the full list unless a test adds one. */
export interface OpenDataDeps {
  dataDir: string
  clock: Clock
  log: Logger
  migrations?: readonly Migration[]
}

type Method = 'run' | 'all' | 'values' | 'get'

// Drizzle maps rows by position. @types/node types rows as objects even in array mode.
function runQuery(sqlite: DatabaseSync, query: string, params: unknown[], method: Method) {
  const statement = sqlite.prepare(query)
  const args = params as SQLInputValue[]
  if (method === 'run') {
    statement.run(...args)
    return { rows: [] }
  }
  statement.setReturnArrays(true)
  const rows: unknown = method === 'get' ? statement.get(...args) : statement.all(...args)
  return { rows: rows as unknown[] }
}

// Drizzle 0.45 has no node:sqlite driver, so its proxy driver hands each query to node:sqlite. A batch
// runs in one transaction, synchronously, so no other command's query can land in the middle of it.
function drizzleOver(sqlite: DatabaseSync): Db {
  return drizzle(
    async (query, params, method) => runQuery(sqlite, query, params, method),
    async (queries) => {
      sqlite.exec('BEGIN')
      try {
        const results = queries.map((q) => runQuery(sqlite, q.sql, q.params, q.method))
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  )
}

const userVersion = (sqlite: DatabaseSync) =>
  Number(sqlite.prepare('PRAGMA user_version').get()?.['user_version'])

// The copy is SQLite's own (VACUUM INTO), so it is consistent even if a write was in flight.
function backUp(sqlite: DatabaseSync, dataDir: string, now: Date, tag: string): void {
  const dir = path.join(dataDir, 'backups')
  mkdirSync(dir, { recursive: true })
  const stamp = now.toISOString().slice(0, 19).replaceAll(':', '-')
  const file = path.join(dir, `app-${stamp}Z-before-${tag}.db`)
  sqlite.prepare('VACUUM INTO ?').run(file)
}

// Forward only: PRAGMA user_version counts the migrations applied; each runs in its own transaction.
function migrate(sqlite: DatabaseSync, deps: OpenDataDeps & { isNew: boolean }): void {
  const migrations = deps.migrations ?? MIGRATIONS
  const pending = migrations.slice(userVersion(sqlite))
  const first = pending[0]
  if (!first) return
  if (!deps.isNew) backUp(sqlite, deps.dataDir, deps.clock(), first.tag)
  for (const migration of pending) {
    sqlite.exec('BEGIN')
    try {
      for (const statement of migration.sql.split('--> statement-breakpoint')) sqlite.exec(statement)
      sqlite.exec(`PRAGMA user_version = ${migrations.indexOf(migration) + 1}`)
      sqlite.exec('COMMIT')
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
    deps.log.info('migration applied', { tag: migration.tag })
  }
}

/** Opens `app.db` in the data folder and runs pending migrations, copying the file first. */
export function openData(deps: OpenDataDeps): DataStore {
  const file = path.join(deps.dataDir, 'app.db')
  const isNew = !existsSync(file)
  let sqlite: DatabaseSync | undefined
  try {
    mkdirSync(deps.dataDir, { recursive: true })
    sqlite = new DatabaseSync(file)
    sqlite.exec('PRAGMA foreign_keys = ON')
    migrate(sqlite, { ...deps, isNew })
  } catch (error) {
    deps.log.error('data file unreadable', { error: String(error) })
    sqlite?.close()
    return {
      isOk: false,
      driver: DRIVER,
      db: () => {
        throw new EngineError('data_unreadable')
      },
      close: () => undefined,
    }
  }
  const db = drizzleOver(sqlite)
  const open = sqlite
  return {
    isOk: true,
    driver: DRIVER,
    db: () => db,
    close: () => {
      if (open.isOpen) open.close()
    },
  }
}
