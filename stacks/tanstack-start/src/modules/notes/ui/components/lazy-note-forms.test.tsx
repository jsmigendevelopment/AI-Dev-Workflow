import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { LazyNoteCreateForm, LazyNoteRenameForm } from './lazy-note-forms'

// The server functions are the network edge; the forms' code is not loaded in a sync render.
vi.mock('@/modules/notes/server/notes.functions', () => ({}))

const note = { id: 'id-1', title: 'Milk', createdAt: 1, updatedAt: 1 }

describe('lazy note forms', () => {
  it('show a busy skeleton in the add form’s shape while its code loads', () => {
    const html = renderToString(<LazyNoteCreateForm />)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading the note form…')
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(3) // label, field, button
  })

  it('show a busy skeleton in the rename row’s shape while its code loads', () => {
    const html = renderToString(<LazyNoteRenameForm note={note} onDone={() => undefined} />)
    expect(html).toContain('Loading the rename form…')
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(3) // field, Save, Cancel
  })
})
