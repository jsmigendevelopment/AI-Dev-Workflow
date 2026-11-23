import { Button } from '@/components/ui/button'
import { AppError } from '@/lib/app-error'

/**
 * For failures with no better screen. Shows a safe message, never the raw error: an `error` that
 * is an AppError shows its own message (written for users); anything else shows the default.
 */
export function ErrorState({
  error,
  message = error instanceof AppError ? error.message : 'Something went wrong.',
  onRetry,
}: {
  error?: unknown
  message?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="border-destructive/40 rounded-lg border p-6">
      <p className="font-medium">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={onRetry ?? (() => window.location.reload())}
      >
        Try again
      </Button>
    </div>
  )
}
