import path from 'node:path'

import { APP_NAME } from '@app/contract/app'
import { describe, expect, it } from 'vitest'

import { logsDir, resolveDataDir } from './data-dir.ts'

describe('resolveDataDir', () => {
  it('is a folder named after the app in the user folder by default', () => {
    expect(resolveDataDir({}, '/home/me')).toBe(path.join('/home/me', APP_NAME))
  })

  it('follows APP_DATA_DIR when set', () => {
    expect(resolveDataDir({ APP_DATA_DIR: '/tmp/app-test' }, '/home/me')).toBe(path.resolve('/tmp/app-test'))
  })

  it('keeps the logs in logs/ inside it', () => {
    expect(logsDir('/data/app')).toBe(path.join('/data/app', 'logs'))
  })
})
