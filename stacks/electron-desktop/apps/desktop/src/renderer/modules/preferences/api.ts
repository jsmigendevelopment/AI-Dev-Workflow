import type { Preferences, PreferencesUpdate } from '@app/contract/preferences'

import { send } from '@/lib/app-api.ts'

/** Reads the preferences from the engine. */
export function getPreferences(): Promise<Preferences> {
  return send('preferences.get')
}

/** Saves any part of the preferences and answers them all as stored. */
export function updatePreferences(change: PreferencesUpdate): Promise<Preferences> {
  return send('preferences.update', change)
}
