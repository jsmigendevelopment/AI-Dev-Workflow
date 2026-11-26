import type { CommandData, CommandName, CommandPayload } from './commands.ts'
import type { Result } from './envelope.ts'
import type { EventName, EventPayload } from './events.ts'

/** Where the preload puts the API on `window`. */
export const API_KEY = 'app'

/** The arguments after the name: none for a command without a payload, else the payload. */
export type PayloadArgs<N extends CommandName> =
  CommandPayload<N> extends undefined ? [] : [payload: CommandPayload<N>]

/** The typed API the preload gives the screen, generated from the contract's command list. */
export interface AppApi {
  send<N extends CommandName>(name: N, ...args: PayloadArgs<N>): Promise<Result<CommandData<N>>>
  /** Calls `listener` with each checked `name` event the engine pushes; the returned function stops it. */
  on<N extends EventName>(name: N, listener: (payload: EventPayload<N>) => void): () => void
}
