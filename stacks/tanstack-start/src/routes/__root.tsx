/// <reference types="vite/client" />
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AuthProvider } from '@/components/auth-provider'
import { SiteHeader } from '@/components/site-header'
import { getAuthConfig } from '@/server/auth.functions'
import styles from '@/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Runs once on the server; the answer is reused on every client navigation.
  loader: () => getAuthConfig(),
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'App' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  const { enabled } = Route.useLoaderData()
  return (
    <AuthProvider enabled={enabled}>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Outlet />
      </main>
    </AuthProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
