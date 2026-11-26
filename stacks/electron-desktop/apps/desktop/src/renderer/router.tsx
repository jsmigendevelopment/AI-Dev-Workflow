import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { AppShell } from '@/components/app-shell.tsx'
import { HomePage } from '@/routes/home-page.tsx'
import { PreferencesPage } from '@/routes/preferences-page.tsx'

// Hash history: the packaged page loads from app:// with no server to answer deep links.
const rootRoute = createRootRoute({ component: AppShell })
const page = <P extends string>(path: P, component: () => React.JSX.Element) =>
  createRoute({ getParentRoute: () => rootRoute, path, component })

/** The screen's router: one route per link in the navigation. */
export const router = createRouter({
  routeTree: rootRoute.addChildren([page('/', HomePage), page('/preferences', PreferencesPage)]),
  history: createHashHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
