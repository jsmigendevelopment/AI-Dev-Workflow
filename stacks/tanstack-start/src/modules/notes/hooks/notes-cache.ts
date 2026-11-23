import type { InfiniteData, QueryClient } from '@tanstack/react-query'

import type { Page } from '@/lib/page'

import type { NoteDto } from '../types'

/** The part of the QueryClient the optimistic updates use (a real client in the tests too). */
export type NotesCache = Pick<
  QueryClient,
  'cancelQueries' | 'getQueriesData' | 'setQueriesData' | 'setQueryData'
>

type Lists = InfiniteData<Page<NoteDto>, string | undefined>

import { notesKeys } from './notes-queries'

const LISTS = notesKeys.lists()
const DETAILS = notesKeys.details()

/**
 * Applies `change` to every cached list and note, and returns how to put them back. Running
 * fetches are cancelled first, so a refetch that started before the edit can't overwrite it.
 */
async function optimistic(
  cache: NotesCache,
  id: string,
  change: (note: NoteDto) => NoteDto | null,
): Promise<() => void> {
  await cache.cancelQueries({ queryKey: notesKeys.all })
  const lists = cache.getQueriesData<Lists>({ queryKey: LISTS })
  const details = cache.getQueriesData<NoteDto>({ queryKey: [...DETAILS, id] })
  cache.setQueriesData<Lists>({ queryKey: LISTS }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.flatMap((note) => (note.id === id ? (change(note) ?? []) : [note])),
          })),
        }
      : data,
  )
  cache.setQueriesData<NoteDto>({ queryKey: [...DETAILS, id] }, (note) =>
    note ? (change(note) ?? note) : note,
  )
  return () => {
    for (const [key, data] of [...lists, ...details]) cache.setQueryData(key, data)
  }
}

/** A rename shows the new title at once. Worth it: quick, and almost always accepted. */
export const optimisticRename = (cache: NotesCache, input: { id: string; title: string }) =>
  optimistic(cache, input.id, (note) => ({ ...note, title: input.title.trim() }))

/** A delete takes the note out of every list at once. The note's own page waits for the server. */
export const optimisticDelete = (cache: NotesCache, input: { id: string }) =>
  optimistic(cache, input.id, () => null)
