import path from 'node:path'

import { logsDir } from '@app/engine/lib/data-dir'
import type { Logger } from '@app/engine/lib/logger'
import { createLogger, pruneOldLogs } from '@app/engine/lib/logger'
import type { Clock } from '@app/engine/lib/time'

// A drive (C:\ or C:/), a UNC share (\\server) or a POSIX root (/home), not part of a web address.
const PATH = /(?<![\w:/\\.])(?:[A-Za-z]:[\\/]|\\\\|\/)[^\s"'<>]+/g
const PATH_MASK = '[path]'

/** The text with every file path replaced by `[path]`: a path can hold the person's user name. */
export function maskPaths(text: string): string {
  return text.replace(PATH, PATH_MASK)
}

const maskValue = (value: unknown): unknown => (typeof value === 'string' ? maskPaths(value) : value)

/**
 * Main's logger: the engine's JSON-lines logger, tokens masked, in `logs/main/` inside the data folder so
 * the two processes never write one file, made on its first line. Main also masks paths, which its errors carry.
 */
export function createMainLogger(dataDir: string, clock: Clock): Logger {
  const dir = path.join(logsDir(dataDir), 'main')
  // Made on the first line: most runs log nothing from main, and then leave no folder behind.
  let inner: Logger | undefined
  const opened = () => {
    if (inner) return inner
    inner = createLogger(dir, clock)
    pruneOldLogs(dir, clock())
    return inner
  }
  const masked =
    (level: keyof Logger) =>
    (msg: string, fields: Record<string, unknown> = {}) =>
      opened()[level](
        maskPaths(msg),
        Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, maskValue(value)])),
      )
  return { info: masked('info'), warn: masked('warn'), error: masked('error') }
}
