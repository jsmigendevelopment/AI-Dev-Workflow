import { z } from 'zod'

/** The only keys the `preferences` table may hold. A new key is a migration too. */
export const PREFERENCE_KEYS = ['list.page_size', 'list.refresh_seconds'] as const

/** One of the preference keys. */
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number]

/** The field messages the screen shows and the engine's check uses: one schema, both sides. */
export const PREFERENCE_MESSAGES = {
  pageSize: 'Enter a whole number from 10 to 100.',
  refreshSeconds: 'Enter a whole number of seconds from 5 to 300.',
} as const

const wholeNumber = (min: number, max: number, message: string) =>
  z.int({ error: message }).min(min, { error: message }).max(max, { error: message })

/** The example module's two preferences: how many rows a list shows, and how often it refreshes. */
export const preferencesSchema = z.strictObject({
  pageSize: wholeNumber(10, 100, PREFERENCE_MESSAGES.pageSize),
  refreshSeconds: wholeNumber(5, 300, PREFERENCE_MESSAGES.refreshSeconds),
})

/** The preferences as the screen sees them. */
export type Preferences = z.infer<typeof preferencesSchema>

/** `preferences.update` takes any part of the preferences. */
export const preferencesUpdateSchema = preferencesSchema.partial()

/** What `preferences.update` takes. */
export type PreferencesUpdate = z.infer<typeof preferencesUpdateSchema>

/** What a fresh data folder answers. */
export const DEFAULT_PREFERENCES: Preferences = { pageSize: 25, refreshSeconds: 30 }
