import { createCsrfMiddleware, createStart } from '@tanstack/react-start'
import { authMiddleware } from '@/server/auth'

// Having this file switches off Start's default CSRF check, so it is added back first.
const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf, authMiddleware],
}))
