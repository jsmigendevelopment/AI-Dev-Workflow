// A deliberate bad import: lint must report the engine rule here (tests/boundaries.test.ts).
import { app } from 'electron'

export const leaked = app
