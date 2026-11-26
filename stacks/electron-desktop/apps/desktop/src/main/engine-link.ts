import type { CommandEnvelope, Result } from '@app/contract/envelope'
import { CONTRACT_VERSION, errorResult, resultSchema } from '@app/contract/envelope'
import type { EventEnvelope } from '@app/contract/events'
import { parseEvent } from '@app/contract/events'
import type { Health } from '@app/contract/health'
import { healthSchema } from '@app/contract/health'
import { newId } from '@app/contract/ids'

/** The part of Electron's UtilityProcess the link uses, so tests can stand in for it. */
export interface EnginePort {
  on(event: 'spawn', listener: () => void): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  postMessage(message: unknown): void
}

/** Main's side of the engine: carries a checked command to it and its answer back. No logic of its own. */
export interface EngineLink {
  send(command: CommandEnvelope): Promise<Result<unknown>>
}

/**
 * Pairs each answer with its command by ID, and hands each checked event to `onEvent`. Once the engine
 * has exited, every command gets engine_unavailable.
 */
export function createEngineLink(
  port: EnginePort,
  onEvent: (event: EventEnvelope) => void = () => undefined,
): EngineLink {
  const pending = new Map<string, (result: Result<unknown>) => void>()
  let exited = false
  const spawned = new Promise<void>((resolve) => port.on('spawn', resolve))

  port.on('message', (message) => {
    const result = resultSchema.safeParse(message)
    if (result.success) {
      pending.get(result.data.id)?.(result.data)
      pending.delete(result.data.id)
      return
    }
    // Not an answer: an event, checked against the contract before it goes on; anything else is dropped.
    const event = parseEvent(message)
    if (event) onEvent(event)
  })
  port.on('exit', () => {
    exited = true
    for (const [id, resolve] of pending) resolve(errorResult(id, 'engine_unavailable'))
    pending.clear()
  })

  return {
    send(command) {
      if (exited) return Promise.resolve(errorResult(command.id, 'engine_unavailable'))
      return new Promise((resolve) => {
        pending.set(command.id, resolve)
        void spawned.then(() => {
          if (!pending.has(command.id)) return
          try {
            port.postMessage(command)
          } catch {
            // The port closed between the check and the post: answer now, or the caller would wait forever.
            pending.delete(command.id)
            resolve(errorResult(command.id, 'engine_unavailable'))
          }
        })
      })
    },
  }
}

/** Asks the engine `health.get`; its answer, or undefined when the engine did not answer as running. */
export async function engineHealth(engine: EngineLink): Promise<Health | undefined> {
  const result = await engine.send({
    id: newId(),
    name: 'health.get',
    v: CONTRACT_VERSION,
    payload: undefined,
  })
  return result.ok ? healthSchema.safeParse(result.data).data : undefined
}

/** True when the engine runs and its data file opened: what the smoke start waits for. */
export function isHealthy(health: Health | undefined): boolean {
  return health?.engine === 'running' && health.data.isOk
}
