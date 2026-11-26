import { z } from 'zod'

import { healthSchema } from './health.ts'
import { preferencesSchema, preferencesUpdateSchema } from './preferences.ts'

/** Every command: its payload schema and its result schema. Main and the engine both check against it. */
export const commands = {
  'health.get': { payload: z.undefined(), result: healthSchema },
  'preferences.get': { payload: z.undefined(), result: preferencesSchema },
  'preferences.update': { payload: preferencesUpdateSchema, result: preferencesSchema },
} as const

/** A command's name. */
export type CommandName = keyof typeof commands

/**
 * Commands only main may send to the engine, never the screen. Empty in the starter: add a command here
 * when main sends it on its own (say, with what a native box returned) and the screen must not fake it.
 */
export const MAIN_ONLY_COMMANDS: ReadonlySet<CommandName> = new Set<CommandName>([])

/** What a command takes. */
export type CommandPayload<N extends CommandName> = z.input<(typeof commands)[N]['payload']>

/** A command's payload once its schema has parsed it: what the engine's handler gets. */
export type ParsedPayload<N extends CommandName> = z.output<(typeof commands)[N]['payload']>

/** What a command returns when it succeeds. */
export type CommandData<N extends CommandName> = z.output<(typeof commands)[N]['result']>

/** True when `name` is a command the contract knows. */
export function isCommandName(name: string): name is CommandName {
  return Object.hasOwn(commands, name)
}
