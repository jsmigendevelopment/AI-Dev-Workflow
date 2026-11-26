// A deliberate bad import: lint must report the process rule here (tests/boundaries.test.ts).
import { ipcRenderer } from 'electron'

export const leaked = ipcRenderer
