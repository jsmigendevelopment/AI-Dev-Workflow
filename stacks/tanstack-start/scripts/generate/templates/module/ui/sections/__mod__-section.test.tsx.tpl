import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { __plural__Copy as copy } from '@/modules/__mod__/copy'
import { __plural__Queries } from '@/modules/__mod__/hooks/use-__mod__'
import type { __Single__Dto } from '@/modules/__mod__/types'

import { __Plural__Section, __Plural__Skeleton } from './__mod__-section'

// The server functions are the network edge: the section renders from data already in the cache.
vi.mock('@/modules/__mod__/server/__mod__.functions', () => ({
  list__Plural__: vi.fn(),
  create__Single__: vi.fn(),
  delete__Single__: vi.fn(),
}))

const item = (title: string): __Single__Dto => ({ id: `id-${title}`, title, createdAt: 1, updatedAt: 1 })

function render(items: __Single__Dto[]) {
  const client = new QueryClient()
  client.setQueryData(__plural__Queries.list().queryKey, items)
  return renderToString(
    <QueryClientProvider client={client}>
      <__Plural__Section />
    </QueryClientProvider>,
  )
}

describe('__words__ section', () => {
  it('shows each __word__ with its delete button', () => {
    const html = render([item('First'), item('Second')])
    expect(html).toContain('First')
    expect(html).toContain(`aria-label="${copy.delete} Second"`)
    expect(html).not.toContain(copy.emptyTitle)
  })

  it('shows the empty state and the add form when there are none', () => {
    const html = render([])
    expect(html).toContain(copy.emptyTitle)
    expect(html).toContain(copy.newLabel)
  })

  it('has a skeleton in the loaded layout’s shape: title, label, field and three rows', () => {
    const html = renderToString(<__Plural__Skeleton />)
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(6)
    expect(html).toContain(copy.loading)
  })
})
