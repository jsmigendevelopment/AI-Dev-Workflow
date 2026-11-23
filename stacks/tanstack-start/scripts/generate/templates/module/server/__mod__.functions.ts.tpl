import { createServerFn } from '@tanstack/react-start'

import { asActor, withActor } from '@/server/auth'
import { __plural__Api } from '@/server/composition'

import type { Create__Single__Input, Delete__Single__Input, List__Plural__Input } from '../types'

// The route table: method, auth middleware, a typed pass-through validator, one controller call.
// The controller does the real parsing. No logic here: client code imports this file.

export const list__Plural__ = createServerFn({ method: 'GET' })
  .middleware([withActor])
  .validator((data: List__Plural__Input): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => __plural__Api().list(actor, data)))

export const create__Single__ = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: Create__Single__Input): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => __plural__Api().create(actor, data)))

export const delete__Single__ = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: Delete__Single__Input): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => __plural__Api().remove(actor, data)))
