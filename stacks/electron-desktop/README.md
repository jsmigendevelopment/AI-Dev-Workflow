# Electron desktop starter

A small, working desktop app to start from: Electron 45 with Electron Forge 8 and Vite, React 19, TanStack Router, Query and Form, Tailwind CSS, zod, and a local SQLite data file through `node:sqlite` and Drizzle. Vitest for unit tests, Playwright for end-to-end tests on the packaged app.

It installs, tests, packages and starts with no accounts and no keys. It has no sign-in and no backend: add those from `PACK.md` when an issue asks for them.

Why and when to pick this stack, the pinned versions, signing and release: [`PACK.md`](PACK.md). This file is how the starter works.

## What's inside

```
apps/desktop/                     the Electron app
  forge.config.mts                makers (zip, Squirrel), fuses, the two build flavours
  vite.main|preload|renderer.config.mts
  tsconfig.main|preload|renderer|node.json   one per process, plus the Node scripts
  src/
    main/                         Node side: windows, the engine link, OS access
      main.ts                     start-up order only
      composition.ts              the one place main wires things: starts the engine, registers IPC
      engine-link.ts              carries a checked command to the engine and its answer back
      ipc/register.ts             the only ipcMain.handle: checks the sender, then the schema
      security/                   webPreferences, permission handlers, navigation guards,
                                  the app:// protocol and its CSP header, the https-only opener
      menu.ts  about.ts           the app menu and Help > About (asks the engine for its health)
      smoke.ts  squirrel.ts       the --smoke start, Squirrel's install flags on Windows
    preload/preload.ts            a small typed API on window.app, from the contract
    renderer/                     the React screen
      routes/                     thin routes: home-page.tsx, preferences-page.tsx
      modules/preferences/        the example module: api.ts, copy.ts, hooks/, ui/
      components/  components/ui/ shared states (empty, error, skeleton) and shadcn/ui-shaped primitives
      lib/app-api.ts              send() and subscribe(): the only way the screen talks to main
  scripts/                        verify-fuses, smoke, e2e, flavour, packaged
  e2e/                            Playwright specs on the packaged app: app.spec.ts, preferences.spec.ts
packages/
  contract/src/                   commands, events, errors, the envelope, ids: zod schemas both sides share
  engine/src/                     the app's logic, in its own process (Electron's utilityProcess)
    composition.ts                the one place the engine wires services and maps commands to them
    engine-process.ts             the utilityProcess entry
    db/                           node:sqlite through Drizzle, forward-only migrations, a backup first
    modules/preferences/          service, repository port, SQLite adapter, memory fake, tests
    modules/health/               health.get
    lib/                          logger (masks tokens), event bus, data folder, clock, errors
scripts/                          new:module generator, secret scan, version pins, the Windows zip
tests/                            boundary rules, the check contract, the secret scan
```

How a click becomes a write: the screen calls `send('preferences.update', …)` → the preload wraps it in an envelope with a UUIDv7 request ID → main checks the sender frame and the payload's zod schema → the engine checks it again, runs the service, writes the value and one audit row in one transaction, and pushes `preferences.changed` → main forwards the event to the app's own windows only.

The example module is **Preferences**: two whole-number fields, with loading, saved, refused and error states, stored in SQLite and read back after a restart. Copy its shape for the first real module, then delete it.

## Commands

The check contract, plus a few more. Run them from the repo root.

| Command | Runs |
|---|---|
| `pnpm check` | `lint`, `typecheck`, `test`, `build`, in that order |
| `pnpm lint` | ESLint with the boundary rules, Prettier, knip |
| `pnpm typecheck` | tsc for the scripts, the contract, the engine, then main, preload and renderer |
| `pnpm test` | Vitest: services with memory fakes, the data file, IPC checks, security, screen states, the generator |
| `pnpm build` | packages the **release** flavour, reads its fuses back (`verify-fuses`), then starts it once with `--smoke` |
| `pnpm test:e2e` | packages the **e2e** flavour into `out-e2e/`, then runs Playwright on it (under `xvfb-run -a` on Linux with no display) |
| `pnpm gate` | `check`, then `test:e2e`, then `scan:secrets`: the local gate before a merge |
| `pnpm scan:secrets` | secretlint over every file git lists, ignored ones included, and fails on a comment that turns it off |
| `pnpm new:module <screen\|main\|adapter> <name> [command]` | a module that passes lint and typecheck as written |
| `pnpm build:win-zip` | cross-builds the unsigned Windows x64 zip and checks it holds the `.exe` and `app.asar`. Uploads nothing |
| `pnpm dev` | `electron-forge start` with the Vite dev server |
| `pnpm --filter @app/engine db:generate` | the next migration from `packages/engine/src/db/schema.ts`. List it in `db/migrations.ts` |

First run on a fresh machine: `pnpm install`, then `pnpm --filter @app/desktop exec install-electron`. Since Electron 42, installing the package no longer downloads the app binary.

**No GitHub Actions.** The checks run from the session. `tests/check-contract.test.ts` fails if a `.github/workflows/` folder appears.

## Two build flavours

`build` ships the hardened app. Playwright needs the `EnableNodeCliInspectArguments` fuse on to attach, so `test:e2e` packages a second copy with that one fuse on, into its own folder. That copy is never released. `scripts/fuses.ts` lists the release fuses, and `verify-fuses` reads them out of the packaged binary, not from the config.

## Rules lint enforces

1. **Process rule:** `renderer/` imports only `renderer/` and `packages/contract`, never `electron` or `node:*`. `preload/` imports only the contract and `electron`. `main/` never imports `renderer/` or `preload/`.
2. **Engine rule:** `packages/engine` never imports `electron` or anything in `apps/`. Only `packages/engine/src/adapters/` may import `node:child_process`. Only `packages/engine/src/db/` imports the SQLite driver.
3. **Module rule:** a module in the screen, main or the engine never imports another module. The routes and the composition roots wire them.
4. **Layer rule:** a `*.service.ts` never imports `electron`, `node:fs`, `node:child_process` or `node:net`. It gets adapters and repositories through its constructor.
5. **IPC rule:** `main/ipc/register.ts` is the only place that listens on `ipcMain`.

Each rule has a deliberate bad import in a `lint-fixtures/` folder, and `tests/boundaries.test.ts` proves lint catches it. The code style is in `eslint.config.js`: no `console`, no `as unknown as`, files warn at 300 lines and fail at 500, and an `eslint-disable` needs a reason.

## Window hardening

Set only in `main/security/`, tested in `security.test.ts` and again on the packaged app in `e2e/app.spec.ts`:

- `contextIsolation`, `sandbox` and no `nodeIntegration` or `<webview>` on every window.
- Every permission request and check is denied, on every session.
- The packaged screen loads from `app://my-app/`, never `file://`, with a CSP header that allows no remote origin.
- No navigation away from the app and no new windows. An https link opens in the person's browser; anything else opens nothing.
- Only the top frame of a window main marked as the app's own may send a command.

## Data

- The data folder is `~/my-app`, or `APP_DATA_DIR` when set. Tests, the smoke start and e2e always set it to a temporary folder.
- `app.db` opens with `node:sqlite`, built into Electron's Node, so no native module ships.
- Migrations are forward only, in one transaction each, and the file is copied to `backups/` first.
- An unreadable file never crashes the app: `health.get` says `data.isOk: false` and data commands answer `data_unreadable`, which the screen shows as a designed error with a reference ID.
- Logs are JSON lines in `logs/`, one file a UTC day, kept 14 days, with tokens, cookies and emails masked. Main's own lines go to `logs/main/` with file paths masked too.

## Rename it

The name `my-app` lives in three places: `packages/contract/src/app.ts`, `productName` in `apps/desktop/package.json`, and `PACKAGED_NAME` in `apps/desktop/scripts/packaged.ts`. A test fails if the last one drifts. Then set `name` in the root `package.json`.

## Not in the starter

From `PACK.md`, added when an issue asks: sign-in with Clerk and the web pack's `/api/v1`, signing and notarisation (paid: ask the person first), auto-update, a release script, and a Windows e2e run. The starter's e2e runs on Linux only.
