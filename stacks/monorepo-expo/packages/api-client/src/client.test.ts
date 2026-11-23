import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api-error'
import { createApiClient } from './client'

const note = { id: '0b9a4f8e-8a8e-4c8e-9a6a-0e6f1c1d2e3f', title: 'Milk', createdAt: 1, updatedAt: 1 }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function setup(respond: (url: string, init: RequestInit) => Response | Promise<Response>, token = 'tok') {
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(respond(String(url), init ?? {})),
  )
  const client = createApiClient({
    baseUrl: 'https://app.example.com/',
    getToken: async () => token || null,
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  return { client, fetch }
}

const headerOf = (init: RequestInit | undefined, name: string) =>
  (init?.headers as Record<string, string>)[name]

describe('api client', () => {
  it('lists notes with a bearer token and the paging query', async () => {
    const { client, fetch } = setup(() => json({ ok: true, data: { items: [note], nextCursor: 'c2' } }))
    await expect(client.notes.list({ cursor: 'c1', limit: 5 })).resolves.toEqual({
      items: [note],
      nextCursor: 'c2',
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://app.example.com/api/v1/notes?cursor=c1&limit=5')
    expect(init?.method).toBe('GET')
    expect(headerOf(init, 'Authorization')).toBe('Bearer tok')
    expect(init?.body).toBeUndefined()
  })

  it('creates with a JSON body, renames with PATCH and deletes with DELETE on the id path', async () => {
    const { client, fetch } = setup((_url, init) =>
      init.method === 'DELETE'
        ? json({ ok: true, data: { id: note.id } })
        : json({ ok: true, data: note }, 201),
    )
    await client.notes.create({ title: 'Milk' })
    await client.notes.rename(note.id, { title: 'Oat milk' })
    await expect(client.notes.remove(note.id)).resolves.toEqual({ id: note.id })
    const calls = fetch.mock.calls.map(([url, init]) => [init?.method, url, init?.body])
    expect(calls).toEqual([
      ['POST', 'https://app.example.com/api/v1/notes', '{"title":"Milk"}'],
      ['PATCH', `https://app.example.com/api/v1/notes/${note.id}`, '{"title":"Oat milk"}'],
      ['DELETE', `https://app.example.com/api/v1/notes/${note.id}`, undefined],
    ])
    expect(headerOf(fetch.mock.calls[0]![1], 'Content-Type')).toBe('application/json')
  })

  it('throws the envelope error with its fields and status', async () => {
    const problem = {
      code: 'validation',
      message: 'Some fields need attention.',
      fields: { title: ['Too long'] },
    }
    const { client } = setup(() => json({ ok: false, error: problem }, 400))
    const error = await client.notes.create({ title: 'x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'validation', fields: { title: ['Too long'] }, status: 400 })
  })

  it('fails closed without a token, before touching the network', async () => {
    const { client, fetch } = setup(() => json({ ok: true, data: note }), '')
    await expect(client.notes.list()).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed without a server URL', async () => {
    const client = createApiClient({ baseUrl: undefined, getToken: async () => 'tok' })
    await expect(client.notes.list()).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('maps a network failure to unavailable and lets an abort through', async () => {
    const offline = setup(() => Promise.reject(new TypeError('Network request failed')))
    await expect(offline.client.notes.list()).rejects.toMatchObject({ code: 'unavailable' })
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    const aborted = setup(() => Promise.reject(abort))
    await expect(aborted.client.notes.list()).rejects.toBe(abort)
  })

  it('never trusts a body that is not the envelope', async () => {
    const html = setup(() => new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(html.client.notes.list()).rejects.toMatchObject({ code: 'unavailable', status: 502 })
    const wrongShape = setup(() => json({ items: [] }))
    await expect(wrongShape.client.notes.list()).rejects.toMatchObject({ code: 'internal' })
    const leakyNote = setup(() => json({ ok: true, data: { id: 1 } }))
    await expect(leakyNote.client.notes.create({ title: 'a' })).rejects.toMatchObject({ code: 'internal' })
  })

  it('asks for a fresh token on every call', async () => {
    const getToken = vi.fn(async () => 'tok')
    const client = createApiClient({
      baseUrl: 'https://app.example.com',
      getToken,
      fetch: (async () => json({ ok: true, data: { items: [], nextCursor: null } })) as typeof fetch,
    })
    await client.notes.list()
    await client.notes.list()
    expect(getToken).toHaveBeenCalledTimes(2)
  })
})
