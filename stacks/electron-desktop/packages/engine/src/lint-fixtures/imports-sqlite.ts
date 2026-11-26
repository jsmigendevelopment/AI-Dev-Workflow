// A deliberate bad import: lint must report the SQLite rule here (tests/boundaries.test.ts).
import { DatabaseSync } from 'node:sqlite'

export const leaked = DatabaseSync
