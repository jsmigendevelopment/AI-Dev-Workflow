import { infiniteQueryOptions, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { call } from '@/lib/api-call'
import type { ApiResult } from '@/lib/app-error'
import { createUpload, deleteFile, listFiles } from '../server/files.functions'
import type { DeleteFileInput, FileDto, FileType } from '../types'

export const filesKeys = { all: ['files'] as const, lists: () => [...filesKeys.all, 'list'] as const }

export const filesQueries = {
  list: (limit = 20) =>
    infiniteQueryOptions({
      queryKey: [...filesKeys.lists(), { limit }] as const,
      queryFn: ({ pageParam, signal }) =>
        call(() => listFiles({ data: { cursor: pageParam, limit }, signal })),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
}

export const useFilesList = () => useInfiniteQuery(filesQueries.list())

/** Declare, then stream the bytes to the upload route. Same envelope, same `call()` errors. */
async function upload(file: File): Promise<FileDto> {
  const ticket = await call(() =>
    createUpload({
      data: { id: crypto.randomUUID(), name: file.name, type: file.type as FileType, size: file.size },
    }),
  )
  return call(async () => {
    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'content-type': file.type },
    })
    return (await response.json()) as ApiResult<FileDto>
  })
}

function useFilesMutation<I, O>(send: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSettled: () => client.invalidateQueries({ queryKey: filesKeys.lists() }),
  })
}

export const useUploadFile = () => useFilesMutation(upload)
export const useDeleteFile = () =>
  useFilesMutation((data: DeleteFileInput) => call(() => deleteFile({ data })))
