import { createFileRoute } from '@tanstack/react-router'
import { notesQueries } from '@/modules/notes/hooks/use-notes'
import { NotesView } from '@/modules/notes/ui/views/notes-view'

// Thin: start the first page loading, render the module's view. The server function checks auth.
export const Route = createFileRoute('/notes')({
  head: () => ({ meta: [{ title: 'Notes' }] }),
  loader: ({ context }) => context.queryClient.infiniteQuery(notesQueries.list()).catch(() => undefined),
  component: NotesView,
})
