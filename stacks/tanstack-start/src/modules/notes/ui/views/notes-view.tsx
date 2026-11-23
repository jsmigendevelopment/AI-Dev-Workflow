import { AuthControls } from '@/components/auth-controls'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useNotesList } from '../../hooks/use-notes'
import { NoteCreateForm } from '../components/note-create-form'
import { NoteItem } from '../components/note-item'

export function NotesView() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
      <NotesBody />
    </section>
  )
}

function NotesBody() {
  const list = useNotesList()

  if (list.isPending) return <p className="text-muted-foreground">Loading notes…</p>

  if (list.isError) {
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your notes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <NoteCreateForm />
        {notes.length === 0 ? (
          <EmptyState title="No notes yet">Add your first one above.</EmptyState>
        ) : (
          <ul className="divide-y">
            {notes.map((note) => (
              <NoteItem key={note.id} note={note} />
            ))}
          </ul>
        )}
        {list.hasNextPage ? (
          <Button
            variant="outline"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            Load more
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
