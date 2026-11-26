// upsertEnv makes an existing file owner-only before it writes a value into it, not after.
import type * as Fs from 'node:fs'
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

import { upsertEnv } from './store'

/** The file's mode each time upsertEnv writes to it. */
const modes = vi.hoisted(() => [] as number[])
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof Fs>()
  return {
    ...fs,
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      const [path] = args
      if (typeof path === 'string' && fs.existsSync(path)) modes.push(fs.statSync(path).mode & 0o777)
      fs.writeFileSync(...args)
    },
  }
})

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

it.skipIf(process.platform === 'win32')('an existing 0644 file is 0600 before the value is written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'store-mode-'))
  dirs.push(dir)
  const file = join(dir, '.env.local')
  writeFileSync(file, 'KEEP=1\n')
  chmodSync(file, 0o644)
  modes.length = 0
  expect(upsertEnv(file, 'NEW', 'value', process.platform)).toBe(true)
  expect(modes).toEqual([0o600])
  expect(statSync(file).mode & 0o777).toBe(0o600)
})
