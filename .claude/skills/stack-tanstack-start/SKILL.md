---
name: stack-tanstack-start
description: Use when slice 0 sets up a TanStack Start app from the stack pack, or when building in an app made from it - applying the starter with degit, renaming or deleting the example notes module, adding a module, a server function, a Drizzle table and D1 migration or a shadcn/ui component, wiring Clerk auth, and avoiding the known traps of Start on Cloudflare Workers with D1.
---

# Stack pack: TanStack Start on Cloudflare Workers

The pack is `stacks/tanstack-start/` in this kit. TanStack Start, shadcn/ui and Tailwind, Drizzle on D1, Zod, TanStack Query, Clerk, Vitest and Playwright, ESLint with a boundary check, CI. It follows `docs/architecture.md`, with one addition: each module's server folder also has a `<feature>.controller.ts` (see Conventions).

## Slice 0: apply the pack

1. In the new project folder: `npx degit jsmigendevelopment/AI-Dev-Workflow/stacks/tanstack-start .`
2. If degit fails, use a sparse clone:
   ```sh
   git clone --depth 1 --filter=blob:none --sparse https://github.com/jsmigendevelopment/AI-Dev-Workflow.git /tmp/kit
   git -C /tmp/kit sparse-checkout set stacks/tanstack-start
   cp -R /tmp/kit/stacks/tanstack-start/. . && rm -rf /tmp/kit
   ```
3. Set `name` in `package.json` and `wrangler.jsonc`. Run `pnpm install`, `pnpm check`, then `pnpm exec playwright install chromium` and `pnpm test:e2e`. All must pass before you change anything.
4. The example module: rename `notes` to the core resource, or delete it. To delete, remove `src/modules/notes/`, `src/routes/notes.tsx`, its factory in `src/server/composition.ts` and the header link. Either way, while no migration has run outside your laptop, delete `migrations/` and run `pnpm db:generate` again.
5. Fill in "Commands that work here" in `AGENTS.md` from the pack's README. The pack's `.github/workflows/ci.yml` replaces the kit template.
6. Clerk and D1 setup and the first deploy are in the pack's README. Keys and production settings stay with the person: ask them.

## Conventions

**Add a module** (`<f>` is the feature, kebab-case):
1. `schemas.ts` with `z.strictObject` inputs, and `types.ts` with the DTO and `z.input` types.
2. `server/<f>.table.ts`, then `pnpm db:generate` and read the SQL.
3. `server/<f>.repository.ts` (the port, owner-scoped), then `.repository.memory.ts`, then `.repository.drizzle.ts`. One contract suite runs against both.
4. `server/<f>.service.ts` with tests first, using the memory repo and an injected `now` and `newId`.
5. `server/<f>.controller.ts`: one `respond(schema, raw, run)` line per method, with contract tests.
6. `server/<f>.functions.ts`, a factory in `src/server/composition.ts`, then `hooks/use-<f>.ts`, `ui/views/<f>-view.tsx` and a thin route in `src/routes/`.

**Add a server function:** copy a four-line entry in `<f>.functions.ts`. `GET` for reads, `POST` for writes, `.middleware([withActor])`, a pass-through `.validator((data: Input): unknown => data)`, and a handler that calls `asActor` and one controller method. No logic in that file: it can't be unit-tested, and client code imports it.

**Why a controller file:** server functions can't run in Vitest, and anything `*.functions.ts` imports is pulled toward the browser bundle. The controller is a plain function, so the envelope contract is tested in Node.

**Add a table:** edit `<f>.table.ts`, run `pnpm db:generate`, commit the SQL and `migrations/meta/`, then run `pnpm db:migrate:local`. CI fails if a table changed without a migration.

**Add a shadcn/ui component:** `pnpm dlx shadcn@4.23.0 add <name>` (or the current version) (`components.json` is set up). It lands in `src/components/ui/`. Don't hand-edit it after.

**Auth** lives in `src/server/auth.ts`. Clerk's request middleware runs from `src/start.ts`. `withActor` turns the verified session into an `Actor`. Services take `(actor, input)` and scope every query by `actor.userId`. Someone else's row is `not_found`. With no keys, everything is `unauthenticated`.

**Errors:** services throw `AppError(code, message)`. Controllers return `{ ok, data | error }`. Hooks go through `call()`, which throws `AppError` again for TanStack Query.

**Lists:** keyset paging. Input `{ cursor?, limit }`, output `{ items, nextCursor }`. Fetch `limit + 1` rows, and sort by `created_at, id` with a matching index.

## Gotchas (checked 2026-11)

1. D1 has no interactive transactions. `db.transaction()` fails on `BEGIN`. Use one statement or `db.batch([...])` inside one repository method, and put the condition in SQL.
2. Read bindings with `import { env } from 'cloudflare:workers'` inside a handler or `createServerOnlyFn`, never at module scope.
3. `start.ts`, `*.functions.ts` and `server/auth.ts` are also bundled for the browser. Server-only calls must sit inside `.server()`, `.handler()` or `createServerOnlyFn`, or the client build fails on `cloudflare:workers`.
4. A Zod schema passed straight to `.validator()` throws on bad input, and the browser gets a plain error with no field messages. Use the pass-through and return the envelope. The method is `.validator()`, not `.inputValidator()`.
5. Server function results must be serializable. A field typed `unknown` fails typecheck.
6. Having `src/start.ts` turns off Start's default CSRF check. Keep `createCsrfMiddleware` first in `requestMiddleware`.
7. `GET` server functions put their input in the query string. Nothing private, nothing big.
8. `clerkMiddleware()` throws without a secret key, and `auth()` throws without the middleware. The pack checks for keys first. Clerk's React SDK uses `<Show when="signed-in">`. There is no `SignedIn` component.
9. Binding `undefined` throws `D1_TYPE_ERROR`; use `null`. A statement takes at most 100 bound parameters, so chunk bulk inserts.
10. Create the `QueryClient` inside `getRouter()`. A module-level client leaks one user's cache into another's HTML.
11. TanStack Query 5.108 deprecates `ensureQueryData` and `prefetchQuery`. Use `queryClient.query()` and `queryClient.infiniteQuery()`.
12. Pin `wrangler` to the version `@cloudflare/vite-plugin` depends on (`pnpm view @cloudflare/vite-plugin@<v> dependencies`). If they differ, two workerd builds install.
13. Keep TypeScript on 6.0.x until typescript-eslint supports 7.
14. eslint-plugin-boundaries skips package imports and imports inside one element unless `checkAllOrigins` and `checkInternals` are on. Prove a rule fails on a deliberate violation before you trust it.
15. Edit `wrangler.jsonc`, never `dist/server/wrangler.json`. `pnpm typecheck` reruns `wrangler types`. Secrets go in `src/env.d.ts`.

## Netlify

Netlify is the only alternative host. Swap `@cloudflare/vite-plugin` for `@netlify/vite-plugin-tanstack-start`, and move the data off D1, because `cloudflare:workers` and D1 bindings don't exist there.

## Optional add-ons

- **Local-first with Dexie:** IndexedDB as the client's owner of a resource, an outbox synced with last-write-wins on a server `version`, and undo history from Immer patches. One owner per resource: never the same rows in TanStack Query and Dexie. Add client-made ids, `baseVersion` and tombstones to the server side when you do.
- **Prerendered marketing pages:** `prerender` in `tanstackStart()` for pages that don't depend on the session. List unlinked pages in `pages[]`.
- **Rate limiting** for public writes with the Workers rate-limit binding, and **file uploads** to R2 through a server route, not a server function.
