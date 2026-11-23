import type { ApiClient } from '@repo/api-client'

// The module's calls to /api/v1/notes and its cache keys. The contract (paths, schemas, errors)
// lives in @repo/contracts; this file only says how this module uses it.

export const PAGE_SIZE = 20

export const notesKeys = {
  all: ['notes'] as const,
  list: () => [...notesKeys.all, 'list'] as const,
}

export const fetchNotesPage = (api: ApiClient, cursor: string | undefined, signal?: AbortSignal) =>
  api.notes.list({ cursor, limit: PAGE_SIZE }, signal)
