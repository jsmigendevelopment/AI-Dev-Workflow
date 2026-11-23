import { CircleAlert } from 'lucide-react'
import { lazy, Suspense } from 'react'

import { Button } from '@/components/ui/button'
import { AppError } from '@/lib/app-error'
import { logger } from '@/lib/logger'

// Sonner loads in its own chunk after the page, not with it: toasts are for failures, which are
// rare, so the page's first load doesn't pay for them.
const loadToaster = () => import('./toaster')
const LazyToaster = lazy(() => loadToaster().then(({ Toaster }) => ({ default: Toaster })))

/** Where toasts appear. Mount it once on a page that shows them. */
export function AppToaster() {
  return (
    <Suspense>
      <LazyToaster />
    </Suspense>
  )
}

/** A short id the person can quote, matched to the log line written when the failure happened. */
export const newReferenceId = () => crypto.randomUUID().slice(0, 8)

interface ErrorToastProps {
  title: string
  error: unknown
  reference: string
  onRetry?: (() => void) | undefined
  onDismiss: () => void
}

/** The designed failure toast: icon, title, the error's safe message, its reference, and what to do. */
export function ErrorToast({ title, error, reference, onRetry, onDismiss }: ErrorToastProps) {
  const message = error instanceof AppError ? error.message : 'Something went wrong. Try again.'
  return (
    <div
      role="alert"
      className="bg-popover text-popover-foreground flex w-80 max-w-full gap-3 rounded-lg border p-4 shadow-md"
    >
      <CircleAlert aria-hidden className="text-destructive mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{message}</p>
        <p className="text-muted-foreground text-xs">Reference: {reference}</p>
        <div className="mt-2 flex gap-2">
          {onRetry ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onDismiss()
                onRetry()
              }}
            >
              Try again
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Logs the failure once with a reference id, then shows it in a toast that says what to do. */
export function showErrorToast(title: string, error: unknown, onRetry?: () => void) {
  const reference = newReferenceId()
  logger.warn('action_failed', {
    reference,
    title,
    code: error instanceof AppError ? error.code : 'unknown',
  })
  loadToaster()
    .then(({ showToast }) =>
      showToast(
        (dismiss) => (
          <ErrorToast
            title={title}
            error={error}
            reference={reference}
            onRetry={onRetry}
            onDismiss={dismiss}
          />
        ),
        10_000,
      ),
    )
    // Offline before the toaster chunk loaded: the failure is already logged above.
    .catch((cause: unknown) => logger.warn('toast_unavailable', { reference, error: cause }))
}
