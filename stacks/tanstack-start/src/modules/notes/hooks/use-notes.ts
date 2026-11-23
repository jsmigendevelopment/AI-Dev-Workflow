import { infiniteQueryOptions, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { call } from '@/lib/api-call'
import { TURNSTILE_HEADER } from '@/lib/turnstile'

import { createNote, deleteNote, listNotes, renameNote } from '../server/notes.functions'
import type { CreateNoteInput, DeleteNoteInput, RenameNoteInput } from '../types'

/** Key prefixes, for invalidation. Reads go through `notesQueries`, so key and fetcher can't drift. */
export const notesKeys = {
  all: ['notes'] as const,
  lists: () => [...notesKeys.all, 'list'] as const,
}

export const notesQueries = {
  list: (limit = 20) =>
    infiniteQueryOptions({
      queryKey: [...notesKeys.lists(), { limit }] as const,
      queryFn: ({ pageParam, signal }) =>
        call(() => listNotes({ data: { cursor: pageParam, limit }, signal })),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}

export const useNotesList = () => useInfiniteQuery(notesQueries.list())

/** Writes refetch the list when they settle. Simple and always correct. */
function useNotesMutation<I, O>(send: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSettled: () => client.invalidateQueries({ queryKey: notesKeys.lists() }),
  })
}

/** `humanToken` is the Turnstile token from `useTurnstile()`, sent as a header (absent when off). */
export const useCreateNote = () =>
  useNotesMutation(({ humanToken, ...data }: CreateNoteInput & { humanToken?: string | undefined }) =>
    call(() => createNote({ data, headers: humanToken ? { [TURNSTILE_HEADER]: humanToken } : undefined })),
  )
export const useRenameNote = () =>
  useNotesMutation((data: RenameNoteInput) => call(() => renameNote({ data })))
export const useDeleteNote = () =>
  useNotesMutation((data: DeleteNoteInput) => call(() => deleteNote({ data })))
