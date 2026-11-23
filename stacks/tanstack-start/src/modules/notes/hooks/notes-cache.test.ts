import { type InfiniteData, QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import type { Page } from '@/lib/page'

import type { NoteDto } from '../types'
import { optimisticDelete, optimisticRename } from './notes-cache'

// The server functions are the network edge: these tests only touch the cache.
vi.mock('@/modules/notes/server/notes.functions', () => ({ getNote: vi.fn(), listNotes: vi.fn() }))

const note = (n: number): NoteDto => ({ id: `id-${n}`, title: `Note ${n}`, createdAt: n, updatedAt: n })
const listKey = ['notes', 'list', { sort: 'newest', limit: 20 }]
const otherListKey = ['notes', 'list', { q: 'note', sort: 'oldest', limit: 20 }]
const detailKey = ['notes', 'detail', 'id-2']

function seeded() {
  const client = new QueryClient()
  const pages = (items: NoteDto[]): InfiniteData<Page<NoteDto>> => ({
    pages: [{ items, nextCursor: null }],
    pageParams: [undefined],
  })
  client.setQueryData(listKey, pages([note(3), note(2), note(1)]))
  client.setQueryData(otherListKey, pages([note(1), note(2)]))
  client.setQueryData(detailKey, note(2))
  return client
}

const titles = (client: QueryClient, key: unknown[]) =>
  client.getQueryData<InfiniteData<Page<NoteDto>>>(key)?.pages.flatMap((p) => p.items.map((n) => n.title))

describe('optimistic note writes', () => {
  it('a rename shows the new title in every list and on the note, and the rollback restores them', async () => {
    const client = seeded()
    const rollback = await optimisticRename(client, { id: 'id-2', title: '  Renamed  ' })
    expect(titles(client, listKey)).toEqual(['Note 3', 'Renamed', 'Note 1'])
    expect(titles(client, otherListKey)).toEqual(['Note 1', 'Renamed'])
    expect(client.getQueryData<NoteDto>(detailKey)?.title).toBe('Renamed')

    rollback()
    expect(titles(client, listKey)).toEqual(['Note 3', 'Note 2', 'Note 1'])
    expect(titles(client, otherListKey)).toEqual(['Note 1', 'Note 2'])
    expect(client.getQueryData<NoteDto>(detailKey)?.title).toBe('Note 2')
  })

  it('a delete takes the note out of every list, and the rollback puts it back in place', async () => {
    const client = seeded()
    const rollback = await optimisticDelete(client, { id: 'id-2' })
    expect(titles(client, listKey)).toEqual(['Note 3', 'Note 1'])
    expect(titles(client, otherListKey)).toEqual(['Note 1'])
    rollback()
    expect(titles(client, listKey)).toEqual(['Note 3', 'Note 2', 'Note 1'])
  })

  it('cancels a refetch that is running, so it cannot overwrite the optimistic change', async () => {
    const client = seeded()
    let aborted = false
    void client
      .fetchQuery({
        queryKey: listKey,
        queryFn: ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true
              reject(new Error('aborted'))
            })
          }),
      })
      .catch(() => undefined)
    await optimisticDelete(client, { id: 'id-2' })
    expect(aborted).toBe(true)
    expect(titles(client, listKey)).toEqual(['Note 3', 'Note 1'])
  })
})
