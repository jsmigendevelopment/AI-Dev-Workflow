import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { COMMAND_CHANNEL } from '@app/contract/envelope'
import { newId } from '@app/contract/ids'
import { describe, expect, it } from 'vitest'

import type { EngineLink } from '../engine-link'
import { createMainLogger } from '../logger'
import type { Sender } from './register'
import { FailedResult, handleCommand, isAppFrame, registerIpc } from './register'

const APP = ['app://my-app/']
const appFrame: Sender = { isAppWindow: true, isMainFrame: true, url: 'app://my-app/' }

/** An engine that records every command it sees and answers ok. */
function recordingEngine() {
  const seen: unknown[] = []
  const link: EngineLink = {
    send: (command) => {
      seen.push(command)
      return Promise.resolve({ id: command.id, ok: true, data: { engine: 'running' } })
    },
  }
  return { link, seen }
}

const command = (overrides: Record<string, unknown> = {}) => ({
  id: newId(),
  name: 'health.get',
  v: 1,
  payload: undefined,
  ...overrides,
})

describe('the IPC register', () => {
  it('carries a checked command from the app window to the engine', async () => {
    const engine = recordingEngine()
    const sent = command()
    const result = await handleCommand(sent, true, engine.link)
    expect(result).toEqual({ id: sent.id, ok: true, data: { engine: 'running' } })
    expect(engine.seen).toEqual([sent])
  })

  it('WHEN a command comes from a sender that is not the app window frame THEN the result is validation_failed and the engine never sees it', async () => {
    const strangers: Sender[] = [
      { ...appFrame, isAppWindow: false },
      { ...appFrame, isMainFrame: false },
      { ...appFrame, url: 'https://example.com/' },
      { ...appFrame, url: 'app://my-app.evil/' },
      { ...appFrame, url: undefined },
    ]
    expect(isAppFrame(appFrame, APP)).toBe(true)
    const engine = recordingEngine()
    for (const sender of strangers) {
      expect(isAppFrame(sender, APP), JSON.stringify(sender)).toBe(false)
      const sent = command()
      const result = await handleCommand(sent, isAppFrame(sender, APP), engine.link)
      expect(result).toMatchObject({ id: sent.id, ok: false, error: { code: 'validation_failed' } })
    }
    expect(engine.seen).toEqual([])
  })

  it('WHEN a command has an unknown name or a payload that fails its schema THEN the result is validation_failed with a referenceId of REF- and six characters from the request ID', async () => {
    const engine = recordingEngine()
    for (const sent of [command({ name: 'nope.get' }), command({ payload: { extra: true } })]) {
      const result = await handleCommand(sent, true, engine.link)
      expect(result).toEqual({
        id: sent.id,
        ok: false,
        error: {
          code: 'validation_failed',
          message: expect.any(String),
          referenceId: `REF-${sent.id.slice(-6)}`,
        },
      })
      expect(result.ok || result.error.referenceId).toMatch(/^REF-[0-9a-f]{6}$/)
    }
    expect(engine.seen).toEqual([])
  })

  it('WHEN preferences.update gets an out-of-range value from the screen THEN main answers validation_failed and the engine never sees it', async () => {
    const engine = recordingEngine()
    for (const payload of [{ pageSize: 0 }, { pageSize: 101 }, { refreshSeconds: 2.5 }, { theme: 'dark' }]) {
      const sent = command({ name: 'preferences.update', payload })
      const result = await handleCommand(sent, true, engine.link)
      expect(result).toMatchObject({ id: sent.id, ok: false, error: { code: 'validation_failed' } })
    }
    expect(engine.seen).toEqual([])
  })

  it('refuses a message that is not a command envelope, with a fresh reference ID', async () => {
    const engine = recordingEngine()
    for (const sent of [null, 'health.get', { name: 'health.get' }, command({ v: 2 })]) {
      const result = await handleCommand(sent, true, engine.link)
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'validation_failed', referenceId: /^REF-.{6}$/ },
      })
    }
    expect(engine.seen).toEqual([])
  })

  it('answers a command in main when main has a handler for it, and the engine never sees it', async () => {
    const engine = recordingEngine()
    const sent = command({ name: 'preferences.get' })
    const own = () => Promise.resolve({ pageSize: 40, refreshSeconds: 30 })
    const result = await handleCommand(sent, true, engine.link, { 'preferences.get': own })
    expect(result).toEqual({ id: sent.id, ok: true, data: { pageSize: 40, refreshSeconds: 30 } })
    expect(engine.seen).toEqual([])
    const refused = await handleCommand(sent, false, engine.link, { 'preferences.get': own })
    expect(refused).toMatchObject({ ok: false, error: { code: 'validation_failed' } })
  })

  it('gives a main handler the checked command, and passes a failed result it throws through as it stands', async () => {
    const engine = recordingEngine()
    const sent = command({ name: 'preferences.update', payload: { pageSize: 50 } })
    const seen: unknown[] = []
    const failed = {
      id: sent.id,
      ok: false as const,
      error: { code: 'not_found' as const, message: 'm', referenceId: 'REF-abcdef' },
    }
    const result = await handleCommand(sent, true, engine.link, {
      'preferences.update': (own) => {
        seen.push(own)
        return Promise.reject(new FailedResult(failed))
      },
    })
    expect(seen).toEqual([{ id: sent.id, payload: { pageSize: 50 } }])
    expect(result).toEqual(failed)
    expect(engine.seen).toEqual([])
  })

  it('WHEN an IPC handler throws THEN its reference ID is logged through the logger, with no token or path', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'app-ipc-log-'))
    try {
      // A made-up token, built at run time so the secret scan stays quiet.
      const token = ['sk', 'live', 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg'].join('-')
      const where = String.raw`C:\Users\someone\my-app\export.txt`
      const log = createMainLogger(dataDir, () => new Date('2026-11-26T10:00:00Z'))
      const sent = command({ name: 'preferences.update', payload: { pageSize: 50 } })
      const result = await handleCommand(
        sent,
        true,
        recordingEngine().link,
        {
          'preferences.update': () => Promise.reject(new Error(`EPERM ${where} with ${token}`)),
        },
        log,
      )
      expect(result).toMatchObject({ ok: false, error: { code: 'unexpected' } })
      const referenceId = result.ok ? '' : result.error.referenceId
      const dir = path.join(dataDir, 'logs', 'main')
      const text = readdirSync(dir)
        .map((name) => readFileSync(path.join(dir, name), 'utf8'))
        .join('')
      expect(text).toContain(referenceId)
      expect(text).toContain('preferences.update')
      expect(text).not.toContain(token)
      expect(text).not.toContain('someone')
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('registers one handler, on the command channel', () => {
    const channels: string[] = []
    registerIpc({ handle: (channel) => channels.push(channel) }, recordingEngine().link, () => true)
    expect(channels).toEqual([COMMAND_CHANNEL])
  })
})
