import { ErrorState } from '@/components/error-state.tsx'
import { Skeleton } from '@/components/skeleton.tsx'
import { Button } from '@/components/ui/button.tsx'
import { asCommandError } from '@/lib/app-api.ts'

import { PREFERENCES_COPY } from '../copy.ts'
import { usePreferences } from '../hooks/use-preferences.ts'
import { PreferencesForm } from './preferences-form.tsx'

/** The loading card, in the form's shape so the fields land where the bones were. */
function PreferencesSkeleton() {
  return (
    <div className="grid gap-4 rounded-r3 border border-line bg-surface p-6 shadow-hair">
      <p role="status" className="sr-only">
        {PREFERENCES_COPY.loading}
      </p>
      <div className="flex flex-wrap items-center gap-8">
        <Skeleton className="w-28" />
        <Skeleton className="h-10 w-40 rounded-r1" />
        <Skeleton className="h-10 w-40 rounded-r1" />
      </div>
      <Skeleton className="ml-auto h-10 w-32 rounded-r1" />
    </div>
  )
}

/** The Preferences section: the loading card, the designed error with its reference ID and Try again, or the form. */
export function PreferencesSection() {
  const query = usePreferences()
  // Try again shows the loading card while it asks again.
  if (query.isPending || (query.isError && query.isFetching)) return <PreferencesSkeleton />
  if (query.isError) {
    const error = asCommandError(query.error)
    return (
      <ErrorState
        title={PREFERENCES_COPY.loadFailedTitle}
        message={error.message}
        referenceId={error.referenceId}
        action={
          <Button variant="outline" onClick={() => void query.refetch()}>
            {PREFERENCES_COPY.tryAgain}
          </Button>
        }
      />
    )
  }
  return <PreferencesForm preferences={query.data} />
}
