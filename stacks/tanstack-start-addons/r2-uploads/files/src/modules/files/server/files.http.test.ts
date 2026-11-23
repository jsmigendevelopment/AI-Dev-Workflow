import { describe, expect, it, vi } from 'vitest'
import { MAX_FILE_BYTES } from '../schemas'
import { filesHttp } from './files.http'
import { memoryFilesRepository } from './files.repository.memory'
import { createFilesService } from './files.service'
import { memoryFileStore } from './files.store.memory'

const id = '00000000-0000-4000-8000-000000000001'
const url = `https://app.example.com/api/files/${id}`
const ann = { userId: 'user_ann' }

async function setup(actor: { userId: string } | null = ann) {
  const service = createFilesService({
    repo: memoryFilesRepository(),
    store: memoryFileStore().store,
    now: () => 1,
  })
  await service.createUpload(ann, { id, name: 'notes "v1".txt', type: 'text/plain', size: 5 })
  return { http: filesHttp(service, async () => actor), service }
}

const put = (headers: Record<string, string>, body: BodyInit | null = 'hello') =>
  new Request(url, { method: 'PUT', body, headers: { 'content-type': 'text/plain', ...headers } })

describe('files upload route', () => {
  it('uploads with a matching Content-Length and type, then streams it back with safe headers', async () => {
    const { http } = await setup()
    const response = await http.put(put({ 'content-length': '5', 'sec-fetch-site': 'same-origin' }), id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, data: { id, status: 'ready' } })
    const download = await http.get(new Request(url), id)
    expect(download.status).toBe(200)
    expect(await download.text()).toBe('hello')
    expect(Object.fromEntries(download.headers)).toMatchObject({
      'content-type': 'text/plain',
      'content-disposition': `attachment; filename*=UTF-8''notes%20%22v1%22.txt`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    })
  })

  it('refuses cross-site requests before anything else', async () => {
    const { http } = await setup()
    expect((await http.put(put({ 'content-length': '5', 'sec-fetch-site': 'cross-site' }), id)).status).toBe(
      403,
    )
    expect((await http.put(put({ 'content-length': '5', origin: 'https://evil.example' }), id)).status).toBe(
      403,
    )
  })

  it('answers 401 signed out and 404 for a bad id, without reading the body', async () => {
    const signedOut = (await setup(null)).http
    const request = put({ 'content-length': '5' })
    expect((await signedOut.put(request, id)).status).toBe(401)
    expect(request.bodyUsed).toBe(false)
    expect((await signedOut.get(new Request(url), id)).status).toBe(401)
    const { http } = await setup()
    expect((await http.put(put({ 'content-length': '5' }), 'not-a-uuid')).status).toBe(404)
  })

  it('needs a Content-Length, and refuses one over the limit before reading', async () => {
    const { http } = await setup()
    const stream = new ReadableStream({ start: (c) => c.close() })
    const chunked = new Request(url, { method: 'PUT', body: stream, duplex: 'half' } as RequestInit)
    expect((await http.put(chunked, id)).status).toBe(411)
    const big = put({ 'content-length': String(MAX_FILE_BYTES + 1) })
    expect((await http.put(big, id)).status).toBe(413)
    expect(big.bodyUsed).toBe(false)
  })

  it('maps a declared/actual mismatch to 400 and another user’s id to 404', async () => {
    const { http } = await setup()
    const wrongType = put({ 'content-length': '5', 'content-type': 'text/html' })
    expect((await http.put(wrongType, id)).status).toBe(400)
    const bob = filesHttp((await setup()).service, async () => ({ userId: 'user_bob' }))
    expect((await bob.put(put({ 'content-length': '5' }), id)).status).toBe(404)
    expect((await bob.get(new Request(url), id)).status).toBe(404)
  })

  it('hides storage errors behind internal', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = { upload: () => Promise.reject(new Error('R2 down: bucket app-files')) }
    const http = filesHttp(service as never, async () => ann)
    const response = await http.put(put({ 'content-length': '5' }), id)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('R2')
    log.mockRestore()
  })
})
