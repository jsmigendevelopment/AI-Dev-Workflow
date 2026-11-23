// The hooks components use: the list, and the writes. Kept apart from notes-queries.ts because
// routes import that one in their loaders, which ship in the entry chunk; these (and the toast
// they show) load with the notes pages only.
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { showErrorToast } from '@/components/error-toast'
import { call } from '@/lib/api-call'
import { TURNSTILE_HEADER } from '@/lib/turnstile'

import { createNote, deleteNote, renameNote } from '../server/notes.functions'
import type { CreateNoteInput, DeleteNoteInput, RenameNoteInput } from '../types'
import { type NotesCache, optimisticDelete, optimisticRename } from './notes-cache'
import { notesKeys, type NotesListFilter, notesQueries } from './notes-queries'

export const useNotesList = (filter: NotesListFilter) => useInfiniteQuery(notesQueries.list(filter))

/** An optimistic write: the cache change, and the toast's title if the server says no. */
interface Optimistic<I> {
  apply: (cache: NotesCache, input: I) => Promise<() => void>
  failed: string
}

/**
 * Writes refetch every list and note when they settle. Simple and always correct. An optimistic
 * write shows its change at once, puts the snapshot back if the server refuses, and says so in
 * the error toast (with a reference id and a retry).
 */
function useNotesMutation<I, O>(send: (input: I) => Promise<O>, optimistic?: Optimistic<I>) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: send,
    onMutate: optimistic ? (input) => optimistic.apply(client, input) : undefined,
    onError: (error, input, rollback) => {
      if (!optimistic) return
      rollback?.()
      showErrorToast(optimistic.failed, error, () => mutation.mutate(input))
    },
    onSettled: () => client.invalidateQueries({ queryKey: notesKeys.all }),
  })
  return mutation
}

/** `humanToken` is the Turnstile token from `useTurnstile()`, sent as a header (absent when off). */
export const useCreateNote = () =>
  useNotesMutation(({ humanToken, ...data }: CreateNoteInput & { humanToken?: string | undefined }) =>
    call(() => createNote({ data, headers: humanToken ? { [TURNSTILE_HEADER]: humanToken } : undefined })),
  )
export const useRenameNote = () =>
  useNotesMutation((data: RenameNoteInput) => call(() => renameNote({ data })), {
    apply: optimisticRename,
    failed: 'Couldn’t rename the note',
  })
export const useDeleteNote = () =>
  useNotesMutation((data: DeleteNoteInput) => call(() => deleteNote({ data })), {
    apply: optimisticDelete,
    failed: 'Couldn’t delete the note',
  })
