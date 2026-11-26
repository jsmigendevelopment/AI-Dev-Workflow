import path from 'node:path'

import { APP_NAME } from '@app/contract/app'

/** The data folder: `APP_DATA_DIR` when set, else a folder named after the app in the user folder. */
export function resolveDataDir(env: Record<string, string | undefined>, home: string): string {
  const fromEnv = env['APP_DATA_DIR']
  return fromEnv ? path.resolve(fromEnv) : path.join(home, APP_NAME)
}

/** The logs folder inside the data folder. */
export function logsDir(dataDir: string): string {
  return path.join(dataDir, 'logs')
}
