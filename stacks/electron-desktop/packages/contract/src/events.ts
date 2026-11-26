import { z } from 'zod'

import { CONTRACT_VERSION } from './envelope.ts'
import { preferencesSchema } from './preferences.ts'

/** Every event the engine pushes: its payload schema. */
export const events = {
  /** The preferences were saved: every screen that shows them follows. */
  'preferences.changed': preferencesSchema,
} as const

/** An event's name. */
export type EventName = keyof typeof events

/** An event's payload. */
export type EventPayload<N extends EventName> = z.output<(typeof events)[N]>

/** An event on the wire: `{ name, v: 1, at, payload }`, `at` in UTC. */
export interface EventEnvelope<N extends EventName = EventName> {
  name: N
  v: typeof CONTRACT_VERSION
  at: string
  payload: EventPayload<N>
}

const envelopeShape = z.strictObject({
  name: z.string().min(1).max(100),
  v: z.literal(CONTRACT_VERSION),
  at: z.iso.datetime(),
  payload: z.unknown(),
})

/** Checks an event from the wire: a known name, the version, and its payload. Undefined when it isn't one. */
export function parseEvent(raw: unknown): EventEnvelope | undefined {
  const envelope = envelopeShape.safeParse(raw)
  if (!envelope.success || !Object.hasOwn(events, envelope.data.name)) return undefined
  const name = envelope.data.name as EventName
  const payload = events[name].safeParse(envelope.data.payload)
  return payload.success ? { ...envelope.data, name, v: CONTRACT_VERSION, payload: payload.data } : undefined
}

/** The one IPC channel events travel on, from main to the screen. */
export const EVENT_CHANNEL = 'app:event'
