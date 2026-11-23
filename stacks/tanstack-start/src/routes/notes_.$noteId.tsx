import { createFileRoute, notFound } from '@tanstack/react-router'

import { AppError } from '@/lib/app-error'
import { pageHead } from '@/lib/seo'
import { notesQueries } from '@/modules/notes/hooks/notes-queries'
import { parseNoteParams } from '@/modules/notes/search'
import { NoteNotFound } from '@/modules/notes/ui/components/note-not-found'
import { NoteView } from '@/modules/notes/ui/views/note-view'

// `/notes/<uuid>`, outside the /notes layout (the trailing _). A path that isn't a UUID doesn't
// match (parse returns false), so it gets the app's 404. A UUID that isn't one of your notes
// throws notFound() from the loader and gets this route's own not-found state, with status 404.
export const Route = createFileRoute('/notes_/$noteId')({
  params: {
    parse: parseNoteParams,
    stringify: ({ noteId }) => ({ noteId }),
  },
  head: ({ params }) =>
    pageHead({
      path: `/notes/${params.noteId}`,
      title: 'Note',
      description: 'One of your notes.',
      noindex: true,
    }),
  loader: async ({ context, params: { noteId } }) => {
    // Streamed: not awaited, so the note renders first and "More notes" arrives in the same
    // response once it resolves (the Suspense boundary in the view, and the SSR Query integration).
    void context.queryClient.infiniteQuery(notesQueries.recent()).catch(() => undefined)
    try {
      await context.queryClient.query(notesQueries.detail(noteId))
    } catch (error) {
      if (error instanceof AppError && error.code === 'not_found') throw notFound()
      // Anything else (signed out, offline) is the view's to show, from the query's error.
    }
  },
  component: NoteView,
  notFoundComponent: NoteNotFound,
})
