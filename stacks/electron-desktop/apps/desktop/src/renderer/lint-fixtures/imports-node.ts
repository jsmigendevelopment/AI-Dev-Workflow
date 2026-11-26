// A deliberate bad import: lint must report the process rule here (tests/boundaries.test.ts).
import { readFileSync } from 'node:fs'

export const leaked = readFileSync
