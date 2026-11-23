import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { AuthControls } from '@/components/auth-controls'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { AppToaster } from '@/components/error-toast'
import { PageSkeleton } from '@/components/page-skeleton'
import { RefreshStatus } from '@/components/refresh-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { notesQueries } from '@/modules/notes/hooks/notes-queries'
import { useDeleteNote } from '@/modules/notes/hooks/use-notes'

import { LazyNoteRenameForm } from '../components/lazy-note-forms'
import { RecentNotesSection } from '../sections/recent-notes-section'

const when = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

/** One note: its title, when it was made and changed (UTC), rename and delete, and more notes. */
export function NoteView() {
  const { noteId } = useParams({ from: '/notes_/$noteId' })
  const note = useQuery(notesQueries.detail(noteId))
  const remove = useDeleteNote()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  if (note.isPending) return <PageSkeleton />
  if (note.isError && !note.isRefetchError) {
    if (note.error.code === 'unauthenticated')
      return (
        <section className="flex flex-col gap-6">
          <h1 className="text-3xl font-semibold tracking-tight">Note</h1>
          <EmptyState title="Sign in to see this note">
            <div className="mt-3 flex justify-center">
              <AuthControls />
            </div>
          </EmptyState>
        </section>
      )
    return <ErrorState message={note.error.message} onRetry={() => void note.refetch()} />
  }

  const { title, createdAt, updatedAt } = note.data
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight break-words">{title}</h1>
      <RefreshStatus query={note} />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <dl className="text-muted-foreground grid grid-cols-2 gap-1 text-sm">
            <dt>Created</dt>
            <dd>{when.format(createdAt)} UTC</dd>
            <dt>Changed</dt>
            <dd>{when.format(updatedAt)} UTC</dd>
          </dl>
          {editing ? (
            <LazyNoteRenameForm note={note.data} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  remove.mutate({ id: noteId })
                  void navigate({ to: '/notes' })
                }}
              >
                Delete
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <RecentNotesSection currentId={noteId} />
      <AppToaster />
    </section>
  )
}
