import { defineConfig } from 'drizzle-kit'

// `pnpm db:generate` writes the next forward-only migration from src/db/schema.ts.
// List it in src/db/migrations.ts; the engine runs it at start.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
})
