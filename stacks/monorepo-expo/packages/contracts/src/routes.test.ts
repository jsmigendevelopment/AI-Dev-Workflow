import { describe, expect, it } from 'vitest'
import { pathFor, routes } from './routes'

describe('route table', () => {
  it('keeps every route under /api/v1', () => {
    for (const route of Object.values(routes.notes)) expect(route.path.startsWith('/api/v1/')).toBe(true)
  })

  it('fills and encodes path parameters', () => {
    expect(pathFor(routes.notes.rename.path, { id: 'a/b' })).toBe('/api/v1/notes/a%2Fb')
  })

  it('throws on a missing parameter rather than calling a wrong URL', () => {
    expect(() => pathFor(routes.notes.remove.path)).toThrow('Missing path parameter "id"')
  })
})
