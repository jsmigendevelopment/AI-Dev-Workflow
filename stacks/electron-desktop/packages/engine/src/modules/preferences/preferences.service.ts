import type { Preferences, PreferencesUpdate } from '@app/contract/preferences'
import { DEFAULT_PREFERENCES, preferencesSchema } from '@app/contract/preferences'

import type { AuditContext, PreferencesRepository, StoredPreferences } from './preferences.repository.ts'

/** Answers `preferences.get` and `preferences.update`. */
export interface PreferencesService {
  get(): Promise<Preferences>
  update(change: PreferencesUpdate, audit: AuditContext): Promise<Preferences>
}

// A stored value that no longer passes the check (an older rule, a hand-edited file) is not trusted:
// that field goes back to its default.
function toPreferences(stored: StoredPreferences): Preferences {
  const pick = <K extends keyof Preferences>(key: K, raw: unknown): Preferences[K] => {
    const parsed = preferencesSchema.shape[key].safeParse(raw)
    return parsed.success ? (parsed.data as Preferences[K]) : DEFAULT_PREFERENCES[key]
  }
  return {
    pageSize: pick('pageSize', stored['list.page_size']),
    refreshSeconds: pick('refreshSeconds', stored['list.refresh_seconds']),
  }
}

/** The preferences service. The payload is already checked against the contract when it gets here. */
export function createPreferencesService({
  repository,
}: {
  repository: PreferencesRepository
}): PreferencesService {
  const get = async () => toPreferences(await repository.read())
  return {
    get,
    async update(change, audit) {
      const values: StoredPreferences = {
        ...(change.pageSize === undefined ? {} : { 'list.page_size': change.pageSize }),
        ...(change.refreshSeconds === undefined ? {} : { 'list.refresh_seconds': change.refreshSeconds }),
      }
      if (Object.keys(values).length > 0) await repository.save(values, audit)
      return get()
    },
  }
}
