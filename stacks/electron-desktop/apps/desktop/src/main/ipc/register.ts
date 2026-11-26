import type { CommandData, CommandName, ParsedPayload } from '@app/contract/commands'
import { commands, isCommandName, MAIN_ONLY_COMMANDS } from '@app/contract/commands'
import type { Result } from '@app/contract/envelope'
import { COMMAND_CHANNEL, commandEnvelopeSchema, errorResult } from '@app/contract/envelope'
import { newId } from '@app/contract/ids'
import type { Logger } from '@app/engine/lib/logger'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import type { EngineLink } from '../engine-link'

// Tests that don't look at the log pass none.
const NO_LOG: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined }

/** Commands main answers itself because they need Electron, such as the native folder box. */
export type MainHandlers = Partial<{
  [N in CommandName]: (command: { id: string; payload: ParsedPayload<N> }) => Promise<CommandData<N>>
}>

/** Thrown by a main handler to answer with a failed result as it stands, such as one the engine sent. */
export class FailedResult extends Error {
  constructor(readonly result: Result<never>) {
    super('command failed')
    this.name = 'FailedResult'
  }
}

/** Who sent an IPC message: which window, which frame in it, and the frame's address. */
export interface Sender {
  isAppWindow: boolean
  isMainFrame: boolean
  url: string | undefined
}

/** True only for the top frame of the app's own window, showing one of the app's own addresses. */
export function isAppFrame(sender: Sender, allowedPrefixes: readonly string[]): boolean {
  const { url } = sender
  return (
    sender.isAppWindow &&
    sender.isMainFrame &&
    url !== undefined &&
    allowedPrefixes.some((p) => url.startsWith(p))
  )
}

/** Reads the sender of an invoke event; only the contents in `appWindowIds` count as the app's windows. */
export function senderOf(event: IpcMainInvokeEvent, appWindowIds: ReadonlySet<number>): Sender {
  const frame = event.senderFrame
  return {
    isAppWindow: appWindowIds.has(event.sender.id),
    isMainFrame: frame?.parent === null,
    url: frame?.url,
  }
}

/**
 * Checks one message from the screen and carries it to the engine. A wrong sender, a message that is
 * not an envelope, an unknown command or a bad payload is validation_failed, and the engine never sees it.
 */
export async function handleCommand(
  raw: unknown,
  isTrustedSender: boolean,
  engine: EngineLink,
  mainHandlers: MainHandlers = {},
  log: Logger = NO_LOG,
): Promise<Result<unknown>> {
  const envelope = commandEnvelopeSchema.safeParse(raw)
  // Without a valid envelope there is no request ID to cut the reference from, so a fresh one stands in.
  if (!envelope.success) return errorResult(newId(), 'validation_failed')
  const command = envelope.data
  if (!isTrustedSender || !isCommandName(command.name) || MAIN_ONLY_COMMANDS.has(command.name)) {
    return errorResult(command.id, 'validation_failed')
  }
  const payload = commands[command.name].payload.safeParse(command.payload)
  if (!payload.success) return errorResult(command.id, 'validation_failed')
  // TypeScript can't pair a union of handlers with its own payload; the schema above already did.
  const own = mainHandlers[command.name] as
    ((command: { id: string; payload: unknown }) => Promise<unknown>) | undefined
  if (!own) return engine.send(command)
  try {
    return { id: command.id, ok: true, data: await own({ id: command.id, payload: payload.data }) }
  } catch (error) {
    if (error instanceof FailedResult) return error.result
    // Electron itself failed (the native box, a window); the reference ID finds this request in the log.
    const failed = errorResult(command.id, 'unexpected')
    log.error('main handler failed', {
      referenceId: failed.ok ? undefined : failed.error.referenceId,
      command: command.name,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })
    return failed
  }
}

/** The only `ipcMain.handle` in the app (lint enforces it): every command comes through here. */
export function registerIpc(
  ipcMain: Pick<IpcMain, 'handle'>,
  engine: EngineLink,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  mainHandlers: MainHandlers = {},
  log: Logger = NO_LOG,
): void {
  ipcMain.handle(COMMAND_CHANNEL, (event, raw: unknown) =>
    handleCommand(raw, isTrusted(event), engine, mainHandlers, log),
  )
}
