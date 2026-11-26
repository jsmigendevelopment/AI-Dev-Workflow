import type { CommandData, CommandName, ParsedPayload } from '@app/contract/commands'
import { commands, isCommandName } from '@app/contract/commands'
import type { CommandEnvelope, Result } from '@app/contract/envelope'
import { errorResult } from '@app/contract/envelope'
import type { EventEnvelope } from '@app/contract/events'
import type { BuildInfo } from '@app/contract/health'

import { openData } from './db/database.ts'
import { logsDir } from './lib/data-dir.ts'
import { failureResult } from './lib/engine-error.ts'
import { createEventBus } from './lib/event-bus.ts'
import type { Logger } from './lib/logger.ts'
import { createLogger, pruneOldLogs } from './lib/logger.ts'
import type { Clock } from './lib/time.ts'
import { createHealthService } from './modules/health/health.service.ts'
import { createPreferencesRepository } from './modules/preferences/preferences.repository.ts'
import { createPreferencesService } from './modules/preferences/preferences.service.ts'

/** What the engine needs to start: the build, its data folder and a clock. */
export interface EngineDeps {
  build: BuildInfo
  dataDir: string
  clock: Clock
}

/** The running engine: it answers one command envelope at a time and pushes events. */
export interface Engine {
  handle(command: CommandEnvelope): Promise<Result<unknown>>
  /** Calls `listener` with every event the engine pushes; the returned function stops it. */
  onEvent(listener: (event: EventEnvelope) => void): () => void
}

/** What a handler knows about the command beyond its payload: the request ID for audit rows. */
interface Request {
  requestId: string
}

// Each handler gets the payload already parsed with its command's schema.
type Handlers = {
  [N in CommandName]: (
    payload: ParsedPayload<N>,
    request: Request,
  ) => Promise<CommandData<N>> | CommandData<N>
}

/** The one place that builds the engine's services and maps each command to one. */
export function createEngine({ build, dataDir, clock }: EngineDeps): Engine {
  const logs = logsDir(dataDir)
  const log = createLogger(logs, clock)
  pruneOldLogs(logs, clock())
  const data = openData({ dataDir, clock, log })
  const bus = createEventBus(clock)
  const health = createHealthService({ build, dataDir, data })
  const preferences = createPreferencesService({
    repository: createPreferencesRepository({ db: data.db, clock }),
  })
  const handlers: Handlers = {
    'health.get': () => health.get(),
    'preferences.get': () => preferences.get(),
    'preferences.update': async (change, request) => {
      const saved = await preferences.update(change, request)
      bus.emit('preferences.changed', saved)
      return saved
    },
  }
  log.info('engine started', { version: build.version, flavour: build.flavour, isDataOk: data.isOk })
  return { onEvent: bus.subscribe, handle: handleWith(handlers, log) }
}

/** Checks a command envelope, runs its handler and answers it; a refused or failed command is logged once. */
function handleWith(handlers: Handlers, log: Logger): Engine['handle'] {
  return async (command) => {
    // Main has already checked the command; this check keeps the engine safe on any carrier.
    const refuse = () => {
      log.warn('command refused', { requestId: command.id, name: command.name })
      return errorResult(command.id, 'validation_failed')
    }
    if (!isCommandName(command.name)) return refuse()
    const parsed = commands[command.name].payload.safeParse(command.payload)
    if (!parsed.success) return refuse()
    try {
      // TypeScript can't pair a union of handlers with its own payload; the schema above already did.
      const handler = handlers[command.name] as (payload: unknown, request: Request) => unknown
      return { id: command.id, ok: true, data: await handler(parsed.data, { requestId: command.id }) }
    } catch (error) {
      log.error('command failed', { requestId: command.id, name: command.name, error: String(error) })
      return failureResult(command.id, error)
    }
  }
}
