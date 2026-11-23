/**
 * Sentry settings shared by the browser and the Worker. No SDK import here, so it is a plain,
 * testable function. With no DSN, `enabled` is false and the SDK sends nothing.
 */

/** The parts of a Sentry event we clean. Structural, so this file needs no Sentry types. */
interface ScrubbableEvent {
  request?: { cookies?: unknown; headers?: Record<string, string>; query_string?: unknown; data?: unknown }
  user?: { ip_address?: unknown; email?: unknown; [key: string]: unknown }
}

const SECRET_HEADERS = ['cookie', 'authorization', 'x-api-key', 'stripe-signature', 'svix-signature']

/** Drop what could identify a person or carry a secret: cookies, auth headers, bodies, query strings, IPs. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.request) {
    delete event.request.cookies
    delete event.request.data
    delete event.request.query_string
    const headers = event.request.headers
    if (headers)
      for (const name of Object.keys(headers))
        if (SECRET_HEADERS.includes(name.toLowerCase())) delete headers[name]
  }
  if (event.user) {
    delete event.user.ip_address
    delete event.user.email
  }
  return event
}

export interface MonitoringSettings {
  dsn: string | undefined
  environment?: string | undefined
}

export function sentryOptions({ dsn, environment }: MonitoringSettings) {
  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: environment || 'production',
    // Errors only. Turn tracing on deliberately: it costs quota on every request.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  }
}

/**
 * The origin the browser SDK sends events to, for the page CSP's `connect-src` (CSP_EXTRA in
 * src/lib/security-headers.ts). A DSN is `https://<key>@<ingest host>/<project>`. Empty without one.
 */
export function sentryIngestOrigin(dsn: string | undefined): string[] {
  if (!dsn) return []
  try {
    const url = new URL(dsn)
    return url.protocol === 'https:' && /^[a-z0-9.-]+$/i.test(url.hostname) ? [url.origin] : []
  } catch {
    return []
  }
}
