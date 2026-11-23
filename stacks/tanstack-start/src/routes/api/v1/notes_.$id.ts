import { createFileRoute } from '@tanstack/react-router'
import { methodNotAllowed } from '@/lib/http'
import { notesHttp } from '@/server/composition'

// `notes_` (trailing underscore): a sibling of /api/v1/notes, not its child. See notes.ts.
export const Route = createFileRoute('/api/v1/notes_/$id')({
  server: {
    handlers: {
      PATCH: ({ request, params }) => notesHttp().rename(request, params.id),
      DELETE: ({ request, params }) => notesHttp().remove(request, params.id),
      ANY: methodNotAllowed('PATCH', 'DELETE'),
    },
  },
})
