import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/app-error'
import { memoryFilesRepository } from './files.repository.memory'
import { createFilesService } from './files.service'
import { memoryFileStore } from './files.store.memory'

const ann = { userId: 'user_ann' }
const bob = { userId: 'user_bob' }
const id = '00000000-0000-4000-8000-000000000001'
const declared = { id, name: 'cat.png', type: 'image/png' as const, size: 5 }
const bytes = (text = 'hello') => new Response(text).body!

function setup() {
  let clock = 1000
  const repo = memoryFilesRepository()
  const { store, objects } = memoryFileStore()
  const service = createFilesService({ repo, store, now: () => clock })
  return { service, repo, objects, tick: (ms: number) => (clock += ms) }
}

const code = (run: Promise<unknown>) =>
  run.then(
    () => 'resolved',
    (e: unknown) => (e instanceof AppError ? e.code : 'threw something else'),
  )

describe('files service: metadata row first, then bytes', () => {
  it('declares a pending upload, streams the bytes, then lists it as ready', async () => {
    const { service, objects } = setup()
    expect(await service.createUpload(ann, declared)).toEqual({ id, uploadUrl: `/api/files/${id}` })
    expect((await service.list(ann, { limit: 10 })).items).toEqual([]) // pending files aren't listed
    const file = await service.upload(ann, id, bytes(), { contentType: 'image/png', size: 5 })
    expect(file).toMatchObject({ id, status: 'ready', name: 'cat.png' })
    expect(objects.has(`user_ann/${id}`)).toBe(true)
    expect((await service.list(ann, { limit: 10 })).items).toEqual([file])
    const { object } = await service.download(ann, id)
    expect(await new Response(object.body).text()).toBe('hello')
  })

  it('a retried declaration gets the same ticket; a different one with the same id is a conflict', async () => {
    const { service } = setup()
    const ticket = await service.createUpload(ann, declared)
    expect(await service.createUpload(ann, declared)).toEqual(ticket)
    expect(await code(service.createUpload(ann, { ...declared, size: 6 }))).toBe('conflict')
    expect(await code(service.createUpload(bob, declared))).toBe('conflict')
  })

  it("hides another user's file: upload, download and delete are not_found", async () => {
    const { service } = setup()
    await service.createUpload(ann, declared)
    expect(await code(service.upload(bob, id, bytes(), { contentType: 'image/png', size: 5 }))).toBe(
      'not_found',
    )
    await service.upload(ann, id, bytes(), { contentType: 'image/png', size: 5 })
    expect(await code(service.download(bob, id))).toBe('not_found')
    expect(await code(service.remove(bob, { id }))).toBe('not_found')
    expect((await service.list(bob, { limit: 10 })).items).toEqual([])
  })

  it('refuses bytes that don’t match the declared type or size', async () => {
    const { service } = setup()
    await service.createUpload(ann, declared)
    expect(await code(service.upload(ann, id, bytes(), { contentType: 'text/html', size: 5 }))).toBe(
      'validation',
    )
    expect(await code(service.upload(ann, id, bytes(), { contentType: 'image/png', size: 4 }))).toBe(
      'validation',
    )
  })

  it('a short stream fails the upload and the row stays pending; a second upload of a ready file is a conflict', async () => {
    const { service } = setup()
    await service.createUpload(ann, declared)
    await expect(
      service.upload(ann, id, bytes('hey'), { contentType: 'image/png', size: 5 }),
    ).rejects.toThrow()
    expect(await code(service.download(ann, id))).toBe('not_found')
    await service.upload(ann, id, bytes(), { contentType: 'image/png', size: 5 })
    expect(await code(service.upload(ann, id, bytes(), { contentType: 'image/png', size: 5 }))).toBe(
      'conflict',
    )
  })

  it('deletes the bytes and the row', async () => {
    const { service, objects } = setup()
    await service.createUpload(ann, declared)
    await service.upload(ann, id, bytes(), { contentType: 'image/png', size: 5 })
    expect(await service.remove(ann, { id })).toEqual({ id })
    expect(objects.size).toBe(0)
    expect(await code(service.download(ann, id))).toBe('not_found')
  })

  it('the sweep removes uploads still pending after an hour, and nothing else', async () => {
    const { service, tick } = setup()
    const done = { ...declared, id: '00000000-0000-4000-8000-000000000002' }
    await service.createUpload(ann, declared)
    await service.createUpload(ann, done)
    await service.upload(ann, done.id, bytes(), { contentType: 'image/png', size: 5 })
    expect(await service.sweep()).toBe(0)
    tick(60 * 60 * 1000 + 1)
    expect(await service.sweep()).toBe(1)
    expect(await code(service.upload(ann, id, bytes(), { contentType: 'image/png', size: 5 }))).toBe(
      'not_found',
    )
    expect((await service.list(ann, { limit: 10 })).items.map((f) => f.id)).toEqual([done.id])
  })
})
