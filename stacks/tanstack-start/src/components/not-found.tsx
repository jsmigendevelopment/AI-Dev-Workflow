import { Link } from '@tanstack/react-router'
import { EmptyState } from '@/components/empty-state'

export function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <EmptyState title="Page not found">
        <Link to="/" className="underline">
          Go home
        </Link>
      </EmptyState>
    </main>
  )
}
