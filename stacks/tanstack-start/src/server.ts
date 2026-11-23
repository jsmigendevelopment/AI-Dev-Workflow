import handler from '@tanstack/react-start/server-entry'

import { beforeStart } from '@/server/request-guards'

/**
 * The Worker entry (wrangler.jsonc "main"). Start answers `//x` and a server function path with no
 * ID before any request middleware runs, so `beforeStart` answers those first; every other request
 * goes to Start's handler, where the request guards (src/start.ts) run before anything else.
 */
export default {
  fetch: (request) => beforeStart(request) ?? handler.fetch(request),
} satisfies ExportedHandler<Cloudflare.Env>
