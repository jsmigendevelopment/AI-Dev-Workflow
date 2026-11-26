import { describe, expect, it } from 'vitest'

import { PREFERENCE_MESSAGES, preferencesSchema, preferencesUpdateSchema } from './preferences.ts'

const issues = (value: unknown) =>
  preferencesSchema
    .safeParse(value)
    .error?.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))

describe('the preferences schema', () => {
  it('accepts the edges: page size 10 to 100, refresh 5 to 300 seconds', () => {
    for (const value of [
      { pageSize: 10, refreshSeconds: 5 },
      { pageSize: 100, refreshSeconds: 300 },
      { pageSize: 25, refreshSeconds: 30 },
    ]) {
      expect(preferencesSchema.safeParse(value).success, JSON.stringify(value)).toBe(true)
    }
  })

  it('names the field and gives its message for each value it refuses', () => {
    expect(issues({ pageSize: 9, refreshSeconds: 30 })).toEqual([
      { path: 'pageSize', message: PREFERENCE_MESSAGES.pageSize },
    ])
    expect(issues({ pageSize: 25, refreshSeconds: 301 })).toEqual([
      { path: 'refreshSeconds', message: PREFERENCE_MESSAGES.refreshSeconds },
    ])
    expect(issues({ pageSize: 12.5, refreshSeconds: 30 })).toEqual([
      { path: 'pageSize', message: PREFERENCE_MESSAGES.pageSize },
    ])
    expect(issues({ pageSize: Number.NaN, refreshSeconds: 30 })).toEqual([
      { path: 'pageSize', message: PREFERENCE_MESSAGES.pageSize },
    ])
  })

  it('takes an update with any part, but never an unknown key', () => {
    expect(preferencesUpdateSchema.safeParse({}).success).toBe(true)
    expect(preferencesUpdateSchema.safeParse({ pageSize: 50 }).success).toBe(true)
    expect(preferencesUpdateSchema.safeParse({ theme: 'dark' }).success).toBe(false)
  })
})
