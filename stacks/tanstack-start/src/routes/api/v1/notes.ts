import { createFileRoute } from '@tanstack/react-router'
import { methodNotAllowed } from '@/lib/http'
import { notesHttp } from '@/server/composition'

// The versioned HTTP API for clients that aren't this web app (mobile, desktop). The web app
// itself uses the server functions in notes.functions.ts. Auth: `Authorization: Bearer <Clerk
// session token>`. Body cap, rate limit and safe 5xx: src/server/request-guards.ts.
export const Route = createFileRoute('/api/v1/notes')({
  server: {
    handlers: {
      GET: ({ request }) => notesHttp().list(request),
      POST: ({ request }) => notesHttp().create(request),
      ANY: methodNotAllowed('GET', 'POST'),
    },
  },
})
