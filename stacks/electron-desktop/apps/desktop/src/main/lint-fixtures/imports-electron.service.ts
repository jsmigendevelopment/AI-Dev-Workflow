// A deliberate bad import: lint must report the layer rule here (tests/boundaries.test.ts).
import { app } from 'electron'

export const leaked = app
