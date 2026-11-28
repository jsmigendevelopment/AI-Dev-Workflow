# database-supabase

Swap D1 (SQLite) for Supabase Postgres, reached from the Worker through Cloudflare Hyperdrive with the `pg` driver. The repository port stays the same, so services, controllers and even the notes Drizzle adapter don't change. Migrations become Postgres SQL, applied with drizzle-kit.

| | |
|---|---|
| **Choose it when** | you need Postgres: more than D1's 10 GB per database, many writers, extensions such as `pgvector` or PostGIS, or a team that already lives in Supabase. Decide **before launch**: after it, this is a data migration. |
| **Alternatives** | stay on D1 (the default; simplest, free, SQLite); Neon or another managed Postgres behind the same Hyperdrive setup; Turso for SQLite past D1's limits |
| **Env vars** | `DATABASE_URL` (secret; only in your shell when running `pnpm db:migrate`, never in the Worker). Bindings: `HYPERDRIVE` |
| **Packages** | `pg@8.23.1`; dev: `@types/pg@8.23.1`, `@electric-sql/pglite@0.5.16` (in-process Postgres for the contract tests) |
| **With a Go backend** | TypeScript backend only: it swaps the web pack's D1 database for Postgres through Hyperdrive. On a Go backend, the database is the Go service's own (the kit's Go conventions use Postgres through pgx); no Go add-on exists yet: file one when an app needs it |
| **Issue** | `Skills: build, research` · lane `risky` (schema and data, a new data processor, production settings). Below Full, ask the person before you delete D1 migrations that have run anywhere but a laptop. On Full, keep them and put it in the FYI. |
| **Vendor setup** | the `supabase` CLI (`supabase start` for local Postgres) and Supabase's agent tools, the kit's way: `.agents/skills/secrets/setup/supabase.md`. Keys and Hyperdrive: `.agents/skills/secrets/providers/supabase.md` |

## What it adds or replaces

This add-on **replaces four pack files**: `files/` holds `src/db/client.ts`, `src/modules/notes/server/notes.table.ts`, `src/modules/notes/server/notes.repository.test.ts` and `drizzle.config.ts`. Copy them with `--force`.

- `src/db/client.ts`: `Db` becomes `PgDatabase<PgQueryResultHKT>` (any Drizzle Postgres database: node-postgres in the Worker, PGlite in tests). `createDb(hyperdrive)` builds a small, per-request `pg` pool on `hyperdrive.connectionString`. Hyperdrive holds the real pool near the database.
- `notes.table.ts`: `pgTable`, `bigint(..., { mode: 'number' })` for epoch-ms times (Postgres `integer` overflows in 2038), the same index, and `.enableRLS()`. Supabase exposes the `public` schema through its Data API; RLS with no policies denies the `anon` and `authenticated` roles. The Worker connects as the database owner and isn't affected.
- `notes.repository.test.ts`: the same contract suite, plus a check that times past 2^31 stay exact, run against memory **and Postgres** (PGlite with the real migration files) instead of local D1.
- `drizzle.config.ts`: `dialect: 'postgresql'`, credentials from `DATABASE_URL`.

`notes.repository.drizzle.ts`, the service, the controller and their tests are unchanged.

Hyperdrive with `pg` (node-postgres) is Cloudflare's current guidance for Postgres from Workers. It needs `nodejs_compat`, which the pack already sets. With no database configured, the app still builds and tests pass. At runtime, every notes call is refused for lack of sign-in before it reaches the database, and with sign-in on, a missing database gives an `internal` error, not a leak.

## Apply

Apply this **before** the `jobs`, `stripe` or `r2-uploads` add-ons, or port their tables too (see the end).

1. Copy `files/` into the project root, overwriting the four pack files. The CLI does this step: `npx onrails add tanstack-start/database-supabase --force`.
2. Install:
   ```sh
   pnpm add pg@8.23.1
   pnpm add -D @types/pg@8.23.1 @electric-sql/pglite@0.5.16
   ```
3. `wrangler.jsonc`: replace the whole `d1_databases` block with:
   ```jsonc
   // Postgres through Hyperdrive (connection pooling and caching near the database).
   // `pnpm exec wrangler hyperdrive create app-db --connection-string="<Supabase session pooler URL>"`
   // prints the id. localConnectionString is for `pnpm dev` only (here: `supabase start`'s database).
   "hyperdrive": [
     {
       "binding": "HYPERDRIVE",
       "id": "00000000000000000000000000000000",
       "localConnectionString": "postgres://postgres:postgres@127.0.0.1:54322/postgres",
     },
   ],
   ```
   Do the same in `env.test` and `env.production` (bindings are not inherited), each with its own Hyperdrive id and no `localConnectionString`; delete their `d1_databases` blocks too. setup-cloudflare then has no D1 database to create: it reads only `d1_databases`.
4. `src/server/composition.ts`: `createDb(env.DB)` becomes `createDb(env.HYPERDRIVE)` (in every factory).
5. `package.json` scripts: migrations now go through drizzle-kit.
   ```json
   "db:migrate:local": "drizzle-kit migrate",
   "db:migrate": "drizzle-kit migrate",
   ```
6. Replace the D1 migrations. **Only if no D1 migration has run outside a laptop**; otherwise stop and ask the person, because moving real data is their call:
   ```sh
   rm -rf migrations && pnpm db:generate --name init
   ```
   Read the SQL: `CREATE TABLE "notes"` with `bigint` times, `ENABLE ROW LEVEL SECURITY`, and the index.
7. `.env.example`: add the name, with no value.
   ```sh
   # Postgres for drizzle-kit (pnpm db:migrate). Local: postgres://postgres:postgres@127.0.0.1:54322/postgres
   # (supabase start). Remote: the Supabase session pooler URL, set in your shell only when migrating.
   DATABASE_URL=
   ```
8. Update the "Set up D1" section of `README.md` and the "D1 adapter" comments in `src/modules/notes/server/notes.repository.drizzle.ts` and `src/modules/notes/server/notes.repository.memory.ts`. `pnpm check:merge`'s "migrations match the tables" check keeps working (`drizzle-kit generate` needs no database).
9. Sort the imports this add-on added and format its files, and only its files. Make the Worker's types first: `worker-configuration.d.ts` is git-ignored, so a fresh copy has none until a lint or typecheck runs, and without it the typed rules' fixes misread the code (they drop type assertions that are needed, and typecheck fails). Step 3's Hyperdrive binding is in the types it makes.
   ```sh
   pnpm cf-typegen &&
   pnpm exec eslint --fix drizzle.config.ts src/db/client.ts src/modules/notes/server/notes.table.ts src/modules/notes/server/notes.repository.test.ts src/modules/notes/server/notes.repository.drizzle.ts src/modules/notes/server/notes.repository.memory.ts src/server/composition.ts &&
   pnpm exec prettier --write drizzle.config.ts src/db/client.ts src/modules/notes/server/notes.table.ts src/modules/notes/server/notes.repository.test.ts src/modules/notes/server/notes.repository.drizzle.ts src/modules/notes/server/notes.repository.memory.ts src/server/composition.ts wrangler.jsonc package.json README.md
   ```
   The `&&` stops the step if the types can't be made. Never `eslint --fix .` here: a whole-project fix can rewrite files this add-on never touched.
10. `pnpm check`.
10. The person: creates the Supabase project (free tier), copies the **Session pooler** connection string (port 5432, not the transaction pooler on 6543: Hyperdrive does its own pooling), runs `pnpm exec wrangler hyperdrive create app-db --connection-string="..."` and pastes the id into `wrangler.jsonc`, then migrates once with `DATABASE_URL="..." pnpm db:migrate`. Test and production are separate Supabase projects and separate Hyperdrive configs.

Local dev: `supabase start` (Docker) serves Postgres on `127.0.0.1:54322`, which matches `localConnectionString`. Then `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres pnpm db:migrate:local` and `pnpm dev`.

### With other add-ons that add tables

`jobs`, `stripe` and `r2-uploads` ship D1 tables and D1 contract tests. drizzle-kit generates one dialect, so after this swap, port each module:

- `*.table.ts`: `sqliteTable` → `pgTable`; `integer` epoch-ms columns → `bigint(..., { mode: 'number' })`; `text(..., { enum })` stays; add `.enableRLS()`.
- `*.repository.test.ts`: replace the `getPlatformProxy` block with the PGlite block from `notes.repository.test.ts`.
- The Drizzle adapters need no change: `onConflictDoNothing`, `onConflictDoUpdate({ setWhere })`, `returning()` and row-value comparisons work the same on Postgres.

## Verify

- `pnpm test`: the notes contract runs against memory and Postgres (PGlite), 5 tests each.
- `pnpm db:generate` writes nothing new (the migration matches the table).
- Locally against real Postgres: `supabase start`, migrate, `pnpm dev`, sign in, create and rename a note on `/notes`. In Supabase Studio, the `notes` table shows "RLS enabled".

Checked for this add-on, locally, with no network: `pnpm check` passed (22 tests). PGlite served over the Postgres wire protocol on `127.0.0.1:54322` (standing in for `supabase start`): `pnpm db:migrate` applied the migration through drizzle-kit's `pg` driver. A scratch-only route on the built Worker (`pnpm preview`) then went through `createDb(env.HYPERDRIVE)` and the unchanged notes adapter: insert, an owner-scoped rename (another owner got `null`), list, and `createdAt` 1,800,000,000,123 round-tripped exactly.

## Not verified here

A real Supabase project and a deployed Hyperdrive config (no network to Supabase or Cloudflare), Supabase's poolers, and query latency through Hyperdrive.
