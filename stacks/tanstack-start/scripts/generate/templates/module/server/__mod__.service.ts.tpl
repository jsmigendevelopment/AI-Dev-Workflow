import type { Actor } from '@/lib/actor'
import { AppError } from '@/lib/app-error'

import type { __Single__Dto } from '../types'
import type { __Plural__Repository, __Single__Row } from './__mod__.repository'

export interface __Plural__Deps {
  repo: __Plural__Repository
  now: () => number
  newId: () => string
}

/** Explicit fields: a new column never ships to the client by accident. */
const toDto = (row: __Single__Row): __Single__Dto => ({
  id: row.id,
  title: row.title,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/** Business rules only. Inputs are already validated. No HTTP, no env, no SQL. */
export function create__Plural__Service({ repo, now, newId }: __Plural__Deps) {
  return {
    async list(actor: Actor, input: { limit: number }): Promise<__Single__Dto[]> {
      return (await repo.listByOwner(actor.userId, input.limit)).map(toDto)
    },

    async create(actor: Actor, input: { title: string }): Promise<__Single__Dto> {
      const at = now()
      const row: __Single__Row = { id: newId(), ownerId: actor.userId, title: input.title, createdAt: at, updatedAt: at }
      await repo.insert(row)
      return toDto(row)
    },

    // Someone else's __word__ is "not found", never "forbidden": ids don't leak existence.
    async remove(actor: Actor, input: { id: string }): Promise<{ id: string }> {
      if (!(await repo.delete(actor.userId, input.id))) throw new AppError('not_found', 'That __word__ does not exist.')
      return { id: input.id }
    },
  }
}

export type __Plural__Service = ReturnType<typeof create__Plural__Service>
