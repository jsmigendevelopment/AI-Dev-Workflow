import type { EventEnvelope, EventName, EventPayload } from '@app/contract/events'
import { CONTRACT_VERSION } from '@app/contract/envelope'

import type { Clock } from './time.ts'

/** Where the engine's services push events, and where the carrier listens for them. */
export interface EventBus {
  emit<N extends EventName>(name: N, payload: EventPayload<N>): void
  /** Calls `listener` with every event from now on; the returned function stops it. */
  subscribe(listener: (event: EventEnvelope) => void): () => void
}

/** Wraps each event in the contract's envelope, stamped by the engine's clock in UTC. */
export function createEventBus(clock: Clock): EventBus {
  const listeners = new Set<(event: EventEnvelope) => void>()
  return {
    emit(name, payload) {
      const event = { name, v: CONTRACT_VERSION, at: clock().toISOString(), payload } as EventEnvelope
      for (const listener of listeners) listener(event)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
