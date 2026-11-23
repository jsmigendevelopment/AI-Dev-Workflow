import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { call } from '@/lib/api-call'

import { getNote, listNotes } from '../server/notes.functions'
import type { NoteSort } from '../types'

// Keys and query options only: route loaders import this file, so it stays small.

/** What the list shows: the URL's filter and order. The page count is not part of the key. */
export interface NotesListFilter {
  q?: string | undefined
  sort: NoteSort
}

/** Key prefixes, for invalidation. Reads go through `notesQueries`, so key and fetcher can't drift. */
export const notesKeys = {
  all: ['notes'] as const,
  lists: () => [...notesKeys.all, 'list'] as const,
  details: () => [...notesKeys.all, 'detail'] as const,
}

export const notesQueries = {
  list: ({ q, sort }: NotesListFilter = { sort: 'newest' }, limit = 20) =>
    infiniteQueryOptions({
      queryKey: [...notesKeys.lists(), { q, sort, limit }] as const,
      queryFn: ({ pageParam, signal }) =>
        call(() => listNotes({ data: { cursor: pageParam, limit, q, sort }, signal })),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: [...notesKeys.details(), id] as const,
      queryFn: ({ signal }) => call(() => getNote({ data: { id }, signal })),
    }),
  /** The "More notes" aside on a note's page: the newest few, streamed after the note itself. */
  recent: () => notesQueries.list({ sort: 'newest' }, 5),
}
