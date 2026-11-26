import type { Preferences } from '@app/contract/preferences'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { subscribe } from '@/lib/app-api.ts'

import { updatePreferences } from '../api.ts'
import { preferencesKeys, preferencesQueries } from './preferences-queries.ts'

/**
 * The stored preferences, read through TanStack Query. The engine pushes `preferences.changed` after
 * every save, so a second window, or a save from main, shows up here without a refetch.
 */
export function usePreferences() {
  const queryClient = useQueryClient()
  useEffect(
    () => subscribe('preferences.changed', (saved) => queryClient.setQueryData(preferencesKeys.all, saved)),
    [queryClient],
  )
  return useQuery(preferencesQueries.get())
}

/** Saves the preferences; the engine's answer becomes the cached copy. */
export function useSavePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (value: Preferences) => updatePreferences(value),
    onSuccess: (saved) => queryClient.setQueryData(preferencesKeys.all, saved),
  })
}
