import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PageSkeleton } from './page-skeleton'
import { type RefreshableQuery, RefreshStatus } from './refresh-status'

const at = Date.UTC(2026, 10, 23, 14, 5)
const query = (over: Partial<RefreshableQuery>): RefreshableQuery => ({
  isFetching: false,
  isPending: false,
  isRefetchError: false,
  dataUpdatedAt: at,
  refetch: () => undefined,
  ...over,
})
const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('refresh status', () => {
  it('says nothing while the data is fresh and settled', () => {
    expect(text(renderToString(<RefreshStatus query={query({})} />))).toBe('')
  })

  it('shows a small "Updating…" during a background refetch, in a status region', () => {
    const html = renderToString(<RefreshStatus query={query({ isFetching: true })} />)
    expect(html).toContain('role="status"')
    expect(text(html)).toBe('Updating…')
  })

  it('shows nothing extra on the first load or while the next page loads', () => {
    expect(text(renderToString(<RefreshStatus query={query({ isFetching: true, isPending: true })} />))).toBe(
      '',
    )
    expect(
      text(renderToString(<RefreshStatus query={query({ isFetching: true, isFetchingNextPage: true })} />)),
    ).toBe('')
  })

  it('keeps the data and says how old it is when a refetch fails, with a retry', () => {
    const html = renderToString(<RefreshStatus query={query({ isRefetchError: true })} />)
    expect(html).toContain('role="alert"')
    const clock = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(at)
    expect(text(html)).toContain(`Couldn’t refresh. Showing data from ${clock}.`)
    expect(text(html)).toContain('Retry')
  })
})

describe('page skeleton', () => {
  it('is busy, names itself for screen readers and has the page shape: heading, card title, rows', () => {
    const html = renderToString(<PageSkeleton />)
    expect(html).toContain('aria-busy="true"')
    expect(text(html)).toBe('Loading…')
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(5)
  })
})
