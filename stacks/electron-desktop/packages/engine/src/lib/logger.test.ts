import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createLogger, pruneOldLogs } from './logger.ts'

let dir: string
const at = (iso: string) => () => new Date(iso)

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'app-logs-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('logger', () => {
  it('writes one JSON line a call to the file for that UTC day', () => {
    const log = createLogger(dir, at('2026-11-26T23:59:00Z'))
    log.info('engine started', { requestId: 'r1' })
    const lines = readFileSync(path.join(dir, 'app-2026-11-26.log'), 'utf8').trim().split('\n')
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { at: '2026-11-26T23:59:00.000Z', level: 'info', msg: 'engine started', requestId: 'r1' },
    ])
  })

  it('WHEN the logger writes a line holding a token-shaped string, a cookie or an email THEN the file shows it masked', () => {
    // Made-up values in the shapes the logger must catch, built at run time so the secret scan stays quiet.
    const token = ['sk', 'live', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg'].join('-')
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'c2lnbmF0dXJlLXZhbHVlLWhlcmU'].join(
      '.',
    )
    const bearer = `Bearer ${'A1b2C3d4'.repeat(4)}`
    const cookieHeader = 'Cookie: sessionKey=abc123def456; other=xyz'
    const email = 'someone.person@example.com'
    const log = createLogger(dir, at('2026-11-26T10:00:00Z'))
    log.warn(`a library said ${token} and ${jwt}, with ${bearer}`, {
      detail: `${cookieHeader} for ${email}`,
      cookie: 'plain-value',
      nested: { authorization: 'anything', note: `mail ${email}` },
    })
    const text = readFileSync(path.join(dir, 'app-2026-11-26.log'), 'utf8')
    for (const secret of [token, jwt, bearer, 'abc123def456', email, 'plain-value', 'anything']) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain('[masked]')
    expect(JSON.parse(text)).toMatchObject({ level: 'warn', nested: { note: 'mail [masked]' } })
  })
})

describe('pruneOldLogs', () => {
  it('WHEN log files older than 14 days sit in the logs folder at start THEN they are deleted', () => {
    for (const day of ['2026-11-01', '2026-11-11', '2026-11-12', '2026-11-26']) {
      writeFileSync(path.join(dir, `app-${day}.log`), '{}\n')
    }
    writeFileSync(path.join(dir, 'notes.txt'), 'not a log')
    pruneOldLogs(dir, new Date('2026-11-26T08:00:00Z'))
    expect(readdirSync(dir).sort()).toEqual(['app-2026-11-12.log', 'app-2026-11-26.log', 'notes.txt'])
  })
})
