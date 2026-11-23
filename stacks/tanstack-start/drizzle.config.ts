import { defineConfig } from 'drizzle-kit'

// Tables live in each module. drizzle-kit writes SQL that wrangler applies.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/modules/*/server/*.table.ts',
  out: './migrations',
})
