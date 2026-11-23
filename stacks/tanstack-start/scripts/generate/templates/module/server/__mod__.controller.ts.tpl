import type { Actor } from '@/lib/actor'
import { respond } from '@/lib/respond'

import { create__Single__Input, delete__Single__Input, list__Plural__Input } from '../schemas'
import type { __Plural__Service } from './__mod__.service'

/** Raw input in, envelope out: validate with the module's schema, call one service method. */
export const __plural__Controller = (service: __Plural__Service) => ({
  list: (actor: Actor, raw: unknown) => respond(list__Plural__Input, raw, (input) => service.list(actor, input)),
  create: (actor: Actor, raw: unknown) => respond(create__Single__Input, raw, (input) => service.create(actor, input)),
  remove: (actor: Actor, raw: unknown) => respond(delete__Single__Input, raw, (input) => service.remove(actor, input)),
})
