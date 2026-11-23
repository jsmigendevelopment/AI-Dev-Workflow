import type * as z from 'zod'

import type { create__Single__Input, delete__Single__Input } from './schemas'

/** What crosses the wire. No owner id. Times are epoch milliseconds, UTC. */
export interface __Single__Dto {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** Callers' view of the list input (`limit` is optional: the schema defaults it). */
export interface List__Plural__Input {
  limit?: number | undefined
}
export type Create__Single__Input = z.input<typeof create__Single__Input>
export type Delete__Single__Input = z.input<typeof delete__Single__Input>
