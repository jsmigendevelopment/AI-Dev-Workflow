import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CommandError } from '@/lib/app-api.ts'

import { PREFERENCES_COPY } from '../copy.ts'
import { preferencesQueries } from '../hooks/preferences-queries.ts'
import { PreferencesSection } from './preferences-section.tsx'
import { SaveMessages } from './save-messages.tsx'

const render = (client: QueryClient) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PreferencesSection)))

describe('PreferencesSection', () => {
  it('WHEN Preferences loads THEN the loading card shows, then the form with the stored values', () => {
    const client = new QueryClient()
    const loading = render(client)
    expect(loading).toContain('role="status"')
    expect(loading).toContain(PREFERENCES_COPY.loading)
    expect(loading).not.toContain(PREFERENCES_COPY.save)

    client.setQueryData(preferencesQueries.get().queryKey, { pageSize: 40, refreshSeconds: 12 })
    const loaded = render(client)
    expect(loaded).not.toContain(PREFERENCES_COPY.loading)
    expect(loaded).toMatch(/id="field-pageSize"[^>]*value="40"/)
    expect(loaded).toMatch(/id="field-refreshSeconds"[^>]*value="12"/)
    expect(loaded).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${PREFERENCES_COPY.save}</button>`))
  })

  it('WHEN a save is refused THEN the alert line gives the message and reference ID; WHEN it is stored THEN "Preferences saved." shows', () => {
    const refusal = new CommandError('validation_failed', 'The page size is out of range.', 'REF-e5f6a7')
    const refused = renderToStaticMarkup(createElement(SaveMessages, { error: refusal, isSuccess: false }))
    expect(refused).toMatch(/role="alert"[^>]*>[^<]*The page size is out of range\./)
    expect(refused).toContain(PREFERENCES_COPY.saveFailed)
    expect(refused).toContain('REF-e5f6a7')
    expect(refused).not.toContain(PREFERENCES_COPY.saved)

    const saved = renderToStaticMarkup(createElement(SaveMessages, { error: null, isSuccess: true }))
    expect(saved).toMatch(new RegExp(`role="status"[^>]*>${PREFERENCES_COPY.saved}<`))
  })

  it('WHEN the preferences read fails THEN ErrorState shows the message, Try again and a reference ID', async () => {
    // retryOnMount off: a fresh render would otherwise refetch the failed query and show the loading card.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
    const failure = new CommandError('data_unreadable', 'The app could not read its data file.', 'REF-b2c3d4')
    await client
      .prefetchQuery({ ...preferencesQueries.get(), queryFn: () => Promise.reject(failure) })
      .catch(() => undefined)
    const html = render(client)
    expect(html).toContain('role="alert"')
    expect(html).toContain(PREFERENCES_COPY.loadFailedTitle)
    expect(html).toContain('The app could not read its data file.')
    expect(html).toMatch(new RegExp(`<button[^>]*>${PREFERENCES_COPY.tryAgain}</button>`))
    expect(html).toContain('REF-b2c3d4')
  })
})
