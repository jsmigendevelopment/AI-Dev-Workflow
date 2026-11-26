import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import { maskReplacer } from './mask.ts'
import type { Clock } from './time.ts'
import { utcDay } from './time.ts'

type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

/** The engine's one logger: JSON lines, secrets masked, one file a UTC day. */
export interface Logger {
  info(msg: string, fields?: Fields): void
  warn(msg: string, fields?: Fields): void
  error(msg: string, fields?: Fields): void
}

const LOG_FILE = /^app-(\d{4}-\d{2}-\d{2})\.log$/
const KEEP_DAYS = 14
const DAY_MS = 86_400_000

/** A logger that appends to `app-<YYYY-MM-DD>.log` in `dir`, made if missing. */
export function createLogger(dir: string, clock: Clock): Logger {
  mkdirSync(dir, { recursive: true })
  const write =
    (level: Level) =>
    (msg: string, fields: Fields = {}) => {
      const now = clock()
      const line = JSON.stringify({ at: now.toISOString(), level, msg, ...fields }, maskReplacer)
      appendFileSync(path.join(dir, `app-${utcDay(now)}.log`), `${line}\n`)
    }
  return { info: write('info'), warn: write('warn'), error: write('error') }
}

/** Deletes the log files in `dir` whose day is more than 14 days before `now`. Other files stay. */
export function pruneOldLogs(dir: string, now: Date): void {
  const oldest = utcDay(new Date(now.getTime() - KEEP_DAYS * DAY_MS))
  for (const name of readdirSync(dir)) {
    const day = LOG_FILE.exec(name)?.[1]
    if (day !== undefined && day < oldest) rmSync(path.join(dir, name))
  }
}
