import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { __Name__ } from './__file__'

describe('__Name__', () => {
  it('shows its title, and its children only when given', () => {
    expect(renderToString(<__Name__ title="Hello" />)).toContain('Hello')
    expect(renderToString(<__Name__ title="Hello">More</__Name__>)).toContain('More')
    expect(renderToString(<__Name__ title="Hello" />)).not.toContain('text-muted-foreground')
  })
})
