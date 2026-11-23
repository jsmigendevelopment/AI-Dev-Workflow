import { Link } from '@tanstack/react-router'

import { EmptyState } from '@/components/empty-state'
import { SITE } from '@/lib/site'

/**
 * The 404 page. The server answers it with status 404. React 19 hoists the title and robots meta
 * into <head>; `reloadDocument` loads the home page fresh rather than navigating in place.
 */
export function NotFound() {
  return (
    <section className="flex flex-col gap-4">
      <title>{`Page not found · ${SITE.name}`}</title>
      <meta name="robots" content="noindex" />
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <EmptyState title="There is nothing at this address.">
        <Link to="/" reloadDocument className="underline underline-offset-4">
          Go to the home page
        </Link>
      </EmptyState>
    </section>
  )
}
