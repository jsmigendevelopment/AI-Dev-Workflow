/// <reference types="vite/client" />
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AuthProvider } from '@/components/auth-provider'
import { NotFound } from '@/components/not-found'
import { RouteFocus } from '@/components/route-focus'
import { SiteHeader } from '@/components/site-header'
import { SITE } from '@/lib/site'
import { THEME_SCRIPT } from '@/lib/theme'
import { getPublicConfig } from '@/server/public-config.functions'
import styles from '@/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Runs once on the server; the answer is reused on every client navigation.
  loader: () => getPublicConfig(),
  staleTime: Infinity,
  // Site-wide links only. Every route sets its own title, description and canonical with pageHead().
  head: () => ({
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  const config = Route.useLoaderData()
  return (
    <AuthProvider config={config}>
      <a
        href="#main"
        className="bg-background sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-10">
        <Outlet />
      </main>
      <RouteFocus />
    </AuthProvider>
  )
}

// The inline script runs from the server HTML; the client never re-runs it, so its text ships
// in the server render only (no bytes in the client bundle).
const themeScript = { __html: import.meta.env.SSR ? THEME_SCRIPT : '' }

function RootDocument({ children }: { children: ReactNode }) {
  const nonce = useRouter().options.ssr?.nonce
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Head order: charset, viewport, theme script (before any CSS), then everything else. */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script nonce={nonce} dangerouslySetInnerHTML={themeScript} suppressHydrationWarning />
        {/* Repeated names go here: head() keeps one meta per name. */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content={SITE.themeColor.light} />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={SITE.themeColor.dark} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
