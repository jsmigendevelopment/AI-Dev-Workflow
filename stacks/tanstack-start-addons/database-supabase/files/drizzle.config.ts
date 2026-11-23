import { defineConfig } from 'drizzle-kit'

// Tables live in each module. drizzle-kit writes the SQL and applies it to DATABASE_URL
// (a direct or session-pooler connection string; never committed, read from the shell).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/server/*.table.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
