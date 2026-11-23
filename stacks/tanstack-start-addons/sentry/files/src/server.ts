import * as Sentry from '@sentry/cloudflare'
import handler from '@tanstack/react-start/server-entry'
import { sentryOptions } from '@/lib/monitoring'
import { beforeStart } from '@/server/request-guards'

/**
 * The Worker entry (wrangler.jsonc "main"). The pack's `beforeStart`, then Start's own handler,
 * wrapped by Sentry so uncaught errors and `console.error` calls (the controller's "unhandled" log)
 * are reported.
 * No SENTRY_DSN, no reporting: the wrapper still runs, but the SDK is disabled.
 */
export default Sentry.withSentry(
  (env: Cloudflare.Env) => ({
    ...sentryOptions({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT }),
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
  }),
  // Bindings are read with `import { env } from 'cloudflare:workers'`, so only the request is passed on.
  {
    fetch: (request) => beforeStart(request) ?? handler.fetch(request),
  } satisfies ExportedHandler<Cloudflare.Env>,
)
