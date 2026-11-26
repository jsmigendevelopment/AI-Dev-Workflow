import type { CommandData, CommandName } from '@app/contract/commands'
import { ERROR_MESSAGES } from '@app/contract/copy'
import type { ErrorCode } from '@app/contract/errors'
import type { EventName, EventPayload } from '@app/contract/events'
import { referenceIdFor } from '@app/contract/errors'
import { newId } from '@app/contract/ids'
import type { AppApi, PayloadArgs } from '@app/contract/preload-api'
import { API_KEY } from '@app/contract/preload-api'

declare global {
  interface Window {
    /** The preload's API (preload/preload.ts). */
    [API_KEY]: AppApi
  }
}

/** A command the engine answered with an error: its code, plain message and reference ID. */
export class CommandError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly referenceId: string,
  ) {
    super(message)
    this.name = 'CommandError'
  }
}

/** Any error a query or a mutation holds, as a `CommandError`: one the engine sent, or `unexpected`. */
export function asCommandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error
  // The IPC call itself failed, so no request ID came back; a fresh one gives the person a reference.
  return new CommandError('unexpected', ERROR_MESSAGES.unexpected, referenceIdFor(newId()))
}

/**
 * Sends a command through the preload's API and answers its data, or throws a `CommandError`. Each
 * module's `api.ts` calls this; nothing else in the screen talks to the preload.
 */
export async function send<N extends CommandName>(name: N, ...args: PayloadArgs<N>): Promise<CommandData<N>> {
  const result = await window[API_KEY].send(name, ...args)
  if (!result.ok) throw new CommandError(result.error.code, result.error.message, result.error.referenceId)
  return result.data
}

/** Listens for one kind of engine event through the preload's API; the returned function stops it. */
export function subscribe<N extends EventName>(
  name: N,
  listener: (payload: EventPayload<N>) => void,
): () => void {
  return window[API_KEY].on(name, listener)
}
