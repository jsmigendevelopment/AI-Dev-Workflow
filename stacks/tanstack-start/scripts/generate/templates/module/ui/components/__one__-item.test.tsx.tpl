import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { __Single__CreateForm } from './__one__-create-form'
import { __Single__Item } from './__one__-item'

describe('__word__ components', () => {
  it('the item shows its title and a labelled, disableable delete', () => {
    const item = { id: 'a', title: 'Milk', createdAt: 1, updatedAt: 1 }
    const html = renderToString(<__Single__Item item={item} pending onDelete={() => undefined} />)
    expect(html).toContain('Milk')
    expect(html).toMatch(/<button[^>]*disabled[^>]*aria-label="Delete Milk"|aria-label="Delete Milk"[^>]*disabled/)
  })

  it('the form links its error to the field', () => {
    const html = renderToString(<__Single__CreateForm pending={false} error="Give it a title." onCreate={() => undefined} />)
    expect(html).toContain('aria-invalid="true"')
    expect(html).toMatch(/aria-describedby="([^"]+)"[\s\S]*id="\1"[^>]*>Give it a title\./)
  })
})
