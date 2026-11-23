import * as Sentry from '@sentry/react'
import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { sentryOptions } from '@/lib/monitoring'

// The browser entry: Start's default, plus Sentry. The DSN is public and read at build time;
// with no VITE_SENTRY_DSN the SDK is never initialised.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (dsn) Sentry.init({ ...sentryOptions({ dsn, environment: import.meta.env.MODE }) })

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler(),
      onRecoverableError: Sentry.reactErrorHandler(),
    },
  )
})
