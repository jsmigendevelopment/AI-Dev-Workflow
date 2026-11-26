import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createMainLogger, maskPaths } from './logger'

let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'app-main-logs-'))
})
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('the main logger', () => {
  it('writes JSON lines to logs/main in the data folder, one file a UTC day', () => {
    const log = createMainLogger(dataDir, () => new Date('2026-11-26T10:00:00Z'))
    log.warn('window failed to load', { windowId: 1 })
    const dir = path.join(dataDir, 'logs', 'main')
    expect(readdirSync(dir)).toEqual(['app-2026-11-26.log'])
    const line: unknown = JSON.parse(readFileSync(path.join(dir, 'app-2026-11-26.log'), 'utf8'))
    expect(line).toEqual({
      at: '2026-11-26T10:00:00.000Z',
      level: 'warn',
      msg: 'window failed to load',
      windowId: 1,
    })
  })

  it('makes no folder until the first line, so a run with nothing to log leaves logs/ as the engine made it', () => {
    createMainLogger(dataDir, () => new Date('2026-11-26T10:00:00Z'))
    expect(readdirSync(dataDir)).toEqual([])
  })

  it('masks Windows, UNC and POSIX paths but keeps web addresses readable', () => {
    expect(maskPaths(String.raw`open C:\Users\someone\my-app\app.db failed`)).toBe('open [path] failed')
    expect(maskPaths(String.raw`at \\server\share\x.txt`)).toBe('at [path]')
    expect(maskPaths('ENOENT: /home/someone/.config/x.json')).toBe('ENOENT: [path]')
    expect(maskPaths('load https://example.com/docs failed')).toBe('load https://example.com/docs failed')
  })
})
