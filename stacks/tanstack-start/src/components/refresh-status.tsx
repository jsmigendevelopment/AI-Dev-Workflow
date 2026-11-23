import { CloudOff, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** The subset of a query result this needs; any useQuery or useInfiniteQuery result fits. */
export interface RefreshableQuery {
  isFetching: boolean
  isPending: boolean
  isRefetchError: boolean
  isFetchingNextPage?: boolean
  dataUpdatedAt: number
  refetch: () => unknown
}

const clock = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })

/**
 * The two states of data already on screen: a small "Updating…" while it refetches in the
 * background (never the skeleton again), and, when that refetch fails, a banner that keeps the
 * old data and says how old it is. Nothing at all while the data is fresh and settled.
 */
export function RefreshStatus({ query }: { query: RefreshableQuery }) {
  if (query.isRefetchError)
    return (
      <div role="alert" className="bg-muted flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        <CloudOff aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          Couldn’t refresh. Showing data from {clock.format(query.dataUpdatedAt)}.
        </p>
        <Button size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Retry
        </Button>
      </div>
    )
  const background = query.isFetching && !query.isPending && !query.isFetchingNextPage
  return (
    <p role="status" className="text-muted-foreground flex h-5 items-center gap-1.5 text-xs">
      {background ? (
        <>
          <RefreshCw aria-hidden className="size-3 motion-safe:animate-spin" />
          Updating…
        </>
      ) : null}
    </p>
  )
}
