// `pnpm build:win-zip`: cross-builds the Windows x64 zip on Linux, macOS or Windows, then checks it
// holds the .exe and the app's code. Unsigned: fine for testing on your own PC, not for strangers
// (see stacks/electron-desktop/PACK.md, "CI and release"). It uploads nothing.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'

import { PACKAGED_NAME } from '../apps/desktop/scripts/packaged.ts'
import { missingFromZip } from './win-zip.ts'

const ZIP_DIR = 'apps/desktop/out/make/zip/win32/x64'

execFileSync(
  'pnpm',
  [
    '--filter',
    '@app/desktop',
    'exec',
    'electron-forge',
    'make',
    '--platform=win32',
    '--arch=x64',
    '--targets=@electron-forge/maker-zip',
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
const zips = readdirSync(ZIP_DIR).filter((file) => file.endsWith('.zip'))
if (zips.length !== 1) throw new Error(`Expected one zip in ${ZIP_DIR}, found ${zips.length}`)
const zip = path.join(ZIP_DIR, zips[0] ?? '')
const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n')
const missing = missingFromZip(entries, PACKAGED_NAME)
if (missing.length > 0) throw new Error(`${zip} is missing ${missing.join(', ')}`)
process.stdout.write(`Built ${zip}\n`)
