import { Button } from '@/components/ui/button'

/** For failures with no better screen. Shows a safe message, never the raw error. */
export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
}: {
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
