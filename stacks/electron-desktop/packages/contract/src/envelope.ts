import { z } from 'zod'

import { ERROR_MESSAGES } from './copy.ts'
import type { ErrorCode } from './errors.ts'
import { ERROR_CODES, referenceIdFor } from './errors.ts'

/** The contract's version, the desktop stand-in for `/api/v1`. A breaking change adds `v: 2` beside it. */
export const CONTRACT_VERSION = 1

/** Any command on the wire, before its name and payload are checked: `{ id, name, v: 1, payload }`. */
export const commandEnvelopeSchema = z.strictObject({
  id: z.uuid({ version: 'v7' }),
  name: z.string().min(1).max(100),
  v: z.literal(CONTRACT_VERSION),
  payload: z.unknown(),
})

/** A command envelope that passed `commandEnvelopeSchema`. */
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>

/** A command's answer on the wire: `{ id, ok: true, data }` or `{ id, ok: false, error }`. */
export const resultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.string(), ok: z.literal(true), data: z.unknown() }),
  z.strictObject({
    id: z.string(),
    ok: z.literal(false),
    error: z.strictObject({ code: z.enum(ERROR_CODES), message: z.string(), referenceId: z.string() }),
  }),
])

/** A command's answer, with its data typed. */
export type Result<T> =
  { id: string; ok: true; data: T } | Extract<z.infer<typeof resultSchema>, { ok: false }>

/** A failed result for the request, with the code's plain message and the request's reference ID. */
export function errorResult(id: string, code: ErrorCode): Result<never> {
  return { id, ok: false, error: { code, message: ERROR_MESSAGES[code], referenceId: referenceIdFor(id) } }
}

/** The one IPC channel every command travels on, from the preload to main. */
export const COMMAND_CHANNEL = 'app:command'
