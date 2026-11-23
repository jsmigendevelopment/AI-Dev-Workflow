import type { Actor } from '@/lib/actor'
import { AppError } from '@/lib/app-error'
import { decodeCursor, encodeCursor, type Page } from '@/lib/page'

import type { NoteDto } from '../types'
import type { NoteRow, NotesRepository } from './notes.repository'

export interface NotesDeps {
  repo: NotesRepository
  now: () => number
  newId: () => string
}

/** Explicit fields: a new column (owner id, a secret) never ships by accident. */
const toDto = (row: NoteRow): NoteDto => ({
  id: row.id,
  title: row.title,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// Someone else's note is "not found", never "forbidden": ids don't leak existence.
const missing = () => new AppError('not_found', 'That note does not exist.')

interface ListInput {
  cursor?: string | undefined
  limit: number
  q?: string | undefined
  sort?: 'newest' | 'oldest' | undefined
}

/** Business rules only. Inputs are already validated. No HTTP, no env, no SQL. */
export function createNotesService({ repo, now, newId }: NotesDeps) {
  return {
    /** Newest first unless `sort` says oldest; `q` keeps notes whose title contains it. */
    async list(actor: Actor, input: ListInput): Promise<Page<NoteDto>> {
      const after = decodeCursor(input.cursor)
      if (after === undefined)
        throw new AppError('validation', 'That page link is not valid.', { cursor: ['Not a valid cursor.'] })
      // One extra row tells us whether there is a next page.
      const rows = await repo.listByOwner(actor.userId, {
        after,
        limit: input.limit + 1,
        q: input.q || undefined,
        order: input.sort,
      })
      const items = rows.slice(0, input.limit)
      const last = items.at(-1)
      return {
        items: items.map(toDto),
        nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null,
      }
    },

    async get(actor: Actor, input: { id: string }): Promise<NoteDto> {
      const row = await repo.findByOwner(actor.userId, input.id)
      if (!row) throw missing()
      return toDto(row)
    },

    async create(actor: Actor, input: { title: string }): Promise<NoteDto> {
      const at = now()
      const row: NoteRow = {
        id: newId(),
        ownerId: actor.userId,
        title: input.title,
        createdAt: at,
        updatedAt: at,
      }
      await repo.insert(row)
      return toDto(row)
    },

    async rename(actor: Actor, input: { id: string; title: string }): Promise<NoteDto> {
      const row = await repo.rename(actor.userId, input.id, input.title, now())
      if (!row) throw missing()
      return toDto(row)
    },

    async remove(actor: Actor, input: { id: string }): Promise<{ id: string }> {
      if (!(await repo.delete(actor.userId, input.id))) throw missing()
      return { id: input.id }
    },
  }
}

export type NotesService = ReturnType<typeof createNotesService>
