import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { appErrorAdapter } from '@/lib/app-error-adapter'
import { authMiddleware } from '@/server/auth'
import { requestGuards } from '@/server/request-guards'

// Having this file switches off Start's default CSRF check, so it is added back.
const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

// Order matters: the guards answer junk before anything else runs, and wrap every response
// (the CSRF refusal included) with the security headers.
export const startInstance = createStart(() => ({
  requestMiddleware: [requestGuards, csrf, authMiddleware],
  serializationAdapters: [appErrorAdapter],
}))
