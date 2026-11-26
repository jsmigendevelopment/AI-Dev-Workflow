import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ErrorState } from './error-state.tsx'

describe('ErrorState', () => {
  it('WHEN ErrorState renders THEN it shows an icon, a title, a message, a next action and the reference ID', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorState, {
        title: 'Items couldn’t load',
        message: 'The item list could not be read.',
        action: createElement('button', { type: 'button' }, 'Try again'),
        referenceId: 'REF-01a2b3',
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
    expect(html).toContain('<h2')
    expect(html).toContain('Items couldn’t load')
    expect(html).toContain('The item list could not be read.')
    expect(html).toContain('>Try again</button>')
    expect(html).toContain('Reference REF-01a2b3')
  })
})
