/**
 * The /api/v1 route table: the one place web routes and every client agree on paths and methods.
 *
 * Every route:
 * - takes `Authorization: Bearer <Clerk session token>`; no or bad token → 401 `unauthenticated`;
 * - takes and answers `application/json`; the body is always an `ApiResult` envelope;
 * - answers the status of its error code (`ERROR_STATUS`), 201 for a create, 200 otherwise;
 * - answers someone else's id with 404 `not_found`, never 403.
 */
export const API_PREFIX = '/api/v1'

export const routes = {
  notes: {
    list: { method: 'GET', path: `${API_PREFIX}/notes` },
    create: { method: 'POST', path: `${API_PREFIX}/notes`, status: 201 },
    rename: { method: 'PATCH', path: `${API_PREFIX}/notes/:id` },
    remove: { method: 'DELETE', path: `${API_PREFIX}/notes/:id` },
  },
} as const

/** Fill `:name` segments, URL-encoding each value. */
export function pathFor(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([a-zA-Z]+)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${path}`)
    return encodeURIComponent(value)
  })
}
