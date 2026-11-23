import { useQueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { __plural__Queries } from '@/modules/__mod__/hooks/use-__mod__'

/**
 * __Title__: Suspense (with the skeleton) around an error boundary (with ErrorState) around the
 * content that runs the query. It loads and fails on its own. Replace the content with what this
 * section shows; keep the skeleton the same shape as the content.
 */
export function __Name__Section() {
  const { reset } = useQueryErrorResetBoundary()
  return (
    <Suspense fallback={<__Name__Skeleton />}>
      <CatchBoundary
        getResetKey={() => '__key__'}
        errorComponent={({ error, reset: retry }) => (
          <ErrorState
            error={error}
            onRetry={() => {
              reset()
              retry()
            }}
          />
        )}
      >
        <__Name__Content />
      </CatchBoundary>
    </Suspense>
  )
}

function __Name__Content() {
  const { data } = useSuspenseQuery(__plural__Queries.list())
  if (data.length === 0) return <EmptyState title="Nothing here yet" />
  return (
    <ul className="flex flex-col gap-2">
      {data.map((item) => (
        <li key={item.id} className="truncate">
          {item.title}
        </li>
      ))}
    </ul>
  )
}

/** The content's shape: the same rows at the same height, so nothing moves on load. */
export function __Name__Skeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Loading</span>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-6 w-full" />
      ))}
    </div>
  )
}
