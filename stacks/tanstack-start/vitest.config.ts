import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit and contract tests run in Node. No Start or Cloudflare plugin: they test plain functions.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
