import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { ErrorState } from '@/components/error-state'
import { NotFound } from '@/components/not-found'
import type { AppError } from '@/lib/app-error'
import { routeTree } from './routeTree.gen'

// Zod probes for eval support with `Function('')` on its first parse. The CSP forbids eval, so
// the probe would log a CSP violation in every browser. Tell Zod not to try, through the global
// config it reads (`z.config()` would pull all of Zod into the entry chunk).
;((globalThis as { __zod_globalConfig?: { jitless?: boolean } }).__zod_globalConfig ??= {}).jitless = true

// Never retry `rate_limited`: retrying makes it worse.
const RETRYABLE = new Set(['unavailable', 'internal'])

/** The CSP nonce the request guards made for this response (server only; the browser reads a meta). */
function cspNonce(): string | undefined {
  try {
    return (getGlobalStartContext() as { cspNonce?: string } | undefined)?.cspNonce
  } catch {
    return undefined
  }
}

/** One router and one QueryClient per request on the server, one per tab in the browser. */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error: AppError) => RETRYABLE.has(error.code) && count < 2,
        // Keep an error the server already rendered (e.g. "sign in") instead of refetching on
        // hydration: the refetch flashed a loading state and made it the page's LCP (2.2 s).
        retryOnMount: false,
      },
      mutations: { retry: false },
    },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Route code and data start loading on hover or focus, not on page load.
    defaultPreload: 'intent',
    ssr: { nonce: cspNonce() },
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
