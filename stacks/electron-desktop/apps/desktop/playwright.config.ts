import { defineConfig } from '@playwright/test'

// The specs launch the packaged e2e flavour (scripts/e2e.ts builds it first). One app at a time.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'out-e2e/test-results',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  forbidOnly: true,
})
