import type { AuditContext, PreferencesRepository, StoredPreferences } from './preferences.repository.ts'

/** The preferences repository in memory, for tests. `auditRows` holds what the audit table would. */
export function createPreferencesMemoryRepository(): PreferencesRepository & { auditRows: AuditContext[] } {
  let stored: StoredPreferences = {}
  const auditRows: AuditContext[] = []
  return {
    auditRows,
    read: () => Promise.resolve({ ...stored }),
    save(values, audit) {
      stored = { ...stored, ...values }
      auditRows.push({ requestId: audit.requestId })
      return Promise.resolve()
    },
  }
}
