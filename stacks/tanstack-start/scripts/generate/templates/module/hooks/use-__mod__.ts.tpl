import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { call } from '@/lib/api-call'

import { create__Single__, delete__Single__, list__Plural__ } from '../server/__mod__.functions'
import type { Create__Single__Input, Delete__Single__Input } from '../types'

/** Keys and fetchers in one place: a section and a route loader can't ask for different data. */
export const __plural__Queries = {
  all: ['__mod__'] as const,
  list: () =>
    queryOptions({
      queryKey: [...__plural__Queries.all, 'list'] as const,
      queryFn: ({ signal }) => call(() => list__Plural__({ data: {}, signal })),
    }),
}

/** For a section's content: suspends until the list is there (the section shows its skeleton). */
export const use__Plural__List = () => useSuspenseQuery(__plural__Queries.list())

/** Writes refetch the module's queries when they settle. Simple and always correct. */
function use__Plural__Mutation<I, O>(send: (input: I) => Promise<O>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSettled: () => client.invalidateQueries({ queryKey: __plural__Queries.all }),
  })
}

export const useCreate__Single__ = () =>
  use__Plural__Mutation((data: Create__Single__Input) => call(() => create__Single__({ data })))
export const useDelete__Single__ = () =>
  use__Plural__Mutation((data: Delete__Single__Input) => call(() => delete__Single__({ data })))
