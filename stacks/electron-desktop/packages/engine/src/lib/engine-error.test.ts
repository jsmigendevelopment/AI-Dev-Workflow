import { newId } from '@app/contract/ids'
import { describe, expect, it } from 'vitest'

import { EngineError, failureResult } from './engine-error.ts'

describe('failureResult', () => {
  it('WHEN a command that needs data finds the data file unreadable THEN it fails with data_unreadable', () => {
    const id = newId()
    expect(failureResult(id, new EngineError('data_unreadable'))).toMatchObject({
      id,
      ok: false,
      error: { code: 'data_unreadable' },
    })
  })

  it('answers unexpected for any other error', () => {
    expect(failureResult(newId(), new Error('boom'))).toMatchObject({ error: { code: 'unexpected' } })
  })
})
