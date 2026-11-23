import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { __plural__Queries } from '@/modules/__mod__/hooks/use-__mod__'

import { __Name__Section, __Name__Skeleton } from './__file__'

// The server functions are the network edge: the section renders from data already in the cache.
vi.mock('@/modules/__mod__/server/__mod__.functions', () => ({}))

function render(titles: string[]) {
  const client = new QueryClient()
  const items = titles.map((title) => ({ id: title, title, createdAt: 1, updatedAt: 1 }))
  client.setQueryData(__plural__Queries.list().queryKey, items)
  return renderToString(
    <QueryClientProvider client={client}>
      <__Name__Section />
    </QueryClientProvider>,
  )
}

describe('__Title__ section', () => {
  it('shows the content once the data is there', () => {
    expect(render(['First'])).toContain('First')
  })

  it('shows its empty state when there is nothing', () => {
    expect(render([])).toContain('Nothing here yet')
  })

  it('has a skeleton with the content’s rows', () => {
    expect(renderToString(<__Name__Skeleton />).match(/data-slot="skeleton"/g)).toHaveLength(3)
  })
})
