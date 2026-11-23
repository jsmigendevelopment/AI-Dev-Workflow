import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/app-error'

import { ErrorToast, newReferenceId, showErrorToast } from './error-toast'

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('error toast', () => {
  it('shows the title, the safe message, the reference and both actions', () => {
    const html = renderToString(
      <ErrorToast
        title="Couldn’t delete the note"
        error={new AppError('not_found', 'That note does not exist.')}
        reference="ab12cd34"
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(html).toContain('role="alert"')
    for (const part of [
      'Couldn’t delete the note',
      'That note does not exist.',
      'Reference: ab12cd34',
      'Try again',
      'Dismiss',
    ])
      expect(text(html)).toContain(part)
  })

  it('never shows a raw error message', () => {
    const html = renderToString(
      <ErrorToast
        title="Failed"
        error={new Error('D1_ERROR: secret')}
        reference="x"
        onDismiss={() => undefined}
      />,
    )
    expect(html).not.toContain('D1_ERROR')
    expect(text(html)).toContain('Something went wrong. Try again.')
    expect(html.match(/<button/g)).toHaveLength(1) // Dismiss only: no retry was given
  })

  it('makes short reference ids', () => {
    expect(newReferenceId()).toMatch(/^[0-9a-f]{8}$/)
  })

  it('logs the failure once, with its reference and code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    showErrorToast('Couldn’t rename the note', new AppError('conflict', 'Changed elsewhere.'))
    expect(warn).toHaveBeenCalledTimes(1)
    const line = JSON.parse(String(warn.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(line).toMatchObject({ level: 'warn', event: 'action_failed', code: 'conflict' })
    expect(line.reference).toMatch(/^[0-9a-f]{8}$/)
    warn.mockRestore()
  })
})
