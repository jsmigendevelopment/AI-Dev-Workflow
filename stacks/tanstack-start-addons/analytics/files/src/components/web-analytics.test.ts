import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BEACON_SRC, WebAnalytics } from './web-analytics'

const html = (token: string | undefined) => renderToStaticMarkup(createElement(WebAnalytics, { token }))
const token = '0123456789abcdef0123456789abcdef'

describe('web analytics beacon', () => {
  it('renders nothing without a token, so no request leaves the browser', () => {
    expect(html(undefined)).toBe('')
    expect(html('')).toBe('')
  })

  it('renders nothing for a token that is not a site token', () => {
    expect(html('"><script>alert(1)</script>')).toBe('')
  })

  it('renders one deferred external script with the token and no inline code', () => {
    const out = html(token)
    expect(out).toBe(
      `<script defer="" src="${BEACON_SRC}" data-cf-beacon="{&quot;token&quot;:&quot;${token}&quot;,&quot;spa&quot;:true}"></script>`,
    )
  })
})
