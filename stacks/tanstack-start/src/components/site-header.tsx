import { Link } from '@tanstack/react-router'

import { AuthControls } from '@/components/auth-controls'
import { ThemeToggle } from '@/components/theme-toggle'
import { SITE } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex min-h-14 max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link to="/" className="font-semibold">
          {SITE.name}
        </Link>
        <nav aria-label="Main" className="flex gap-4 text-sm">
          <Link
            to="/notes"
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'text-foreground', 'aria-current': 'page' }}
          >
            Notes
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <AuthControls />
        </div>
      </div>
    </header>
  )
}
