# r2-uploads

File uploads to Cloudflare R2: a `files` module that writes a metadata row first (`pending`), streams the bytes through a server route into R2, then marks the row `ready`. Size and type limits, owner-scoped, and a sweep for uploads that never finished.

| | |
|---|---|
| **Choose it when** | people attach files: avatars, PDFs, photos, exports |
| **Alternatives** | presigned R2 URLs (the browser PUTs straight to R2; needed past the Worker's request body limit, which is 100 MB on Free and Pro); Supabase Storage; UploadThing |
| **Env vars** | none. Bindings: `FILES` (R2 bucket) |
| **Packages** | none |
| **Issue** | `Skills: build, web-security` · lane `risky` (user-supplied content, storage costs, another user's data) |

## What it adds

`src/modules/files/`, layered like `notes`:

- `schemas.ts`: the limits in one place: `MAX_FILE_BYTES` (10 MB) and `ALLOWED_TYPES` (PNG, JPEG, WebP, PDF, plain text). `createUploadInput` takes a client-made `id` (so a retry is safe), plus `name`, `type` and `size`. File names with control, format or path characters are refused.
- `server/files.table.ts`: `files`, keyed by id. The R2 key is `<owner>/<id>`, never the file's name.
- `server/files.repository.ts` with `.memory.ts` and `.drizzle.ts`: `insertPending` (returns the existing row on a repeat), `findOwned`, `markReady` (pending only), `listReady` (keyset paged), `delete`, `listStalePending` and `deletePending`.
- `server/files.store.ts`: the `FileStore` port. `files.store.r2.ts` pipes the body through a `FixedLengthStream` of the declared size, which gives R2 the known length it needs and fails the upload if the client sends more or less. `files.store.memory.ts` is the fake (it enforces the size too).
- `server/files.service.ts`:
  - `createUpload`: declare the upload.
  - `upload`: the type and size must match the declaration; then `put`, then `ready`.
  - `download`, `list` and `remove`: bytes first, then the row.
  - `sweep`: pending rows older than an hour, and their bytes.
  - Someone else's file is `not_found`.
- `server/files.controller.ts`: the envelope for the server functions. `server/files.http.ts`: the HTTP controller for the bytes. Before reading the body it refuses cross-site requests (server routes skip Start's CSRF middleware), resolves the actor, checks the id and bounds its own body with the pack's `checkBody(request, MAX_FILE_BYTES)` (411 if `Content-Length` is missing, 413 `too_large` over the cap). It has to: the pack's request guards cap only server functions and `/api/v1`, at 64 KiB, so `/api/files/*` gets no cap from them. Downloads go out as `attachment` with an RFC 6266 file name, `nosniff`, `default-src 'none'; sandbox` and `private, no-store`. The request guards add the other security headers and keep this stricter CSP (they replace a route's CSP only on HTML).
- `server/files.functions.ts`, `hooks/use-files.ts` (declare, then `PUT` the file with `fetch`; errors come back as `AppError`), `ui/views/files-view.tsx` (upload form, list, download, delete; loading, empty, error and signed-out states).
- Tests: the service (the whole flow, idempotent declare, owner scoping, mismatch refused, a short stream leaves the row pending, delete, sweep), the HTTP controller (round trip and headers, cross-site 403, 401 with the body unread, bad id, 411, 413 unread, mismatch 400, another user 404, storage errors hidden), and the repository contract against memory **and local D1**.

Also `src/server/request-actor.ts` (the actor for a server route; with no Clerk keys it's null), `src/routes/files.tsx` and `src/routes/api/files.$id.ts` (`PUT` and `GET`).

With no keys: the app builds and tests pass, `/files` shows the signed-out state, and the upload route answers 401.

## Apply

1. Copy `files/` into the project root. The CLI does this step: `npx onrails add tanstack-start/r2-uploads`.
2. `wrangler.jsonc`: add the bucket at the top level (local dev), before `"env"`:
   ```jsonc
   // Uploaded files. scripts/setup-cloudflare.mjs creates the deployed buckets.
   "r2_buckets": [{ "binding": "FILES", "bucket_name": "app-files" }],
   ```
   and one per environment, because bindings are not inherited: inside `env.test`, `"r2_buckets": [{ "binding": "FILES", "bucket_name": "app-files-test" }],` and inside `env.production` the same with `app-files-production`. Without them `FILES` is optional in the generated types and `pnpm typecheck` fails.
3. `src/server/composition.ts`: add the imports and the factories.
   ```ts
   import { filesController } from '@/modules/files/server/files.controller'
   import { filesHttp as filesRoute } from '@/modules/files/server/files.http'
   import { drizzleFilesRepository } from '@/modules/files/server/files.repository.drizzle'
   import { createFilesService } from '@/modules/files/server/files.service'
   import { r2FileStore } from '@/modules/files/server/files.store.r2'
   import { requestActor } from './request-actor'
   ```
   ```ts
   function filesService() {
     return createFilesService({
       repo: drizzleFilesRepository(createDb(env.DB)),
       store: r2FileStore(env.FILES),
       now: Date.now,
     })
   }

   export const filesApi = () => filesController(filesService())
   export const filesHttp = () => filesRoute(filesService(), requestActor)
   ```
4. `eslint.config.js`: in `files`, make the R2 store an adapter (services can't import it), and keep the store files away from the UI (`*.http.ts` already is, since the pack's `/api/v1`).
   ```js
   { category: 'adapter', pattern: 'src/modules/*/server/*.{repository.drizzle,table,store.r2}.ts' },
   ```
   (that replaces the existing `adapter` row), and add, before the `client` row:
   ```js
   { category: 'server-internal', pattern: 'src/modules/*/server/*.store*.ts' },
   ```
5. `pnpm db:generate --name files`, read the SQL (one table, two indexes), then `pnpm db:migrate:local`.
6. `pnpm build` once, so `src/routeTree.gen.ts` picks up `/files` and `/api/files/$id`. Optionally, add a `/files` link to `src/components/site-header.tsx`.
7. `pnpm exec eslint --fix . && pnpm format`: the pack's lint sorts imports, including the ones this add-on added.
8. `pnpm check`.
8. Before the first deploy: `node scripts/setup-cloudflare.mjs --dry-run`, show the person, then run it for real; it creates `app-files-test` and `app-files-production`. `pnpm deploy:test` and `pnpm deploy:production` apply the migration. R2 has a free tier; past it, storage and operations cost money, so creating the buckets is the person's yes.

**Sweep abandoned uploads.** With the `jobs` add-on, register a handler and a daily cron:
```ts
// composition.ts, in jobsApi()'s handlers
'files.sweep': async () => {
  await filesService().sweep()
},
```
```ts
// jobs.schedule.ts
'17 3 * * *': [PRUNE_JOB, 'files.sweep'],
```
Without `jobs`, pending rows just stay (they're never listed or served).

**Change the limits** in `schemas.ts` only. Over about 90 MB, switch to presigned URLs: the service signs a short-lived `PUT` with `aws4fetch` against `<account>.r2.cloudflarestorage.com`, the browser uploads directly, then calls a `confirmUpload` server function that `head()`s the object and marks it ready. That needs R2 API credentials (secrets) and CORS on the bucket.

## Verify

- `pnpm test`: 21 files tests.
- With Clerk keys, on `/files`: upload a PNG, see it listed, download it, delete it. A 20 MB file, or an `.html` renamed to `.png` (wrong declared type), is refused with a message. Sign in as a second user: the first user's file URL gives 404.
- Not yet set up? `curl -X PUT <preview URL>/api/files/<uuid> --data-binary x` gives 401.

Checked for this add-on, locally, on the built Worker (`pnpm preview`, local D1 and local R2), with a scratch-only stub actor because Clerk keys weren't available: `GET` while pending → 404; wrong type → 400; foreign `Origin` → 403; a 10 MB + 1 byte body → the Worker answered 413 without reading it (the local preview proxy then reports 500 because the client was still sending; the Worker log shows the 413); the right body → 200 `ready`; again → 409; `GET` → 200 with the bytes, `attachment` and `nosniff`; another id → 404. Signed out, with the real `requestActor`, `PUT` → 401.

## Not verified here

Clerk's `auth()` inside a server route with a real Clerk instance (the route relies on the pack's `clerkMiddleware` having run; the pack's `/api/v1` check of the same path used a self-signed key, not Clerk's). Deployed R2 and the production body limit.
