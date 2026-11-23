import { StartClient } from '@tanstack/react-start/client'
import { type ErrorInfo, startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

import { AppError } from '@/lib/app-error'
import { logger } from '@/lib/logger'

/**
 * An error a section's boundary caught and showed with ErrorState. An AppError is expected (signed
 * out, not found, rate limited): the screen already says what to do, so it isn't logged as a
 * failure. Anything else is a bug, logged once, here.
 */
function onCaughtError(error: unknown, info: ErrorInfo) {
  if (error instanceof AppError) return
  logger.error('ui_error_caught', { error, component_stack: info.componentStack })
}

// Start's default client entry, plus the error policy above.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    { onCaughtError },
  )
})
