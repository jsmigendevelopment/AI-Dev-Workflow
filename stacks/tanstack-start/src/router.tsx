import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { ErrorState } from '@/components/error-state'
import { NotFound } from '@/components/not-found'
import type { AppError } from '@/lib/app-error'
import { routeTree } from './routeTree.gen'

const RETRYABLE = new Set(['unavailable', 'rate_limited', 'internal'])

/** One router and one QueryClient per request on the server, one per tab in the browser. */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error: AppError) => RETRYABLE.has(error.code) && count < 2,
      },
      mutations: { retry: false },
    },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultErrorComponent: () => <ErrorState />,
    defaultNotFoundComponent: () => <NotFound />,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
