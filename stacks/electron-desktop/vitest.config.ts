import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The renderer's `@/` alias, as in apps/desktop/vite.renderer.config.mts.
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/desktop/src/renderer', import.meta.url)) } },
  test: {
    include: [
      'tests/**/*.test.ts',
      'scripts/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'apps/*/scripts/**/*.test.ts',
    ],
    // The boundary test runs ESLint over the workspace; the first run resolves every tsconfig.
    testTimeout: 30_000,
  },
})
