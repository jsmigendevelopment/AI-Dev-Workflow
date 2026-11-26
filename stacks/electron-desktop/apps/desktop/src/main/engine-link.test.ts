import { EventEmitter } from 'node:events'

import { newId } from '@app/contract/ids'
import { describe, expect, it } from 'vitest'

import { createEngineLink } from './engine-link'

/** A stand-in for the engine's utilityProcess: records what main posts, and can answer or exit. */
class FakeEngine extends EventEmitter {
  readonly posted: unknown[] = []
  postMessage(message: unknown): void {
    this.posted.push(message)
  }
}

function fakeEngine() {
  const port = new FakeEngine()
  return { port, posted: port.posted, emit: (event: string, ...args: unknown[]) => port.emit(event, ...args) }
}

const healthGet = () => ({ id: newId(), name: 'health.get', v: 1 as const, payload: undefined })

describe('the engine link', () => {
  it('posts the command once the engine has spawned and resolves with its answer', async () => {
    const engine = fakeEngine()
    const link = createEngineLink(engine.port)
    const command = healthGet()
    const answer = link.send(command)
    expect(engine.posted).toEqual([])
    engine.emit('spawn')
    await Promise.resolve()
    expect(engine.posted).toEqual([command])
    engine.emit('message', { id: command.id, ok: true, data: { engine: 'running' } })
    await expect(answer).resolves.toEqual({ id: command.id, ok: true, data: { engine: 'running' } })
  })

  it('WHEN the engine process has exited THEN the next command returns engine_unavailable instead of hanging', async () => {
    const engine = fakeEngine()
    const link = createEngineLink(engine.port)
    engine.emit('spawn')
    const inFlight = healthGet()
    const pending = link.send(inFlight)
    await Promise.resolve()
    engine.emit('exit', 1)
    const next = healthGet()
    for (const [command, answer] of [
      [inFlight, pending],
      [next, link.send(next)],
    ] as const) {
      await expect(answer).resolves.toMatchObject({
        id: command.id,
        ok: false,
        error: { code: 'engine_unavailable', referenceId: `REF-${command.id.slice(-6)}` },
      })
    }
    expect(engine.posted).toEqual([inFlight])
  })

  it('WHEN posting to the engine throws THEN the command answers engine_unavailable instead of hanging', async () => {
    const engine = fakeEngine()
    engine.port.postMessage = () => {
      throw new Error('the port is closed')
    }
    const link = createEngineLink(engine.port)
    engine.emit('spawn')
    const command = healthGet()
    await expect(link.send(command)).resolves.toMatchObject({
      id: command.id,
      ok: false,
      error: { code: 'engine_unavailable' },
    })
  })

  it('hands a checked event to onEvent and drops a message that is neither an answer nor an event', () => {
    const engine = fakeEngine()
    const seen: unknown[] = []
    createEngineLink(engine.port, (event) => seen.push(event))
    const payload = { pageSize: 25, refreshSeconds: 30 }
    const event = { name: 'preferences.changed', v: 1, at: '2026-11-26T10:00:00.000Z', payload }
    engine.emit('message', event)
    engine.emit('message', { ...event, name: 'preferences.unknown' })
    engine.emit('message', { ...event, payload: { ...payload, pageSize: 0 } })
    engine.emit('message', 'noise')
    expect(seen).toEqual([event])
  })
})
