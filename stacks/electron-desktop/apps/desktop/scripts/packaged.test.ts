import { APP_NAME } from '@app/contract/app'
import { describe, expect, it } from 'vitest'

import { PACKAGED_NAME } from './packaged.ts'

describe('the packaged app', () => {
  it('is named after APP_NAME, so the scripts find the folder Forge writes', () => {
    expect(PACKAGED_NAME).toBe(APP_NAME)
  })
})
