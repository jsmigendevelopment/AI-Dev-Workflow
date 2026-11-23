import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { pageHead } from '@/lib/seo'
import { notesQueries } from '@/modules/notes/hooks/notes-queries'
import { parseNotesSearch } from '@/modules/notes/search'
import { NotesView } from '@/modules/notes/ui/views/notes-view'

// Thin: validate the URL, start the list loading, render the module's view. The server function
// checks auth. An app page behind sign-in: noindex, and not in the sitemap.
export const Route = createFileRoute('/notes')({
  // ?q=&sort=&page=: shareable list state. Defaults are left out of the URL, so /notes stays /notes.
  validateSearch: parseNotesSearch,
  search: { middlewares: [stripSearchParams({ sort: 'newest', page: 1 })] },
  loaderDeps: ({ search }) => search,
  head: () =>
    pageHead({ path: '/notes', title: 'Notes', description: 'Your notes, kept private.', noindex: true }),
  // `pages` fetches as many pages as the link says were open, so a refresh shows the same list.
  loader: ({ context, deps: { q, sort, page } }) =>
    context.queryClient
      .infiniteQuery({ ...notesQueries.list({ q, sort }), pages: page })
      .catch(() => undefined),
  component: NotesView,
})
