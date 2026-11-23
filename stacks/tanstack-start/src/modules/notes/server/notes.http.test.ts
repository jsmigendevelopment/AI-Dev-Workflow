import { describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/lib/actor'
import type { ApiProblem } from '@/lib/app-error'
import { notesController } from './notes.controller'
import { notesHttp } from './notes.http'
import { memoryNotesRepository } from './notes.repository.memory'
import { createNotesService, type NotesService } from './notes.service'

const ann: Actor = { userId: 'user_ann' }
const bob: Actor = { userId: 'user_bob' }
const BASE = 'https://app.example.com/api/v1/notes'

/** One API over one memory repo; `as` picks who the bearer token belongs to. */
function api() {
  let n = 0
  let clock = 1000
  const service = createNotesService({
    repo: memoryNotesRepository(),
    now: () => clock++,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  })
  let who: Actor | null = ann
  const http = notesHttp(notesController(service), async () => who)
  return { http, as: (actor: Actor | null) => (who = actor) }
}

const json = (method: string, body: unknown, url = BASE) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** Loose on purpose: each test asserts the exact shape it cares about. */
interface Body {
  ok: boolean
  data: { id: string; title: string; items: { title: string }[]; nextCursor: string | null }
  error: ApiProblem
}
const body = async (response: Response) => (await response.json()) as Body
const read = async (response: Response) => ({ status: response.status, body: await body(response) })

describe('/api/v1/notes contract', () => {
  it('answers 401 with the envelope and a Bearer challenge when there is no actor', async () => {
    const { http, as } = api()
    as(null)
    const response = await http.list(new Request(BASE))
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'unauthenticated', message: 'Sign in to continue.' },
    })
  })

  it('refuses before reading the body when signed out', async () => {
    const { http, as } = api()
    as(null)
    const request = json('POST', { title: 'Hi' })
    expect((await http.create(request)).status).toBe(401)
    expect(request.bodyUsed).toBe(false)
  })

  it('creates with 201 and exactly the DTO', async () => {
    const { http } = api()
    expect(await read(await http.create(json('POST', { title: '  Groceries ' })))).toEqual({
      status: 201,
      body: {
        ok: true,
        data: {
          id: '00000000-0000-4000-8000-000000000001',
          title: 'Groceries',
          createdAt: 1000,
          updatedAt: 1000,
        },
      },
    })
  })

  it('pages the list with an opaque cursor, newest first', async () => {
    const { http } = api()
    for (const title of ['a', 'b', 'c']) await http.create(json('POST', { title }))
    const first = await read(await http.list(new Request(`${BASE}?limit=2`)))
    expect(first.status).toBe(200)
    expect(first.body.data.items.map((i) => i.title)).toEqual(['c', 'b'])
    const cursor = encodeURIComponent(first.body.data.nextCursor!)
    const second = await read(await http.list(new Request(`${BASE}?limit=2&cursor=${cursor}`)))
    expect(second.body.data).toMatchObject({ items: [{ title: 'a' }], nextCursor: null })
  })

  it('validates the query strictly', async () => {
    const { http } = api()
    for (const query of [
      'limit=abc',
      'limit=0',
      'limit=101',
      'limit=2.5',
      'owner=user_bob',
      'cursor=',
      'cursor=not-ours',
    ])
      expect((await read(await http.list(new Request(`${BASE}?${query}`)))).body, query).toMatchObject({
        ok: false,
        error: { code: 'validation' },
      })
    expect((await http.list(new Request(`${BASE}?limit=abc`))).status).toBe(400)
  })

  it('refuses a body that is not JSON, or has fields the schema does not know', async () => {
    const { http } = api()
    const text = new Request(BASE, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })
    expect(await read(await http.create(text))).toMatchObject({
      status: 400,
      body: { error: { code: 'validation' } },
    })
    expect((await http.create(json('POST', '{"title":'))).status).toBe(400)
    expect((await http.create(json('POST', { title: 'Hi', ownerId: 'user_bob' }))).status).toBe(400)
    expect((await http.create(json('POST', ['Hi']))).status).toBe(400)
  })

  it('renames by the id in the path, and refuses an id in the body', async () => {
    const { http } = api()
    const { data } = await body(await http.create(json('POST', { title: 'Old' })))
    const url = `${BASE}/${data.id}`
    expect(await read(await http.rename(json('PATCH', { title: 'New' }, url), data.id))).toMatchObject({
      status: 200,
      body: { ok: true, data: { id: data.id, title: 'New' } },
    })
    const moved = await read(await http.rename(json('PATCH', { id: 'x', title: 'New' }, url), data.id))
    // The contract's renameNoteBody is strict: an id in the body is an unknown field.
    expect(moved).toMatchObject({ status: 400, body: { ok: false, error: { code: 'validation' } } })
    expect(moved.body.error.fields?._?.[0]).toMatch(/id/)
  })

  it('treats another user’s note as missing: 404, never 403', async () => {
    const { http, as } = api()
    const { data } = await body(await http.create(json('POST', { title: 'Ann’s' })))
    as(bob)
    const url = `${BASE}/${data.id}`
    expect((await http.rename(json('PATCH', { title: 'Mine now' }, url), data.id)).status).toBe(404)
    expect((await http.remove(new Request(url, { method: 'DELETE' }), data.id)).status).toBe(404)
    as(ann)
    expect((await read(await http.list(new Request(BASE)))).body.data.items).toHaveLength(1)
  })

  it('deletes once: 200 with the id, then 404; a malformed id is a 400', async () => {
    const { http } = api()
    const { data } = await body(await http.create(json('POST', { title: 'Bye' })))
    const del = () => http.remove(new Request(`${BASE}/${data.id}`, { method: 'DELETE' }), data.id)
    expect(await read(await del())).toEqual({ status: 200, body: { ok: true, data: { id: data.id } } })
    expect((await del()).status).toBe(404)
    expect((await http.remove(new Request(`${BASE}/nope`, { method: 'DELETE' }), 'nope')).status).toBe(400)
  })

  it('answers a crash with 500 and the safe envelope, never the cause', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = {
      list: () => Promise.reject(new Error('D1_ERROR: no such table')),
    } as unknown as NotesService
    const http = notesHttp(notesController(service), async () => ann)
    expect(await read(await http.list(new Request(BASE)))).toEqual({
      status: 500,
      body: { ok: false, error: { code: 'internal', message: 'Something went wrong. Try again.' } },
    })
    log.mockRestore()
  })
})
