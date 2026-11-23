import { Link } from '@tanstack/react-router'
import { AuthControls } from '@/components/auth-controls'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-6 px-4">
        <Link to="/" className="font-semibold">
          App
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link
            to="/notes"
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'text-foreground' }}
          >
            Notes
          </Link>
        </nav>
        <div className="ml-auto flex items-center">
          <AuthControls />
        </div>
      </div>
    </header>
  )
}
