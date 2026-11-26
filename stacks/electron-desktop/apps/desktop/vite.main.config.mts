import { execFileSync } from 'node:child_process'

import { defineConfig } from 'vite'

import { buildFlavour } from './scripts/flavour.ts'

// The commit goes into the About box. Outside a git checkout it reads "unknown".
function headCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

// https://vitejs.dev/config
export default defineConfig(({ mode }) => ({
  define: {
    BUILD_COMMIT: JSON.stringify(headCommit()),
    BUILD_FLAVOUR: JSON.stringify(buildFlavour(mode, process.env)),
  },
  // node:sqlite is missing from Node's builtinModules list, so Vite would bundle a stub without this.
  build: { rollupOptions: { external: ['node:sqlite'] } },
}))
