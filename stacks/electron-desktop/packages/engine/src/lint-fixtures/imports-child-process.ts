// A deliberate bad import: only adapters may start programs, so lint must fail here (tests/boundaries.test.ts).
import { spawn } from 'node:child_process'

export const leaked = spawn
