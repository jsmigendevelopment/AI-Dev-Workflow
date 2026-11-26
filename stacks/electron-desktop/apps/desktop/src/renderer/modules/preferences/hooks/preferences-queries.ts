import { queryOptions } from '@tanstack/react-query'

import { getPreferences } from '../api.ts'

/** The preferences query keys: one prefix, so a save can refresh every preferences read. */
export const preferencesKeys = {
  all: ['preferences'] as const,
}

/** The one options function per read, so key and fetcher can't drift. */
export const preferencesQueries = {
  get: () => queryOptions({ queryKey: preferencesKeys.all, queryFn: getPreferences }),
}
