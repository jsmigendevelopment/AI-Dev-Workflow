import type { Health } from '@app/contract/health'
import { describe, expect, it } from 'vitest'

import { aboutText } from './about'

const info = { version: '1.2.3', commit: 'abcdef0123', flavour: 'release' } as const
const health = (isOk: boolean): Health => ({
  ...info,
  engine: 'running',
  data: { isOk, folder: '/data', driver: 'node:sqlite' },
})

describe('the About text', () => {
  it('gives the version, the short commit and the build', () => {
    expect(aboutText(info)).toBe('Version 1.2.3\nCommit abcdef0\nRelease build')
  })

  it('says "Engine: running" when health.get answered, and "Engine: not running" when it did not', () => {
    expect(aboutText(info, health(true))).toContain('Engine: running')
    expect(aboutText(info, null)).toContain('Engine: not running')
  })

  it('says "Data: ok" with the driver\'s name when the data file opened, and unreadable when not', () => {
    expect(aboutText(info, health(true))).toContain('Data: ok (node:sqlite)')
    expect(aboutText(info, health(false))).toContain('Data: unreadable (node:sqlite)')
  })
})
