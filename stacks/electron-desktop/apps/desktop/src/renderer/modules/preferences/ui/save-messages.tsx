import { asCommandError } from '@/lib/app-api.ts'

import { PREFERENCES_COPY } from '../copy.ts'

/** The engine's refusal, with its reference ID, for the form's alert line. */
function saveFailure(error: Error | null): string {
  if (!error) return ''
  const { message, referenceId } = asCommandError(error)
  return `${PREFERENCES_COPY.saveFailed} ${message} Reference ${referenceId}`
}

/** The save's alert line (a refusal, with its reference ID) and its status line. */
export function SaveMessages({ error, isSuccess }: { error: Error | null; isSuccess: boolean }) {
  return (
    <>
      <p role="alert" className="font-semibold">
        {saveFailure(error)}
      </p>
      <p role="status" className="text-muted">
        {isSuccess ? PREFERENCES_COPY.saved : ''}
      </p>
    </>
  )
}
