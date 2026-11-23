import { createServerFn } from '@tanstack/react-start'
import { asActor, withActor } from '@/server/auth'
import { billingApi } from '@/server/composition'
import type { GetBillingInput, OpenPortalInput, StartCheckoutInput } from '../types'

// The route table. No logic here: this file is imported by client code.

export const getBilling = createServerFn({ method: 'GET' })
  .middleware([withActor])
  .validator((data: GetBillingInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => billingApi().status(actor, data)))

export const startCheckout = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: StartCheckoutInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => billingApi().checkout(actor, data)))

export const openPortal = createServerFn({ method: 'POST' })
  .middleware([withActor])
  .validator((data: OpenPortalInput): unknown => data)
  .handler(({ data, context }) => asActor(context.actor, (actor) => billingApi().portal(actor, data)))
