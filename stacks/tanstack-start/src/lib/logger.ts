type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

// Keys whose values never reach a log line. Opt a field in by giving it a name that isn't here.
const SECRET = /token|secret|password|passwd|cookie|authorization|api[-_]?key|session|email/i

function clean(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
  if (depth > 4 || typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET.test(k) ? '[redacted]' : clean(v, depth + 1)]),
  )
}

function write(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(clean(fields) as Fields) })
  // The one place that may call console: Workers Logs collects each JSON line.
  console[level](line)
}

/**
 * The app's only logger: one JSON line per event, `event` an `object_action` name, secrets
 * masked by key. Log an error once, where it is caught.
 */
export const logger = {
  debug: (event: string, fields?: Fields) => write('debug', event, fields),
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
}
