import { Link, useNavigate } from '@tanstack/react-router'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NoteSort } from '@/modules/notes/types'

const ORDERS: { sort: NoteSort; label: string }[] = [
  { sort: 'newest', label: 'Newest' },
  { sort: 'oldest', label: 'Oldest' },
]

/**
 * Search and order for the list. The URL is the state: the field is uncontrolled and submitting
 * writes `q` to the search params (page back to 1); the order buttons are typed links (the router marks the current one `aria-current="page"`). Without
 * JavaScript the form is a plain GET to /notes and still works.
 */
export function NotesFilter({ q, sort }: { q: string | undefined; sort: NoteSort }) {
  const id = useId()
  const navigate = useNavigate({ from: '/notes' })
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form
        role="search"
        method="get"
        className="flex min-w-0 flex-1 gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const text = new FormData(event.currentTarget).get('q')
          const next = typeof text === 'string' && text.trim() ? text.trim() : undefined
          void navigate({ search: (prev) => ({ ...prev, q: next, page: 1 }) })
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Search notes
        </label>
        <Input
          id={`${id}-q`}
          name="q"
          type="search"
          defaultValue={q ?? ''}
          key={q ?? ''}
          placeholder="Search titles"
        />
        <input type="hidden" name="sort" value={sort} />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <nav aria-label="Order" className="flex gap-1">
        {ORDERS.map((order) => (
          <Button key={order.sort} asChild size="sm" variant={order.sort === sort ? 'secondary' : 'ghost'}>
            <Link to="/notes" search={(prev) => ({ ...prev, sort: order.sort, page: 1 })}>
              {order.label}
            </Link>
          </Button>
        ))}
      </nav>
    </div>
  )
}
