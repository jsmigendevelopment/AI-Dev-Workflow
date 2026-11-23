import { createFileRoute } from '@tanstack/react-router'

import { pageHead } from '@/lib/seo'
import { notesQueries } from '@/modules/notes/hooks/use-notes'
import { NotesView } from '@/modules/notes/ui/views/notes-view'

// Thin: start the first page loading, render the module's view. The server function checks auth.
// An app page behind sign-in: noindex, and not in the sitemap.
export const Route = createFileRoute('/notes')({
  head: () =>
    pageHead({ path: '/notes', title: 'Notes', description: 'Your notes, kept private.', noindex: true }),
  loader: ({ context }) => context.queryClient.infiniteQuery(notesQueries.list()).catch(() => undefined),
  component: NotesView,
})
