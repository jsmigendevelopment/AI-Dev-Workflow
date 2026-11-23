import type { CreateNoteBody } from '@repo/contracts'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/hooks/use-api'
import { fetchNotesPage, notesKeys } from '../api/notes-api'

export function useNotes() {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: notesKeys.list(),
    queryFn: ({ pageParam, signal }) => fetchNotesPage(api, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export function useCreateNote() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateNoteBody) => api.notes.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKeys.all }),
  })
}

export function useDeleteNote() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.notes.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKeys.all }),
  })
}
