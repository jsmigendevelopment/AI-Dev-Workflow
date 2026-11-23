import { useNavigate, useSearch } from '@tanstack/react-router'

import { AuthControls } from '@/components/auth-controls'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { AppToaster } from '@/components/error-toast'
import { PageSkeleton } from '@/components/page-skeleton'
import { RefreshStatus } from '@/components/refresh-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useNotesList } from '@/modules/notes/hooks/use-notes'

import { LazyNoteCreateForm } from '../components/lazy-note-forms'
import { NoteItem } from '../components/note-item'
import { NotesFilter } from '../components/notes-filter'

export function NotesView() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
      <NotesBody />
      <AppToaster />
    </section>
  )
}

/** The filter, order and page count live in the URL (`validateSearch` on the route), so a link or a refresh shows the same list. */
function NotesBody() {
  const search = useSearch({ from: '/notes' })
  const navigate = useNavigate({ from: '/notes' })
  const list = useNotesList({ q: search.q, sort: search.sort })

  if (list.isPending) return <PageSkeleton />

  if (list.isError && !list.isRefetchError) {
    if (list.error.code === 'unauthenticated')
      return (
        <EmptyState title="Sign in to see your notes">
          <div className="mt-3 flex justify-center">
            <AuthControls />
          </div>
        </EmptyState>
      )
    return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
  }

  const notes = list.data.pages.flatMap((page) => page.items)
  const loadMore = async () => {
    await list.fetchNextPage()
    await navigate({
      search: (prev) => ({ ...prev, page: prev.page + 1 }),
      replace: true,
      resetScroll: false,
    })
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your notes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LazyNoteCreateForm />
        <NotesFilter q={search.q} sort={search.sort} />
        <RefreshStatus query={list} />
        {notes.length === 0 ? (
          search.q ? (
            <EmptyState title={`No notes match “${search.q}”`}>
              Try another word, or clear the search.
            </EmptyState>
          ) : (
            <EmptyState title="No notes yet">Add your first one above.</EmptyState>
          )
        ) : (
          <ul className="divide-y">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} />
            ))}
          </ul>
        )}
        {list.hasNextPage ? (
          <Button variant="outline" onClick={() => void loadMore()} disabled={list.isFetchingNextPage}>
            Load more
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
