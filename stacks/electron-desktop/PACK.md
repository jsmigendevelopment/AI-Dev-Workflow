# Stub pack: Electron desktop (Windows, macOS, Linux)

**Stub pack. Researched and fact-checked; not built yet. Researched 2026-11-22, fact-checked 2026-11-23. Re-check versions before building.**

**Confidence: medium.** Electron is the pick when the app needs embedded Chromium views, a session partition per account, or Node native modules such as a terminal. Clerk is an optional module, not the reason to choose it. Its Electron SDK is beta. If an app needs none of those things, Tauri is close to a coin flip, and it wins on size.

Sources: `guide/electron-pack-research.md` (the dossier, with its fact-check table), and `guide/platform-packs-research.md`, section 2 and fact-check rows 19 to 35. Marks: [V] verified, [S] secondary, [I] inferred, as in the dossier.

## When to choose it

Choose it when:

- the app must install on a computer and run outside a browser tab;
- it needs things only a bundled Chromium and Node give you: web views that move between windows, one sign-in session per account, or a native Node module (a terminal, a serial port);
- the person wants one language (TypeScript) and the web pack's test tools;
- or it signs in with Clerk, which has an official (beta) Electron SDK.

Don't choose it when:

- download size or memory use matters to the product (installers are roughly 80 to 150 MB [I]);
- the app needs none of the above, or the person already writes Rust;
- a web app or an installable web page (PWA) would do. Ask this first.

Alternatives considered:

- **Tauri 2.12:** installers ten times smaller and a deny-by-default model, but no official Clerk SDK, Rust for native work, and three web engines to test.
- **Wails 3:** Go backend, smallest community, no official e2e tool.
- **electron-vite with electron-builder instead of Forge:** pick it if Linux auto-update or an NSIS installer is a must. electron-builder handles `node_modules` itself [I].

## Pinned versions

All read from npm on 2026-11-23 [V]. Pin every version exactly. No `^` ranges.

| Piece | Version | Re-check with |
|---|---|---|
| Electron | 45.4.1 (a major every 8 weeks; latest three supported; 46 is in alpha) | `npm view electron version` |
| `@electron-forge/cli`, `plugin-vite`, `plugin-fuses`, makers, `publisher-github` | 8.0.1 | `npm view @electron-forge/cli version` |
| `@electron-forge/template-vite` (used with `--typescript`) | 8.0.1. The old `template-vite-typescript` package is retired at 7.11.2 | `npm view @electron-forge/template-vite dist-tags` |
| TypeScript | 6.0.3, as the web pack. npm `latest` is 7.0.2; don't move before the web pack does | `stacks/tanstack-start/package.json` |
| Vite, `@vitejs/plugin-react` | 8.3.8, 6.3.0, as the web pack | same file |
| `@electron/fuses` | 2.1.3 | `npm view @electron/fuses version` |
| Vitest | 5.1.1 | `npm view vitest version` |
| `@playwright/test` | 1.65.1 | `npm view @playwright/test version` |
| `eslint-plugin-boundaries` | 7.4.4 | `npm view eslint-plugin-boundaries version` |
| React, TanStack Router and Query, Tailwind, shadcn/ui, zod | as `stacks/tanstack-start/package.json` | read that file |
| Optional: `@clerk/electron` | 0.1.18, **beta** | `npm view @clerk/electron version time` |
| Optional: `electron-store` | `8` (Clerk's optional peer `^8.2.0`; npm latest is 12.0.0) | `npm view @clerk/electron peerDependencies` |
| Optional: `update-electron-app` | 3.3.0 | `npm view update-electron-app version` |
| Alternative: electron-builder / electron-updater | 26.18.0 / 6.8.11 | `npm view electron-builder dist-tags` |

Version traps:

- **Forge 8's own template already uses TypeScript 6 and Vite 8,** with ESM config files (`.mts`) [V]. So the web pack's TypeScript 6.0.3 and plugin-react 6.3.0 work here. Clerk's Electron quickstart still pins `@vitejs/plugin-react@4` and `typescript@5` and scaffolds with `--template=vite-typescript`. All three describe Forge 7's template. Don't copy them. Whether Clerk's SDK runs on top of Forge 8 hasn't been shown yet [I]. Test it before relying on Clerk.
- **Electron 46 removes the sync `safeStorage` API** (`encryptString`, `decryptString`, `isEncryptionAvailable`) [V, Electron's 46 alpha docs]. Use the async API in the app's own code. Clerk's storage adapter already prefers the async one and won't crash on 46 [V, its source]. If the async API isn't available, Clerk stops saving the session and the person signs in again after every restart [V]. On Electron 46 that is the likely outcome for an unsigned build [I].
- Pin `@clerk/electron` exactly. Its docs warn that patch releases can change behaviour.
- Since Electron 42, installing the `electron` package no longer downloads the app binary. Run `npx install-electron` in CI before packaging or tests [V].

## Folder structure

```
apps/desktop/                    (or the repo root, when there is no monorepo)
  forge.config.mts               makers, fuses (release and e2e flavours)
  vite.main.config.mts  vite.preload.config.mts  vite.renderer.config.mts
  tsconfig.json  tsconfig.main.json  tsconfig.preload.json  tsconfig.renderer.json
  eslint.config.js  .env.example
  src/
    main/                        Node side: windows, sessions, OS access
      index.ts                   start-up order only
      composition.ts             the one place that builds adapters and wires services
      security/                  the only builder of webPreferences; session hardening;
                                 navigation guards; the app:// protocol and its CSP header;
                                 the https-only openExternal wrapper
      ipc/register.ts            the only ipcMain.handle: checks the sender, parses with zod,
                                 returns one error envelope
      modules/<feature>/         only for features that need the OS
        <feature>.ipc.ts         route table: channel → controller
        <feature>.controller.ts  parse input, call one service method, map errors
        <feature>.service.ts     rules; no electron, no node:fs, no native module
        <feature>.<port>.ts  <feature>.<port>.<adapter>.ts  <feature>.<port>.memory.ts
    preload/                     a small typed API on window, generated from the contract
    renderer/                    the React app, laid out like the web pack
      routes/                    thin routes
      modules/
        <feature>/
          ui/  hooks/            views, components, query hooks
          api.ts                 calls the backend through lib/api-client
          schemas.ts  types.ts   or re-exports from packages/contract in a monorepo
      components/ui/             shadcn/ui primitives, generated
      components/  hooks/  lib/  shared
    shared/                      IPC channel names, zod schemas and the error envelope
  optional/
    auth-clerk/                  Clerk bridge, provider, CSP entries, the notes example over /api/v1
  e2e/                           Playwright specs that launch the packaged app
  scripts/                       verify-fuses.ts  smoke.ts
```

The kit's controller → service → repository chain lives in two places. Backend calls go to the web pack's backend. OS work (files, windows, terminals) goes in `main/modules/<feature>/`, layered the same way. A feature that only calls the backend has no main-side code: it's `ui`, `hooks` and `api` in the renderer.

The example module for the core is a small `settings` module that reads and writes a JSON file through a port, with a memory fake. It exercises the main-side layers. The web pack's `notes` example moves into `optional/auth-clerk/`, because it needs sign-in.

Three boundary rules, all enforced by `eslint-plugin-boundaries` in `lint`:

1. **Process rule:** `renderer/` imports only `renderer/` and `shared/`, and never `electron`, `node:*` or a native package. `main/` never imports `renderer/` or `preload/`. `preload/` imports only `shared/` and `electron`. This keeps Node out of the page, so it is also a security check.
2. **Module rule**, in `renderer/modules/*` and `main/modules/*`: modules never import each other, and shared code never imports a module.
3. **Layer rule** in `main/modules/*`: a `*.service.ts` file may not import `electron`, `node:fs`, `node:child_process`, `node:net` or a native module. Only `main/ipc/register.ts` imports `ipcMain`.

Turn on `checkAllOrigins` and `checkInternals`, or the plugin skips package imports (web pack gotcha 14). Prove each rule fails on a deliberate bad import before you trust it.

Window hardening [V, Electron's 20-item security checklist]: `contextIsolation: true`, `sandbox: true` and `nodeIntegration: false`, set only in `main/security/`. Set both permission handlers (request and check) to deny by default on every session. Serve the packaged renderer from a custom `app://` scheme with a CSP header, not from `file://`. Validate every IPC message's sender and its zod schema in `main/`. Use the fuses below to turn off running as plain Node.

Since Electron 45, a sandboxed preload can only `require('electron')`, and has no `Buffer` or `setImmediate` [V]. Keep the preload a single bundle that uses Web APIs.

## Check contract

Scripts in `package.json`. Each one runs on `ubuntu-latest` with no secrets.

| Command | Runs | Notes |
|---|---|---|
| `lint` | `eslint . --max-warnings=0 && prettier --check .` | includes the three boundary rules. Replaces the template's `oxlint` and `oxfmt` |
| `typecheck` | `tsc -p tsconfig.main.json && tsc -p tsconfig.preload.json && tsc -p tsconfig.renderer.json` | three targets: Node, preload, DOM |
| `test` | `vitest run` | services with memory fakes, IPC handlers, renderer logic, the API client |
| `build` | `electron-forge package && node scripts/verify-fuses.ts && node scripts/smoke.ts` | the **hardened** app folder: release fuses checked, then started once with `--smoke`. No installer, no signing |
| `test:e2e` | package the **e2e flavour** into its own folder, then `playwright test`; under `xvfb-run -a` on Linux | the e2e flavour differs from `build` in one fuse, and is never released |
| `check` | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | |
| `make`, `release` (not checks) | `electron-forge make`, `electron-forge publish` on a three-system matrix, with signing secrets | release tags only |

**Why two flavours.** Forge's template turns off the `EnableNodeCliInspectArguments` fuse, which is right for a release. Playwright launches Electron with `--inspect=0`, and its docs say launch fails unless that fuse stays on [V]. So `test:e2e` packages a copy with that one fuse on, and `build` ships the hardened one with a smoke start to prove it boots. The cost is packaging twice, a minute or two. The other options are to ship the inspect fuse on, which leaves the app open to a debugger, or to test the dev server, which doesn't test the built app.

Where e2e is weaker than web:

- Playwright's Electron support is labelled **experimental** in Electron's and Playwright's docs [V]. If it breaks, WebdriverIO is the documented fallback.
- CI runs e2e on Linux only. Add a Windows job for a Windows-first app, or for code that only runs on Windows. macOS and Windows render the same Chromium, so layout bugs are rare, but OS behaviour is not checked.
- OAuth sign-in with Clerk only works in a **packaged** app on a custom scheme, not in `dev` [V].

What a human must check before each release, on a real Mac and a real Windows machine:

1. The installer opens with no "unknown developer" or SmartScreen block.
2. With Clerk: sign-in works, including any OAuth provider, and sign-out clears the session.
3. An auto-update from the previous version installs and restarts.
4. The app behaves sensibly offline. Clerk's UI loads from the network, so its sign-in screen won't render offline [V].
5. Menus, tray, notifications and file dialogs, if the app has them.

## Auth and backend

The core pack has **no auth**. A local tool needs no accounts. Sign-in is the optional module `optional/auth-clerk/`, copied in when an issue asks for it. It is kept out of the core because the SDK is beta, its CSP is weaker than the core's (below), and it takes the single-instance lock.

With the Clerk module, the desktop app is a **client** of the web pack's API, like mobile. It holds no server secrets.

1. **Routes.** It calls the web pack's `/api/v1/*` server routes, not TanStack Start server functions. Server functions are same-origin RPC for the web app itself [V]. Those routes exist: `stacks/tanstack-start/src/routes/api/v1/notes.ts` and `notes_.$id.ts`, with bearer-token auth in `src/server/auth.ts` [V, this repo].
2. **Calls go through the main process.** The web API sends no CORS headers [V], so a renderer on `app://` can't call it directly. The renderer gets a fresh Clerk session token and calls one IPC channel. Main calls `net.fetch` on a base URL fixed at build time, and refuses any path that doesn't start with `/api/v1/`, so the channel isn't an open proxy. No backend change is needed. Don't turn off `webSecurity` to get round it.
3. **Token.** Get a fresh token for each request and send `Authorization: Bearer <token>`. Don't cache it; session tokens are short-lived [I].
4. **Verify** on the server with Clerk's request authentication. The web pack verifies header tokens in its middleware [V, this repo]. A real token from Electron hitting a real deployment hasn't been tried yet. If the backend ever sets Clerk's authorised parties, add the desktop origin; it doesn't set them today [V].
5. **Clerk SDK:** `@clerk/electron` 0.1.18 is official but **beta**, first published 2026-06-15 [V]. It has main (`createClerkBridge()`), preload (`exposeClerkBridge()`) and renderer (`@clerk/electron/react`) entry points, with encrypted token storage through `electron-store@8`. It needs Electron 28 or later and Node 20.9 or later. Its IPC only answers a `BrowserWindow`'s main frame. Follow Clerk's Electron quickstart for the renderer wiring, but not for the scaffold or the pins (see Version traps).
6. **Sign-in methods [V, Clerk's Electron overview]:** email codes and passwords work in dev and packaged. OAuth works only packaged. Email links, Google One Tap and Web3 aren't supported. SAML isn't supported in dev and isn't verified packaged. SMS codes aren't verified. Passkeys need a separate native mode through an optional package, and that mode isn't verified either. Tell the person before they pick sign-in methods.
7. **CSP.** Clerk's documented policy needs its Frontend API host and `'unsafe-inline'` in `script-src` [V]. The pack's e2e security test keeps two expected policies, one with Clerk and one without, so nobody loosens the core by accident.
8. **Never** put `CLERK_SECRET_KEY` or any server secret in the app. Clerk's guide says so directly [V].

`.env.example` lines for the Clerk module (names only, the `secrets` skill's format):

```bash
# Clerk publishable key · get it: Clerk dashboard → API keys · scope: local,test,production · secret: no
CLERK_PUBLISHABLE_KEY=
# Base URL of the web pack's API, no trailing slash · get it: your test or production URL · scope: local,test,production · secret: no
API_BASE_URL=
```

Check Clerk's quickstart for the variable name its renderer entry expects, and rename to match.

## CI and release

- **Pull requests:** one `ubuntu-latest` job: install, `npx install-electron`, `lint`, `typecheck`, `test`, `build`, then `test:e2e` under `xvfb-run`. Add a `windows-latest` job for a Windows-first app.
- **Release tag:** a matrix of `macos-latest`, `windows-latest` and `ubuntu-latest` running `electron-forge publish`. A signed macOS app can't be cross-built from Linux [I].
- **No job on a pull request sees a signing secret.**

Signing costs money, so **stop and ask the person before setting any of it up.** Ship the pack with signing off and a release checklist.

| System | What you need | Cost |
|---|---|---|
| macOS | Apple Developer Program, a Developer ID Application certificate, notarisation (Forge wraps `@electron/osx-sign` and `@electron/notarize`) | $99 a year [V] |
| Windows | Azure Artifact Signing (renamed Trusted Signing); removes SmartScreen warnings [V, Electron's docs] | price **unverified**; earlier about $10 a month [I] |
| Windows, otherwise | an OV or EV certificate, with the key on a hardware token or cloud HSM since June 2023 [V]; EV no longer gives instant SmartScreen reputation | roughly $200 to $500 a year [I] |
| Linux | nothing | free |

Unsigned apps are not an option for strangers. Windows 11 Smart App Control, when it's enforcing, blocks unknown unsigned code [V]. It's only on for clean installs in some regions, and it can turn itself off on a developer's PC [V], so check its state on each test PC.

An unsigned macOS build can't keep a Clerk session between launches, because `safeStorage` needs a Keychain entry tied to the signing identity [V, Clerk's deployment guide].

**Windows eligibility:** Forge's docs (October 2025) say Artifact Signing is open to US and Canadian organisations with three years of history, and to individuals only in the US and Canada [V that the doc says so]. Electron's docs say "certain countries". Ask where the person is before promising a signed Windows build.

Auto-update:

- **Public repo:** `update-electron-app` with update.electronjs.org. Free, reads GitHub Releases, macOS and Windows only, macOS must be signed [V].
- **Private repo:** a static update folder; R2 should work as S3-style storage with no egress fee [I, not tested].
- **Linux:** no built-in updater here. Ship `.deb` or `.rpm` and let the package manager update [I].
- **While unsigned:** keep auto-update off. With no signature, an updater installs whatever the feed serves.

Release secrets (names to put in GitHub secrets; suggested names, match them to Forge's config):

```bash
# Apple ID for notarisation · get it: developer.apple.com · scope: production · secret: yes
APPLE_ID=
# App-specific password for that Apple ID · get it: account.apple.com → Sign-In and Security · scope: production · secret: yes
APPLE_APP_SPECIFIC_PASSWORD=
# Apple team ID · get it: developer.apple.com → Membership · scope: production · secret: no
APPLE_TEAM_ID=
# Developer ID certificate as base64 .p12, and its password · get it: Xcode or developer.apple.com → Certificates · scope: production · secret: yes
MACOS_CERT_P12_BASE64=
MACOS_CERT_PASSWORD=
# Azure app registration for Artifact Signing · get it: Azure portal → Microsoft Entra ID · scope: production · secret: yes
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
```

Publishing to GitHub Releases uses the workflow's `GITHUB_TOKEN` with `contents: write` on the release job only.

Costs (GitHub Actions, private repo) [V in the earlier dossier; not re-read]: Linux $0.006, Windows $0.010, macOS $0.062 a minute. GitHub Free includes $12 a month. A 15-minute release on three systems costs about $1.17. Everything is free on a public repo.

## Build steps for the agent

1. Re-check every version in the table. If Electron has moved a major, read its breaking changes. Write the final pins to `docs/stack.md`.
2. Ask whether the app needs sign-in or a backend. If it does, confirm the `/api/v1` routes and bearer-token auth in the web backend still look as described above, and plan the Clerk module. If not, leave Clerk out.
3. Scaffold with Forge 8's Vite template and TypeScript: `npx create-electron-app@8.0.1 <name> --template vite --typescript`. The old `--template=vite-typescript` name fails in Forge 8 [V]. Keep TypeScript 6.0.3 and plugin-react 6.3.0. Record the scaffold in `docs/decisions.md`.
4. Lay out the folders above. Move the template's files into `main/`, `preload/` and `renderer/`. Add `shared/`, `main/security/` and `main/ipc/register.ts`.
5. Bring in the renderer stack from the web pack: React, TanStack Router and Query, Tailwind, shadcn/ui, zod. Client-only; no SSR.
6. Add the `settings` example module, with its port, real adapter and memory fake, and loading, empty and error states.
7. Harden the windows and sessions, add the `app://` scheme with its CSP header, and keep the template's fuses. Validate IPC senders and inputs with zod in `main/`.
8. Write `eslint.config.js` with the three boundary rules. Commit a deliberate violation locally, see lint fail, remove it.
9. Add the scripts, with both build flavours, `verify-fuses.ts` and `smoke.ts`. Write Vitest tests for the service and one IPC handler, and one Playwright spec that launches the e2e flavour and sees the home screen. Run this on Linux first: Playwright on a packaged Forge 8 app is untested.
10. Only if the app needs sign-in: add `optional/auth-clerk/`. Wire `@clerk/electron` as its quickstart says for the renderer, add the IPC-backed API client and the `notes` example over `/api/v1/notes`, with a signed-out state.
11. Add `.env.example` in the `secrets` format. Run the `secrets` skill for local and test values.
12. Add `.github/workflows/ci.yml` (pull requests, Linux) and `release.yml` (tags, matrix, signing off until the person says yes).
13. Fill in "Commands that work here" in `AGENTS.md`.
14. Slice 0 is done when every check-contract command passes in CI.
15. Offer to contribute the starter back to the kit: `stacks/electron-desktop/` app files with the example module, plus a `stack-electron-desktop` skill. Strip project names, keys and anything private first.

## Known risks and unverified items

- **Playwright on a packaged Forge 8 app is untested,** and it needs the inspect fuse on, hence the two flavours. Prove it in step 9 before building more.
- **Native modules (a terminal, for example).** Forge's Vite plugin copies only the `.vite` folder into the package [V, its source], so a native module marked `external` may be missing at run time. Forge's own docs say native modules "mostly work out of the box" [V that they say so]. The code and the docs disagree. Test a packaged build before relying on one, and expect to need a copy hook. See the dossier, section 4.
- **`@clerk/electron` is beta and five months old.** Patch releases can change behaviour. Nobody has shown it on Forge 8 with TypeScript 6. Sign-in method limits above [V].
- **Renderer reuse is overstated.** Moving the web pack's routes and modules into a client-only renderer still needs work (fact-check row 33).
- **Electron moves fast:** a major every 8 weeks, three supported, so the pack is out of support in about six months without upgrades [V]. Electron 46 removes the sync `safeStorage` API.
- **Signing:** Artifact Signing price unverified; Electron's and Tauri's docs disagree on EV certificates (trust Tauri's, which cites Microsoft).
- **R2 as an update feed** is untested [I].

What agents can and can't do reliably here:

| Reliable | Needs a human |
|---|---|
| Renderer code, IPC handlers, zod schemas, Vitest tests | Judging how the app looks and feels on macOS and Windows |
| Lint, typecheck, test, package and Linux e2e in a sandbox | Installing a signed build; SmartScreen, Smart App Control and Gatekeeper prompts |
| Forge config, CI workflows, the boundary rules | Buying certificates, Apple and Azure accounts (money: ask first) |
| Reading a failed release log and fixing it | Checking auto-update end to end, and OAuth sign-in in a packaged app |
