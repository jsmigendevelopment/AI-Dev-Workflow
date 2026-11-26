import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Skeleton } from './skeleton.tsx'

describe('Skeleton', () => {
  it('is hidden from screen readers and keeps the size it is given', () => {
    const html = renderToStaticMarkup(createElement(Skeleton, { className: 'w-3/5' }))
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('w-3/5')
  })
})
