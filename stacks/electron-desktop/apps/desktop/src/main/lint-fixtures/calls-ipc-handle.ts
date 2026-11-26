// A deliberate second handler: lint must fail here, since ipc/register.ts is the only one (tests/boundaries.test.ts).
import { ipcMain } from 'electron'

ipcMain.handle('stray', () => 'answered outside the register')
