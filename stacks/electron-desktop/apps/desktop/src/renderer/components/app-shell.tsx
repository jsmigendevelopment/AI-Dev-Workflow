import { APP_NAME } from '@app/contract/app'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { House, SlidersHorizontal } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Home', icon: House },
  { to: '/preferences', label: 'Preferences', icon: SlidersHorizontal },
] as const

const linkClass =
  'flex min-h-10 items-center gap-3 rounded-r1 px-3 py-2 font-semibold text-muted hover:bg-inset hover:text-action aria-[current=page]:bg-inset aria-[current=page]:text-action'

/** The frame every screen sits in: the app's name and navigation on the left, a top bar, then the page. */
export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const place = NAV.find((item) => item.to === path)?.label ?? APP_NAME
  return (
    <div className="grid min-h-screen grid-cols-[var(--spacing-nav)_minmax(0,1fr)]">
      <a
        href="#main"
        className="fixed top-2 left-2 z-10 -translate-y-[150%] bg-surface px-4 py-2 focus:translate-y-0"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <header className="sticky top-0 flex min-h-screen flex-col gap-6 self-start border-r border-line bg-surface px-4 py-6">
        <Link to="/" className="mb-2 ml-2 text-xl leading-none font-bold tracking-tight">
          {APP_NAME}
        </Link>
        <nav aria-label="Main navigation" className="grid gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={linkClass} activeOptions={{ exact: true }}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex min-w-0 flex-col">
        <div className="flex min-h-16 items-center border-b border-line bg-surface px-8 font-bold">
          {place}
        </div>
        <main id="main" tabIndex={-1} className="flex-1 px-8 pt-8 pb-12 outline-none">
          <div className="mx-auto w-full max-w-page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
