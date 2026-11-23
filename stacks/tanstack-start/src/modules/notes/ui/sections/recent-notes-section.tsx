import { useQueryErrorResetBoundary, useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { CatchBoundary, Link } from '@tanstack/react-router'
import { Suspense } from 'react'

import { ErrorState } from '@/components/error-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { notesQueries } from '@/modules/notes/hooks/notes-queries'

/**
 * The streamed part of a note's page. The loader starts this query without awaiting it, so the
 * server sends the note first with this skeleton in place, then the list when it resolves.
 */
export function RecentNotesSection({ currentId }: { currentId: string }) {
  const { reset } = useQueryErrorResetBoundary()
  return (
    <Suspense fallback={<RecentNotesSkeleton />}>
      <CatchBoundary
        getResetKey={() => 'recent-notes'}
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
        <RecentNotes currentId={currentId} />
      </CatchBoundary>
    </Suspense>
  )
}

function RecentNotes({ currentId }: { currentId: string }) {
  const { data } = useSuspenseInfiniteQuery(notesQueries.recent())
  const others = data.pages.flatMap((page) => page.items).filter((note) => note.id !== currentId)
  return (
    <Card>
      <CardHeader>
        <CardTitle>More notes</CardTitle>
      </CardHeader>
      <CardContent>
        {others.length === 0 ? (
          <p className="text-muted-foreground text-sm">This is your only note.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {others.map((note) => (
              <li key={note.id} className="truncate">
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: note.id }}
                  className="underline-offset-4 hover:underline"
                >
                  {note.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** The loaded card's shape: its title and four link rows, so nothing moves when it streams in. */
export function RecentNotesSkeleton() {
  return (
    <Card aria-busy="true">
      <span className="sr-only">Loading more notes…</span>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-6 w-3/4" />
        ))}
      </CardContent>
    </Card>
  )
}
