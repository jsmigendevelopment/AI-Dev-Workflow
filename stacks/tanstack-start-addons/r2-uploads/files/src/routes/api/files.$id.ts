import { createFileRoute } from '@tanstack/react-router'
import { filesHttp } from '@/server/composition'

// The bytes: PUT streams the upload into R2, GET streams it back. A server route, because
// server functions buffer and serialize their input. Auth is checked inside (no middleware here).
export const Route = createFileRoute('/api/files/$id')({
  server: {
    handlers: {
      PUT: ({ request, params }) => filesHttp().put(request, params.id),
      GET: ({ request, params }) => filesHttp().get(request, params.id),
    },
  },
})
