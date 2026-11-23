> **Researched 2026-11-22. Fact-checked 2026-11-23, independently, by a second pass.** Nothing in it has been built or run. Every version was re-read from npm and every decision-driving claim was re-read from its primary source on GitHub; the results are in [Fact-check](#fact-check-2026-11-23) below, and the text has been corrected in place. **Still unverified:** the Azure Artifact Signing price and current eligibility; Chrome's Local Network Access details and Node issue 47086 (secondary only); Google's embedded sign-in policy; Electron pull request 44613; the MSIX virtualisation pages and GitHub Actions prices (not re-read); whether Clerk's SDK works on Forge 8; and everything the four spikes in [Before anyone builds](#before-anyone-builds) cover. Run those spikes before acting on it.

# Electron pack: research dossier

**What the fact-check changed in the recommendations:**

1. **Tear-off is less proven than it says.** Electron's test moves a blank page between two `BaseWindow`s with `setContentView`. The pack's recommended route, `addChildView` under a `BrowserWindow`, isn't what's tested. Section 3's confidence drops from medium-high to medium, and spike S3 must use the pack's route.
2. **The native-module copy hook is still the plan, but it's a code reading, not a known failure.** Forge's Vite plugin does copy only `.vite`, but Forge's own docs say native modules "mostly work out of the box". Spike S1 decides whether the hook is needed.
3. **Clerk on Electron 46 is answered.** Clerk's storage adapter prefers the async `safeStorage` API and only uses the sync one if it exists, so it won't break on 46. If the async API isn't available, it stops saving the session. For an unsigned build that means signing in again after every restart.
4. **Clerk's sign-in limits were softer than the docs.** SAML isn't supported in dev, and passkeys need a separate native mode.

No pinned version changed. One date was wrong (`node-pty` 1.1.0 is from 2025-12-22).

## Fact-check (2026-11-23)

Method: `npm view <pkg> version` and `dist-tags` for every package named; `git ls-remote` for the tags read; raw files from each project's GitHub repo at the tag named; the `@clerk/electron@0.1.18` and `node-pty@1.1.0` tarballs unpacked and read; this repo searched with `grep`. Web search was used only where marked, and counts as secondary.

| # | Claim | Verdict | Source | How checked |
|---|---|---|---|---|
| 1 | All 40 pinned versions (Electron 45.4.1, Forge 8.0.1 packages, Vite 8.3.8, TypeScript 7.0.2 latest, plugin-react 6.3.0, node-pty 1.1.0, `@xterm/*`, Playwright 1.65.1, `@clerk/electron` 0.1.18, electron-builder 26.18.0, electron-updater 6.8.11, Vitest 5.1.1, zod 4.6.7 and the rest) | Verified | npm registry | `npm view` version and dist-tags, 2026-11-23. All match `latest` |
| 2 | electron-builder 26.18.0 / electron-updater 6.8.11 | Verified, with a note | npm | A `v26` dist-tag holds 26.18.1 / 6.8.12, newer than `latest`. Re-check when picking the alternative |
| 3 | `node-pty` 1.1.0 published 2026-10-23 | **Wrong**: 2025-12-22 | npm `time` | `npm view node-pty time`. Fixed in section 4 |
| 4 | `@clerk/electron` 0.1.18 on 2026-11-20, first publish 2026-06-15, a 0.1.19 canary on 2026-11-22 | Verified | npm `time`, dist-tags | `npm view @clerk/electron time` |
| 5 | Forge 8.0.1 on 2026-09-29; electron-vite 6.0.0 on 2026-10-14; `electron-window-state` last published 2022 | Verified | npm `time` | |
| 6 | Electron ships a major every 8 weeks | Verified | npm `time` | 44.0.0 on 2026-08-25, 45.0.0 on 2026-10-21. 46 is at `46.0.0-alpha.12` |
| 7 | Electron 45.4.1 is Chromium 156.0.8078.100 and Node 24.22.3 | Verified | `electron/electron` `v45.4.1` `DEPS` | raw file |
| 8 | `@clerk/electron` peers are Electron, React and optional `electron-store` | **Incomplete** | npm `peerDependencies`, `peerDependenciesMeta` | There's also an optional `@clerk/electron-passkeys` peer (native passkeys). Fixed in section 1 |
| 9 | Forge 8's Vite template ships `typescript ^6.0.0`, `vite ^8.0.0`, `.mts` configs, `module: preserve` | Verified | `electron/forge` `v8.0.1` `packages/template/vite/tmpl/` | raw `package.json`, `tsconfig.json`, `forge.config.mts` |
| 10 | `--template=vite-typescript` throws in Forge 8 | Verified | `create-electron-app/src/init-scripts/find-template.ts` | The error text is as quoted. Clerk's quickstart still runs `init electron-app@latest -- --template=vite-typescript`, so the quickstart command fails today |
| 11 | `template-vite-typescript` is retired at 7.11.2 | Verified | npm dist-tags | `latest` 7.11.2; only an `alpha` tag reached 8.x |
| 12 | Forge 8 needs Node 22.13+ (docs say 22.17); base template ships `nodeLinker: hoisted` and `allowBuilds` | Verified | npm `engines`; `docs/index.md`; `packages/template/base/tmpl/pnpm-workspace.yaml` | |
| 13 | The template's six fuses, including `EnableNodeCliInspectArguments: false` | Verified | `forge.config.mts` at `v8.0.1` | |
| 14 | Hardened fuses break Playwright | Verified (from docs and code, not run) | `microsoft/playwright` `v1.65.1`: `class-electron.md` known issues; `server/electron/electron.ts` passes `--inspect=0 --remote-debugging-port=0` | raw files |
| 15 | Playwright `_electron` is experimental, supports Electron 21+; Electron's testing guide documents WebdriverIO first | Verified | Playwright `class-electron.md`; Electron `docs/tutorial/automated-testing.md` | |
| 16 | A `WebContentsView` survives re-parenting | **Overstated** | `spec/api-web-contents-view.spec.ts` at `v45.4.1` | The test moves an `about:blank` view between two `BaseWindow`s with `setContentView`. No test moves a view with `addChildView` into a `BrowserWindow`, or with real content. Fixed in section 3 |
| 17 | Forge's Vite plugin drops `node_modules`, so `node-pty` needs a copy hook | **Partly verified** | `packages/plugin/vite/src/VitePlugin.ts` (the `ignore` keeps only `/.vite`); `docs/config/plugins/vite.mdx` | The code is as stated. Forge's docs say native modules "mostly work out of the box" with `external`. The failure is inferred, not shown. Fixed in section 4 |
| 18 | A Node-created Windows pipe gets the default descriptor (Everyone and anonymous can read) and no reject-remote flag | Verified | `libuv/libuv` `v1.x` `src/win/pipe.c` (`CreateNamedPipeW(..., NULL)`, no `PIPE_REJECT_REMOTE_CLIENTS`); `MicrosoftDocs/win32` `named-pipe-security-and-access-rights.md` | Read on libuv's branch, not the exact libuv in Node 24.22.3 |
| 19 | Node's `readableAll` and `writableAll` default to `false` | Verified | `nodejs/node` `main` `doc/api/net.md` | |
| 20 | Node issue 47086 confirms the default-descriptor behaviour | Secondary, not re-checked | GitHub API not reachable from this session | Still [S] |
| 21 | Electron 46 removes the sync `safeStorage` API | Verified | `v45.4.1` `docs/api/safe-storage.md` ("will be removed in Electron 46"); `v46.0.0-alpha.12` `docs/breaking-changes.md` ("have been removed") | 46 is still alpha |
| 22 | Whether Clerk's adapter uses the sync `safeStorage` API (left open) | **Resolved** | `@clerk/electron@0.1.18` tarball, `dist/esm/storage/index.js` | It uses the async API when available, the sync one only if the function exists, otherwise it doesn't persist tokens. Its own comment says the async API "generally requires a code-signed app". Section 9 updated |
| 23 | `safeStorage` on Windows doesn't protect from other apps as the same user; Linux falls back to `basic_text` | Verified | `safe-storage.md` at `v45.4.1` | |
| 24 | Clerk's Electron SDK is beta; Electron 28+; IPC answers only a `BrowserWindow`'s main frame; takes the single-instance lock | Verified, plus Node 20.9+ | `clerk/clerk-docs` `main` `docs/reference/electron/overview.mdx`; package README ("in beta. APIs may change before 1.0") | |
| 25 | Clerk: SMS codes, SAML and passkeys are "not verified" | **Overstated** | `overview.mdx` method table | SAML: not supported in dev, not verified packaged. Passkeys: renderer mode not supported in dev or a local bundle; native mode not verified. SMS: not verified. Fixed in section 9 |
| 26 | Clerk's CSP needs `'unsafe-inline'` in `script-src`; unsigned macOS builds lose the session | Verified | `docs/guides/development/deployment/electron.mdx` | |
| 27 | Clerk's quickstart pins plugin-react 4 and TypeScript 5 for Forge 7's template | Verified | `quickstart.electron.mdx` | |
| 28 | The `/api/v1` routes exist with bearer auth; no CORS headers; no authorised parties | Verified | This repo: `stacks/tanstack-start/src/routes/api/v1/notes.ts`, `notes_.$id.ts`, `src/server/auth.ts` (`bearerActor`) | Read the files; `grep` for `Access-Control`, `cors`, `authorizedParties` in `src/` found none |
| 29 | Electron's checklist has 20 items; you need both permission handlers | Verified | `docs/tutorial/security.md`, `docs/api/session.md` ("you must also implement `setPermissionCheckHandler`") | |
| 30 | Electron 45 sandboxed preloads can only `require('electron')`; since 42 no binary download in `postinstall` | Verified | `docs/breaking-changes.md` at `v45.4.1` (45.0 and 42.0 sections) | |
| 31 | `node-pty`: ConPTY only, prebuilds for Windows and macOS only, bundles `conpty.dll` and `OpenConsole.exe`, one dependency, not thread safe | Verified | `node-pty@1.1.0` tarball; `microsoft/node-pty` `README.md` | |
| 32 | xterm.js flow control (50 MB cap, 5 to 35 MB/s, HIGH 100000, LOW 10000) and the security quote | Verified | `xtermjs/xtermjs.org` `master` `_docs/guides/flowcontrol.md`, `security.md` | |
| 33 | A mismatched Squirrel AppUserModelID makes "pinning and notifications misbehave" | **Overstated** | `docs/api/auto-updater.md` at `v45.4.1` | The doc names pinning only. Fixed in section 10 |
| 34 | Smart App Control blocks unsigned code; clean installs only | Verified, plus two facts | `MicrosoftDocs/windows-dev-docs` `smart-app-control/overview.md` (dated 2025-11-18) | Also: only in certain regions, and it can turn itself off for developers. Added in section 8 |
| 35 | Windows signing: Electron says "certain countries" and "cheapest"; Forge's October 2025 doc says US and Canada; hardware keys since June 2023 | Verified | `electron/electron` `docs/tutorial/code-signing.md`; `electron/forge` `docs/guides/code-signing/code-signing-windows.mdx` | Both docs may be out of date |
| 36 | update.electronjs.org needs a public repo, and signing on macOS and MSIX only | Verified | `electron/update.electronjs.org` `README.md` | |
| 37 | Chrome 142 puts loopback requests behind a Local Network Access prompt | Secondary, corroborated | Web search: Chrome for Developers blog and IT help pages | Search also says Chrome 145 splits out a separate loopback permission. Still [S] |
| 38 | Azure Artifact Signing price | Unverified | Web search: Azure pricing page | Tiers (5,000 and 100,000 signatures a month) show; amounts don't |
| 39 | Google's embedded sign-in block; Electron PR 44613; MSIX path virtualisation; GitHub Actions prices | Not re-checked | | Left as marked in the text |

**Counts:** 39 rows. Verified 28 (rows 2, 18, 24 and 34 with notes or added facts). Resolved 1. Partly verified or incomplete 2. Overstated 3. Wrong 1. Secondary 2. Unverified or not re-checked 2.

**Question:** what does a production-grade Electron starter pack need, so that an AI agent can build a desktop app on it and the result is safe, testable and releasable?

**Date:** 2026-11-22. Re-check versions and prices before building.

**Starting point:** `stacks/electron-desktop/PACK.md` (the stub) and `research/platform-packs.md`, section 2 and fact-check rows 19 to 35. This dossier doesn't repeat the Electron versus Tauri comparison. It goes one level down: what the pack must contain.

**Constraints used:** the kit's check contract (`check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`), decoupled feature modules with a boundary check in lint, the web pack's renderer conventions (React, shadcn/ui, Tailwind, Zod, Vitest, Playwright, `eslint-plugin-boundaries`), and the always-stop list (money, secrets, production).

## How to read the evidence marks

| Mark | Meaning |
|---|---|
| **[V]** | Verified today against a primary source: the npm registry, or the project's own docs or source code in its GitHub repo at the tag named in Sources. |
| **[S]** | Secondary: a web-search summary of a page I could not open, or a third-party write-up. A lead, not a fact. |
| **[I]** | Inferred from how the tools work, or from training knowledge (cut-off mid-2026). Not checked today. |

**What I could not open:** `learn.microsoft.com`, `azure.microsoft.com`, `developers.google.com`, `developer.chrome.com`, `electronjs.org`, `electronforge.io`, `clerk.com`, `playwright.dev`, `xtermjs.org`. Where the project keeps its docs on GitHub (Electron, Forge, Clerk, Playwright, xterm.js, Node.js, libuv, and Microsoft's `win32`, `msix-docs` and `windows-dev-docs` repos) I read the source files there. No experiment was run.

## Summary

| # | Topic | Recommendation | Confidence | Biggest open point |
|---|---|---|---|---|
| 1 | Scaffold | **Electron 45 + Forge 8 + Vite 8, TypeScript 6.0.3**, the same TypeScript and React plugin as the web pack. The stub's "Clerk pins TypeScript 5" trap belongs to Forge 7's template and is gone in Forge 8. | High for Forge 8 with TS 6; medium for Clerk on top | Clerk's quickstart is written for the Forge 7 template; nobody has shown it on Forge 8 |
| 2 | Security | All 20 items of Electron's checklist, most of them enforced by code that a test proves: a custom `app://` scheme, a header CSP, one IPC door with Zod and a sender check, deny-by-default navigation and permissions, hardened fuses | High | Clerk's UI forces `'unsafe-inline'` in `script-src` |
| 3 | Windows and tabs | `BrowserWindow` for each top-level window, tab content as child `WebContentsView`s, moved between windows with `addChildView`. One session partition per account | Medium (was medium-high; fact-check row 16) | Upstream tests move a blank view with `setContentView` between `BaseWindow`s, not with `addChildView` and not with a terminal or a signed-in site; Google may refuse embedded sign-in |
| 4 | Terminals | `@xterm/xterm` 6 + `node-pty` 1.1 (ConPTY only, prebuilt for Windows and macOS). An allowlisted environment per terminal. Watermark flow control | Medium | Forge's Vite plugin copies only `.vite` into the package, but its docs say native modules mostly work; a spike decides whether a copy hook is needed |
| 5 | Local API | One optional module: the same authenticated protocol over a **named pipe or Unix socket by default**, loopback TCP as an opt-in. Pairing, hashed per-client secrets, a visible "being driven" banner, one-click stop | Medium | A Node-created Windows pipe is readable by Everyone and isn't remote-proof; auth is required on every transport |
| 6 | Testing | Vitest for main, preload and renderer logic. Playwright `_electron` against a packaged build for e2e | Medium | Playwright's Electron support is still "experimental", and it **can't launch a build whose inspect fuse is off** |
| 7 | Check contract and CI | Six scripts as the stub has them, plus an e2e build flavour and a hardened-build smoke test. Pull requests run on Linux; add a Windows job for a Windows-first app | High | Double packaging adds minutes |
| 8 | Packaging, signing, updates | Squirrel.Windows, ZIP and DMG, deb and rpm. Signing off by default. CI artifacts and a beta prerelease channel replace "deploy to test" | Medium | Windows signing eligibility and price; Smart App Control |
| 9 | Clerk | An **optional** module, not part of the core. API calls go through the main process over IPC, so no CORS change is needed | Medium | Beta SDK; its bridge only answers a `BrowserWindow`'s main frame |
| 10 | Windows recipes | Optional modules: per-window taskbar identity, tray, deep links with single-instance forwarding, auto-start, and an MSIX warning sheet | Medium | MSIX redirects `AppData`, which breaks apps that share files with other apps |

Four findings that change the stub:

1. **TypeScript 6 is fine.** Forge 8.0.1's own Vite template ships `typescript ^6.0.0`, `vite ^8.0.0` and ESM config files (`.mts`) [V]. The `--template=vite-typescript` name that Clerk's quickstart uses throws an error in Forge 8 [V].
2. **`/api/v1` already exists** in the web pack, with bearer-token auth (`src/routes/api/v1/notes.ts`, `src/server/auth.ts`) [V, this repo]. The stub still says it's "being added".
3. **Hardened fuses and Playwright conflict.** Playwright launches Electron with `--inspect=0`, and its docs say the `nodeCliInspect` fuse must stay on [V]. Forge's template turns that fuse off [V]. The pack needs two build flavours.
4. **Clerk shouldn't be in the core.** A local tool needs no accounts. Electron is still the right pick without Clerk when the app needs embedded Chromium views, session partitions or Node native modules, which is the case this dossier's sections 3 and 4 cover [I].

---

## 1. Project scaffold and structure

### Options compared

| | Forge 8 + Vite plugin | electron-vite 6 + electron-builder | Plain Vite + `@electron/packager` |
|---|---|---|---|
| Version | 8.0.1 (2026-09-29) [V] | electron-vite 6.0.0 (2026-10-14), electron-builder 26.18.0 [V] | packager 20.3.0 [V] |
| Maintainer | The Electron project | Community (electron-vite); community (electron-builder) | The Electron project |
| What it gives | Template, dev server with reload, packaging, makers, publishers, fuses plugin, signing wrappers | Faster-moving dev tooling; electron-builder's NSIS installer and `electron-updater` (Linux updates too) | Nothing but packaging; you write the rest |
| Clerk's docs | Written for Forge [V] | Not covered | Not covered |
| Native modules | Likely needs a copy hook (section 4) [V for the code; Forge's docs disagree] | electron-builder handles `node_modules` itself [I] | Manual |
| Agent fit | One documented path; fewer decisions | Two tools with separate configs | Most code to write and get wrong |

**Recommendation: Forge 8 with its Vite plugin.** Pick electron-vite with electron-builder only if Linux auto-update or an NSIS installer is a hard requirement.

### What Forge 8 changed [V]

- The package is ESM (`"type": "module"`), needs Node 22.13 or later (its docs say 22.17), and loads `forge.config.ts` or `.mts` through `jiti`.
- Templates are now `vite` and `webpack`, with a `--typescript` flag. The scaffold command is `npx create-electron-app@8.0.1 <name> --template vite --typescript`. The old `vite-typescript` name fails with "no longer exists".
- `@electron-forge/template-vite-typescript` stays at 7.11.2 on npm because it was folded into `@electron-forge/template-vite` 8.0.1. It doesn't "lag"; it's retired.
- The template's `package.json` asks for `typescript ^6.0.0` and `vite ^8.0.0`. Its `tsconfig.json` uses `module: preserve` and `moduleResolution: bundler`. Vite configs are `vite.main.config.mts`, `vite.preload.config.mts` and `vite.renderer.config.mts`.
- Main and preload bundles are always CommonJS with a `.cjs` extension (`.vite/build/main.cjs`, `preload.cjs`), whatever the `package.json` type says.
- The template ships the fuses plugin already configured (section 2), and lint with `oxlint` and `oxfmt`. The pack replaces those with ESLint and Prettier to keep the boundary plugin and match the web pack.
- The template still loads the packaged renderer with `loadFile()`, which is a `file://` origin. Section 2 replaces that.

### The TypeScript question, resolved

Clerk's quickstart says: "`@vitejs/plugin-react` is pinned to v4 because the template loads its Vite config as CommonJS … and `typescript@5` replaces the template's 2021 pin" [V]. Both reasons describe the Forge 7 template. In Forge 8 the Vite configs are ESM and the template pins TypeScript 6 [V]. `@clerk/electron` 0.1.18 declares no TypeScript peer; its peers are `electron >=28`, React `^18` or `~19.0.3` to `~19.3.0-0`, and three optional ones: `react-dom`, `electron-store ^8.2.0` and `@clerk/electron-passkeys` (native passkeys) [V; the passkeys peer added by the fact-check]. The web pack's React 19.3.1 satisfies that range.

So the pack can use **TypeScript 6.0.3 and `@vitejs/plugin-react` 6.3.0**, the web pack's versions. [V] for Forge; [I] for Clerk until spike S4 runs. Don't move to TypeScript 7.0.2 (npm `latest`) before the web pack does.

### Package manager

Forge's docs say packaging "requires `node_modules` to be on disk" and tell pnpm users to set a hoisted linker; the Forge 8 base template ships a `pnpm-workspace.yaml` with `nodeLinker: hoisted` and `allowBuilds` for `electron` and `electron-winstaller` [V]. Two consequences:

- In a single-app repo, use pnpm with that file. Simple.
- In the kit's monorepo, `nodeLinker` is a workspace-wide setting. The monorepo dossier found that hoisting is the one condition under which two React versions collide. **Keep the desktop app in its own workspace root** (its own lockfile, inside or outside the monorepo folder) until a spike shows Forge 8 packages correctly under isolated installs. With the Vite plugin, everything except native modules is bundled, so it may well work; nobody has shown it [I].

Since Electron 42 the `electron` package no longer downloads its binary in `postinstall`; the binary arrives on first run, or when you call `npx install-electron` [V]. CI must call that explicitly before packaging or tests.

### Structure: three processes as modules, with two boundary rules

```
src/
  main/        Node side. Windows, sessions, OS access. Never imports renderer/.
  preload/     The bridge. Exposes a small typed API. Sandboxed.
  renderer/    The React app, laid out like the web pack. Never imports electron or node:*.
  shared/      IPC contract (channel names + Zod schemas) and the error envelope. Imported by all three.
```

The kit's `controller → service → repository` rule has a home in the main process, which the stub missed. When a feature needs the OS (files, terminals, windows), its main-side code is layered the same way as a web module's server code:

| Web pack file | Desktop equivalent in `src/main/modules/<feature>/` | Does |
|---|---|---|
| `<feature>.functions.ts` | `<feature>.ipc.ts` | The route table: channel → controller. A few lines per entry. |
| `<feature>.controller.ts` | `<feature>.controller.ts` | Parse input with the shared schema, call one service method, map errors to the envelope |
| `<feature>.service.ts` | `<feature>.service.ts` | Rules. No `electron`, no `node:fs`, no native module |
| `<feature>.repository.ts` + adapter + memory fake | `<feature>.<port>.ts` + `.<adapter>.ts` + `.memory.ts` | The OS-facing port, its real adapter and its test fake |
| `src/server/composition.ts` | `src/main/composition.ts` | The one place that builds adapters and wires services |

A feature that only calls the backend has no main-side code: it's `ui`, `hooks` and `api` in the renderer, as in the stub.

Boundary rules for `eslint-plugin-boundaries` 7.4.4, with `checkAllOrigins` and `checkInternals` on as in the web pack:

1. **Process rule.** `renderer/` imports only `renderer/` and `shared/`, and no `electron`, `node:*` or native package. `main/` never imports `renderer/` or `preload/`. `preload/` imports only `shared/` and `electron`.
2. **Module rule**, in both `renderer/modules/*` and `main/modules/*`: modules never import each other; shared folders never import a module.
3. **Layer rule** in `main/modules/*`: a `*.service.ts` file may not import `electron`, `node:fs`, `node:child_process`, `node:net` or any native module. Only `src/main/ipc/register.ts` imports `ipcMain`. Only `src/preload/` imports `contextBridge` and `ipcRenderer`.

Prove each rule fails on a deliberate bad import before trusting it, as the web pack does.

**Typecheck** runs three projects (`tsconfig.main.json` with Node types, `tsconfig.preload.json`, `tsconfig.renderer.json` with DOM types), so a DOM global used in `main/` fails to compile.

### Sources (scaffold)

- npm registry, read 2026-11-22: `@electron-forge/cli`, `plugin-vite`, `template-vite`, `template-vite-typescript` (versions and dist-tags), `create-electron-app`, `electron-vite`, `electron-builder`, `@electron/packager`, `typescript`, `vite`, `@vitejs/plugin-react`, `@clerk/electron` (peer dependencies).
- `electron/forge` at tag `v8.0.1`: `packages/template/vite/tmpl/*` (package.json, tsconfig.json, forge.config.mts, main.ts), `packages/template/base/tmpl/pnpm-workspace.yaml`, `packages/external/create-electron-app/src/init-scripts/find-template.ts`, `docs/index.md`, `docs/config/plugins/vite.mdx`, `docs/config/typescript-configuration.md`.
- `clerk/clerk-docs` `main`: `docs/getting-started/quickstart.electron.mdx`. Read 2026-11-22.
- `electron/electron` `v45.4.1`: `docs/breaking-changes.md` (42.0, postinstall).
- This repo: `stacks/tanstack-start/package.json`, `stacks/tanstack-start/eslint.config.js`, `.agents/skills/idea/templates/architecture.md`.

---

## 2. Security baseline

Electron's security tutorial has a 20-item checklist [V]. The pack's job is to make each item either a default the agent can't forget, or a test that fails when it's broken.

| # | Checklist item | How the pack meets it | Proved by |
|---|---|---|---|
| 1 | Only load secure content | Renderer served from `app://renderer`; remote content only in separate views with their own session | e2e: `location.protocol` is `app:` |
| 2, 3, 4 | No Node integration; context isolation; sandbox | One `createWebPreferences()` helper sets `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`. Nothing else may build `webPreferences` (lint rule) | Unit test on the helper; e2e: `typeof require === 'undefined'` in the page |
| 5 | Permission handlers | `hardenSession(ses)` sets `setPermissionRequestHandler` **and** `setPermissionCheckHandler` to deny by default, on the default session and every partition. Electron's docs say you need both [V] | Unit test with a fake session; e2e asks for geolocation and is refused |
| 6, 8, 9, 10 | `webSecurity` on; no insecure content; no experimental or Blink features | The helper never sets them; lint bans the option names elsewhere | Lint |
| 7 | Content Security Policy | Sent as a response header from the `app://` handler. `default-src 'self'`; no `unsafe-eval` in packaged builds | e2e: an inline script and a remote script are both blocked |
| 11, 12 | `<webview>` | Not used. `will-attach-webview` is always prevented | Unit test |
| 13 | Limit navigation | `will-navigate` and `will-redirect` allow only the app's own origin, registered once through `app.on('web-contents-created')` so no view is missed | e2e: `location.href = 'https://example.com'` stays put |
| 14 | Limit new windows | `setWindowOpenHandler(() => ({ action: 'deny' }))`; http and https links go to the system browser | e2e |
| 15 | `shell.openExternal` | One wrapper that accepts only `https:` (and `mailto:` if needed) after `new URL()` parsing | Unit test with `file:`, `javascript:` and custom schemes |
| 16 | Current Electron | Exact pin, plus a scheduled dependency job. A major lands every 8 weeks and only three are supported [V, earlier dossier] | CI job |
| 17 | Validate the sender of every IPC message | `register.ts` checks `event.senderFrame` is a main frame whose origin is the app's, before parsing | Unit test with a foreign frame |
| 18 | No `file://` | `protocol.handle('app', …)` with `registerSchemesAsPrivileged` (`standard`, `secure`, `supportFetchAPI`). The handler resolves paths inside the renderer build folder and rejects anything that escapes it | Unit test with `..` paths |
| 19 | Fuses | See below | `scripts/verify-fuses.ts` in the release job |
| 20 | Don't expose Electron APIs to untrusted content | Preload exposes plain functions built from the contract, never `ipcRenderer` itself. Remote-content views get **no preload** | Lint; unit test |

### Typed, validated IPC: one door

```
shared/ipc/contract.ts   channel name → { input: z.strictObject(…), output: z…. }
main/ipc/register.ts     the only ipcMain.handle call. For each channel:
                         1. check the sender (item 17)   2. input.parse()   3. call the controller
                         4. return the error envelope, never a stack trace
preload/index.ts         for each channel, expose a function that calls ipcRenderer.invoke
```

- Request and response only (`invoke` and `handle`). No `send`, no `sendSync`, no `remote`.
- Schemas are strict objects, so unknown fields are rejected, matching the kit's "validate at every boundary" rule.
- Main to renderer pushes go through named, typed events in the same contract. High-volume streams (terminal output) use a `MessagePort` per stream, not broadcast events (section 4).
- **Electron 45 trap [V]:** sandboxed preload scripts can no longer `require` Node shims (`events`, `timers`, `url`) and have no `Buffer` or `setImmediate`. `require` only loads `electron`. The preload must be a single bundle that uses Web APIs. Vite's preload build does this; a test should fail if the preload bundle contains a `require(` of anything but `electron`.

### Fuses

Forge 8's template sets these [V]: `RunAsNode: false`, `EnableCookieEncryption: true`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`, `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`. The pack adds `GrantFileProtocolExtraPrivileges: false`, which is safe once the renderer no longer uses `file://` [V that the fuse exists and defaults to on; I that nothing else needs it].

Three things follow:

- **`RunAsNode: false` breaks `child_process.fork()` of the app binary.** Use `utilityProcess` for helper processes [V that the API exists; I on the interaction].
- **`EnableNodeCliInspectArguments: false` breaks Playwright** [V]. Playwright's Electron docs list it under known issues, and its launcher always passes `--inspect=0 --remote-debugging-port=0`. The pack builds an e2e flavour with that one fuse left on (section 7), and never ships it.
- **ASAR integrity** is described as experimental in Electron's docs, works on macOS and on Windows from Electron 30, and Forge sets up the header hash by itself from 7.4.0 [V]. Files unpacked from the archive (native modules, section 4) are outside the check [I].

### Secrets on disk: `safeStorage`

- Use the **async** API (`encryptStringAsync`, `decryptStringAsync`, `isAsyncEncryptionAvailable`). The sync API is deprecated in Electron 45 and "will be removed in Electron 46" [V].
- What it protects, in Electron's own words [V]: on Windows (DPAPI) content is "protected from other users on the same machine, but not from other apps running in the same userspace". On macOS the Keychain also protects it from other apps. On Linux it depends on the secret store, and with no store it falls back to a hardcoded password (`basic_text`); the pack should detect that and refuse to store secrets.
- So on Windows, `safeStorage` stops another Windows user and a stolen disk. It does **not** stop any program running as the same user. Say this in the app's own docs rather than implying more.
- Prefer not storing a secret at all: store a hash when the app only needs to check a secret (section 5).

### What a custom scheme costs

- `new URL('app://renderer').origin` is the string `'null'` for a non-special scheme, so compare scheme and host instead [V, Clerk's quickstart].
- Service workers, cookies and some storage APIs need the scheme registered as `standard` and `secure` before `app.ready` [I].
- Dev mode still loads from Vite's dev server on `http://localhost:5173`, with `unsafe-eval` for hot reload. The packaged build is the only thing that shows the real policy, which is one more reason e2e runs against the package.

### Sources (security)

- `electron/electron` `v45.4.1`: `docs/tutorial/security.md` (the checklist and items 5, 13, 14, 17, 18), `docs/tutorial/fuses.md`, `docs/tutorial/asar-integrity.md`, `docs/api/safe-storage.md`, `docs/api/session.md`, `docs/breaking-changes.md` (45.0). Read 2026-11-22.
- `electron/forge` `v8.0.1`: `packages/template/vite/tmpl/forge.config.mts`, `tmpl/main.ts`.
- `microsoft/playwright` `v1.65.1`: `docs/src/electron-api/class-electron.md`, `packages/playwright-core/src/server/electron/electron.ts`.
- `clerk/clerk-docs` `main`: quickstart (the origin helper and navigation guard) and deployment guide (the header CSP).

---

## 3. Multi-window and tabs

### The building blocks [V]

- `BrowserView` is deprecated; `WebContentsView` replaces it. A `WebContentsView` is a `View` that shows one `WebContents`. Windows have a `contentView`; you add children with `addChildView(view[, index])` and remove them with `removeChildView(view)`.
- `BaseWindow` is a window with no web page of its own. `BrowserWindow` is a `BaseWindow` plus one.
- **You own the lifetime.** When a window that holds a `WebContentsView` closes, the view's `webContents` is not destroyed. "It is your responsibility to close the `webContents`", or it leaks. This is unlike `BrowserWindow`.
- A `WebContents` can be shown in only one `WebContentsView` at a time.

### Options for a tabbed, tear-off shell

| | A. `BrowserWindow` shell + child `WebContentsView`s | B. `BaseWindow` + a shell view + content views | C. One `BrowserWindow` per tab, grouped by hand |
|---|---|---|---|
| Tab strip lives in | The window's own page | A `WebContentsView` like any other | Each window draws its own |
| Tear-off | Move the content view to another window | Same | Nothing to move, but no shared window |
| Clerk works in the shell | Yes: its bridge answers a `BrowserWindow`'s main frame [V] | **Unknown.** Clerk's docs say `BrowserView`s, webviews and iframes can't use it and don't mention `WebContentsView` | Yes |
| Complexity | Medium | Medium | Low, but it isn't tabs |

**Recommendation: A.** Each top-level window is a `BrowserWindow` whose own page draws the frame (tab strip, colour, indicators). Each tab's content is a `WebContentsView` child of `win.contentView`, sized by the main process to the area under the tab strip.

### Tear-off and re-attach without a reload

Moving a view is `targetWindow.contentView.addChildView(view)` (remove it from the old parent first, to be explicit). Evidence that the page survives:

- Electron's own test suite has "does not change when view is moved between two visible windows": it registers a JavaScript listener in the page, moves the view to a second window with `setContentView`, and the same listener then fires. The document is the same one [V, `spec/api-web-contents-view.spec.ts` at `v45.4.1`]. **Fact-check: this is narrower than the recommendation.** The test uses two `BaseWindow`s, replaces each window's whole content view, and loads `about:blank`. No upstream test moves a view with `addChildView` into a `BrowserWindow`'s `contentView`, which is option A's route, or moves one with real content. It's good evidence that the mechanism exists, not proof of option A.
- The same test documents a side effect: on Windows and Linux the page gets two `visibilitychange` events (hidden, then visible); on macOS one. Pages that pause on `hidden` will blink.
- A crash when moving a view between windows was fixed upstream in late 2024 (pull request 44613) [S]. Stay on a supported Electron.

What isn't proven: option A's own route (`removeChildView` from one `BrowserWindow`'s `contentView`, `addChildView` to another's); moving a view that holds a WebGL canvas (the terminal renderer), a playing video, or an open DevTools; and dragging across monitors with different scale factors. Spike S3 covers these.

Rules for the pack's tab module:

- A **tab** is a main-process record: `{ id, kind, view, windowId, accountId }`. The window manager is the only code that calls `addChildView`, `removeChildView` and `webContents.close()`.
- Closing a window either moves its tabs elsewhere or closes each `webContents`. A unit test with fake views checks that no tab is left without an owner.
- The gesture is the app's to build; Electron has no native tab drag. The renderer reports "tab dragged out of the strip" over IPC, and the main process creates a window at `screen.getCursorScreenPoint()` and moves the view [I].
- Keyboard and menu commands ("Move tab to new window", "Move tab to window N") do the same thing, and are what e2e tests drive.

### Window state across monitors

`electron-window-state` 5.0.3 was last published in 2022 [V]. Don't depend on it; this is about 80 lines the pack should own, with tests:

- Save per window: `getNormalBounds()`, maximised and full-screen flags, and the display's `id` and bounds, debounced on `move` and `resize` and once more on `close`.
- Restore: find the saved display by `id`; if it's gone, use `screen.getDisplayMatching(savedBounds)`; then clamp the bounds into that display's `workArea` so a window can never open off-screen. Re-apply maximised after `show`.
- Store it with the other app state as JSON under `app.getPath('userData')`, validated with Zod on read; a corrupt file falls back to defaults.
- Display `id`s aren't guaranteed stable across reboots or docking [I]. The saved display bounds are the tiebreaker.

### One session partition per account

- `session.fromPartition('persist:<name>')` gives a persistent session with its own cookies, cache and storage; without the `persist:` prefix it's in memory only [V].
- A view's session is fixed when it's created (`webPreferences.partition` or `session`). You can't move a live page to another account; close it and open a new one.
- Every partition needs `hardenSession()` (section 2). A session created later and never hardened is the easy mistake, so partitions should only be created through one factory.
- Remote-content views get no preload, `sandbox: true`, and a navigation policy of their own (they must navigate, but new windows still go through `setWindowOpenHandler`, and downloads through a `will-download` handler).
- "Sign out of this account" is `ses.clearStorageData()` plus `ses.clearCache()`; deleting an account also removes its partition folder [I for the folder].
- Partitions share one Windows user. They separate cookies between accounts inside the app. They aren't a security boundary against other software on the machine.

### The limits of embedded web sign-in

- **Google.** Google announced in 2020 that it would block sign-ins from embedded browser frameworks from January 2021 and named CEF-based apps; non-compliant OAuth requests get `disallowed_useragent` [S, Google Developers Blog posts of 2020 and 2021, via search]. Electron isn't named, but it's the same class. In practice results vary by account and day [S]. **Don't spoof the user agent to get round it:** that misrepresents the client, and several providers' terms forbid exactly that.
- **Fallbacks, in order:** the site's own email-code or password sign-in inside the view; a device-code flow where the vendor offers one (the person approves in their normal browser, and the embedded page or CLI picks it up); otherwise tell the person that this site can't be used in an embedded tab and offer "open in my browser".
- **Opening the system browser doesn't help a web tab.** It signs the person in there, not in the partition. It only helps when the app itself is the OAuth client and receives a deep-link callback (which is how Clerk's SDK does it, section 9).
- **Passkeys and security keys** inside embedded views are unverified. Clerk's docs say renderer WebAuthn only works on an `https://` origin that matches the relying party [V], which a third-party site in a view does satisfy; whether the Windows Hello prompt appears from a `WebContentsView` wasn't checked [I].
- **The app never touches the session.** No reading cookies to "export" a sign-in, no copying a partition between accounts, no injecting tokens. The pack's web-tab module shouldn't expose `ses.cookies` at all.

### Sources (windows and tabs)

- `electron/electron` `v45.4.1`: `docs/api/web-contents-view.md`, `docs/api/view.md`, `docs/api/base-window.md` (resource management), `docs/api/session.md`, `docs/tutorial/web-embeds.md`, `shell/browser/api/electron_api_view.cc`, `spec/api-web-contents-view.spec.ts`. Read 2026-11-22.
- npm registry: `electron-window-state` (last publish date).
- `clerk/clerk-docs` `main`: `docs/reference/electron/overview.mdx` (requirements).
- [S] Web search, 2026-11-22: Electron commit "fix: segfault when moving WebContentsView between BrowserWindows (#44613)"; Google Developers Blog, "Guidance to developers affected by our effort to block less secure browsers and applications" (2020) and "Upcoming security changes to Google's OAuth 2.0 authorization endpoint in embedded webviews" (2021).

---

## 4. Terminals

### Pieces and versions [V]

| Piece | Version | Notes |
|---|---|---|
| `@xterm/xterm` | 6.0.0 | The scoped package. The old `xterm` package stopped at 5.3.0 in 2024 |
| `@xterm/addon-fit`, `-webgl`, `-serialize` | 0.11.0, 0.19.0, 0.14.0 | Fit to the container; GPU renderer; snapshot the buffer |
| `node-pty` | 1.1.0 (2025-12-22; the draft said 2026-10-23, which was wrong) | Microsoft's. `1.2.0-beta.18` exists; stay on `latest` |

`node-pty` 1.1.0 facts, from its README and its npm tarball [V]:

- **ConPTY only.** "Support for the `winpty` library has been removed. Windows 10 version 1809 (build 18309) or later is now required."
- It's a Node-API addon (`node-addon-api`), and the tarball carries prebuilt binaries for `win32-x64`, `win32-arm64`, `darwin-x64` and `darwin-arm64`. Its install script uses them and falls back to `node-gyp rebuild` when none match. **Linux has no prebuild** and compiles on install (it needs Python, `make` and a C++ compiler).
- The Windows prebuild bundles its own `conpty.dll` and `OpenConsole.exe`.
- "node-pty is not thread safe", and "all processes launched from node-pty will launch at the same permission level of the parent process".

Because it's Node-API, the prebuilt binary doesn't need rebuilding for Electron's ABI [I]. Whether `@electron/rebuild` 4.2.1, which Forge runs during packaging, leaves the prebuild alone or rebuilds from source wasn't tested. If it rebuilds on Windows, the build machine needs Visual Studio's C++ tools and the Spectre-mitigated libraries the README lists [V for the list].

### Getting a native module into a Forge + Vite package

This is the part most likely to cost a day.

- Forge's Vite plugin sets the packager's `ignore` so that **only the `.vite` folder is copied**. `node_modules` is left out [V, `VitePlugin.ts` at `v8.0.1`].
- A native module can't be bundled by Vite. Forge's docs say to mark it `external` in `vite.main.config` [V]. Put those two facts together and the packaged app starts, calls `require('node-pty')`, and fails because the folder isn't there [I].
- **Fact-check: Forge's docs disagree.** The same page says that with the Vite template "native modules will mostly work out of the box", and recommends `external` only "to avoid possible build issues" [V that it says so]. The code reading above is correct, and the code wins over the docs, but nobody has shown the failure. Spike S1 decides. Until then, treat the copy hook as likely needed, not known to be needed.
- The fix the pack should ship, tested by e2e against the package: (1) `external: ['node-pty']` in the main build; (2) a `packageAfterCopy` hook (or a custom `ignore` function) that copies `node_modules/node-pty` and its one dependency into the build; (3) `asar.unpack` for `**/*.node`, `**/*.dll`, `**/*.exe` and `spawn-helper`, or the `@electron-forge/plugin-auto-unpack-natives` plugin, since executables can't run from inside the archive [V that the plugin exists and what it does; I that it covers the `.exe` and `.dll` files].
- Unpacked files sit outside ASAR integrity (section 2).

### Where the pty runs

| | In the main process | In a `utilityProcess` "pty host" |
|---|---|---|
| Simplicity | One process, direct calls | A second entry point and a message protocol |
| A native crash | Takes the whole app down | Kills the host; the app can restart it and say so |
| Heavy output | Competes with window management on the main thread | Isolated |

**Recommendation:** start in the main process behind a `PtyPort` interface (so tests use a fake), and move the adapter to a `utilityProcess` when the app has more than a few terminals. Whether `node-pty` loads cleanly in a `utilityProcess` is [I].

### A per-terminal environment

- Build the child's environment from an **allowlist**, not by deleting known-bad names from `process.env`. Start from the few variables a shell needs (`PATH`, `SystemRoot`, `USERPROFILE`, `HOME`, `TEMP`, `TMP`, `LANG`, `TERM`, `COMSPEC`, `APPDATA`, `LOCALAPPDATA`, `PATHEXT`), add the terminal's own values, then run a deny pattern over the result as a second net (`*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, plus names the app lists).
- Windows environment names are case-insensitive. Normalise before comparing, or `Anthropic_Api_Key` slips through.
- The schema for "spawn a terminal" takes a profile id, not a free-form environment or command line from the renderer. The main process looks the profile up. A renderer that could pass an arbitrary `env` or `shell` would be a shell-injection door.
- Each profile can set its own config directories through environment variables and its own working directory.
- Never log the environment. Log the names that were removed, and how many.

### Stream handling

- **Transport.** One `MessageChannelMain` per terminal; the renderer gets its port through the preload. Don't broadcast terminal output to every window, and don't use `invoke` per chunk.
- **Ownership.** A terminal id belongs to one tab. The main process refuses writes to a pty from any `webContents` other than the one the tab currently lives in. When a tab is torn off, the port stays with the page, since the page doesn't reload (section 3).
- **Flow control.** xterm.js's guide: `write()` is non-blocking and buffers; the buffer has a hard cap (50 MB) past which data is dropped; real throughput is roughly 5 to 35 MB a second. Its recommended pattern counts bytes written but not yet processed as a watermark, calls `pty.pause()` above `HIGH = 100000` and `pty.resume()` below `LOW = 10000`, using `write`'s callback as the acknowledgement [V, `flowcontrol.md`]. Across a port, the acknowledgement is a message back from the renderer.
- **Batching.** Coalesce pty chunks for a few milliseconds before posting, to keep message counts sane during `cat` of a large file [I].
- **Resize.** Debounce; send `cols` and `rows` to the pty after the fit addon measures. ConPTY reflows on resize and can repaint the screen [I].
- **Exit and cleanup.** Kill the pty when its tab closes and on `before-quit`. Whether killing a ConPTY reliably ends every grandchild process is [I]; test it with a process that spawns a child.
- **Persistence across tear-off.** Nothing to do if the view moves without a reload. For crash recovery, `addon-serialize` can snapshot the buffer.

### Terminal output is untrusted data

xterm.js's security guide: placing a terminal in an HTML document "exposes direct shell access to any Javascript code on that page", and keystrokes pass through JavaScript [V]. For the pack:

- The page that hosts xterm.js loads no remote scripts, ever. Its CSP is the strict one.
- Links in output go through the `openExternal` wrapper, on click only.
- Leave clipboard-writing escape sequences (OSC 52) off unless the person turns them on [I].
- Text read from a terminal by any automation (section 5) is data, never instructions: length-capped, control characters stripped, shown as quoted output.

### Sources (terminals)

- npm registry and the `node-pty@1.1.0` tarball (file list, `scripts/prebuild.js`), read 2026-11-22: `node-pty`, `@xterm/xterm`, `@xterm/addon-*`, `xterm`, `@electron/rebuild`.
- `microsoft/node-pty` `main`: `README.md`.
- `xtermjs/xtermjs.org` `master`: `_docs/guides/flowcontrol.md`, `_docs/guides/security.md`.
- `electron/forge` `v8.0.1`: `packages/plugin/vite/src/VitePlugin.ts` (`resolveForgeConfig`, `packageAfterCopy`), `docs/config/plugins/vite.mdx` (native modules), `docs/config/plugins/auto-unpack-natives.md`.

---

## 5. A local API for other apps

Some desktop apps need to be driven by another program on the same machine. This is the riskiest optional module in the pack, so it gets a threat model before a transport.

### Threat model

| Attacker | Can they reach it? | Defence |
|---|---|---|
| A web page in the person's browser | **Loopback TCP: yes.** Any page can send requests to `127.0.0.1`. Chrome 142 and later put this behind a "Local Network Access" permission prompt [S]; other browsers and older Chromes don't. **Pipe or Unix socket: no**; browsers can't open them [I] | Prefer a pipe. On TCP: require a secret in a custom header (forces a CORS preflight that the server never approves), reject any request that carries an `Origin` header, send no CORS headers, use no cookies |
| DNS rebinding (a hostile domain that resolves to `127.0.0.1`) | Loopback TCP only | Check `Host` is exactly `127.0.0.1:<port>`; the secret still applies |
| A WebSocket from a web page | Loopback TCP only. WebSockets skip CORS | Check `Origin` on upgrade and require the secret in the first message; or don't offer WebSocket |
| Another user on the same machine (shared PC, remote desktop host) | **Loopback TCP: yes**, loopback isn't per-user. **Windows pipe made by Node: partly** (see below). **Unix socket: no**, with `0600` in a private folder | Auth on every request; never treat the transport as proof of identity |
| Another machine on the network | Loopback TCP: no, when bound to `127.0.0.1` (never `0.0.0.0`, and not `localhost`, which may resolve to IPv6 first). Windows pipe: **not ruled out** (see below) | Auth; a firewall rule; ideally a hardened pipe |
| A program that grabs the endpoint first and pretends to be the app | Fixed port or fixed pipe name | Random port or pipe name per start, published in a discovery file under the user's profile; a challenge-response so the client never sends the secret itself |
| A program running as the same user | Yes, on every transport. It can also read the app's files and memory | **Out of scope, and say so.** Same-user software is inside the trust boundary on Windows, macOS and Linux. The banner and the audit log make misuse visible, not impossible |

### What Node gives you on Windows [V]

- `net.createServer().listen('\\\\.\\pipe\\name')` creates a named pipe through libuv. libuv calls `CreateNamedPipeW` with `PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | WRITE_DAC`, `FILE_FLAG_FIRST_PIPE_INSTANCE` for the first instance, and **`NULL` security attributes** (`src/win/pipe.c`).
- Microsoft's docs: with `NULL`, the default descriptor grants "full control to the LocalSystem account, administrators, and the creator owner" and "read access to members of the Everyone group and the anonymous account". To keep out "remote users or users on a different terminal services session", put the logon SID on the pipe's DACL.
- libuv's flags don't include `PIPE_REJECT_REMOTE_CLIENTS` (no match in the file). So a Node-created pipe isn't guaranteed local-only; reaching it remotely needs SMB access to the machine [I for how exposed that is on a default home PC, where inbound file sharing is usually blocked].
- Node's `server.listen()` has `readableAll` and `writableAll` options, default `false` [V, `doc/api/net.md`]. A Node.js issue (47086) records a maintainer confirming the default-descriptor behaviour in 2023, and a 2026 comment saying that with both options `false` the Windows default (readable by Everyone) stays in place [S].
- `FILE_FLAG_FIRST_PIPE_INSTANCE` is useful: if another process already created the name, `listen` fails. The module should treat that as "someone else has this name: stop and tell the person", never retry on another name silently.
- A locked-down DACL plus `PIPE_REJECT_REMOTE_CLIENTS` needs a small native addon. That's a later hardening step, not a reason to skip auth now.

### Options compared

| | A. Named pipe (Windows) / Unix socket | B. Loopback HTTP | C. Loopback WebSocket | D. No listener: a CLI the other app spawns |
|---|---|---|---|---|
| Reachable from a browser | No | Yes, unless every check above holds | Yes; weakest, no CORS | No |
| Reachable by other local users | Windows: read access by default; macOS and Linux: no | Yes | Yes | No |
| Client effort | Node, .NET, Go, Rust: easy. Python on Windows needs `pywin32`. Browsers and most low-code tools: can't | Anything can | Anything can | Anything can spawn a process, but the CLI still has to reach the running app |
| Streaming | Yes | Server-sent events, or polling | Yes | Poor |
| Debuggable with `curl` | `curl --unix-socket` on macOS and Linux; not on Windows pipes | Yes | No | n/a |

**Recommendation for the pack:** ship **one protocol with pluggable listeners**. HTTP semantics (JSON requests, one error envelope, server-sent events for streams) served by Node's `http` module over whatever `net.Server` it's given. Default listener: a named pipe on Windows and a `0600` Unix socket in a private folder elsewhere. Loopback TCP is a second listener the app must turn on by name, and it enables the extra `Host` and `Origin` checks. The auth layer is identical on both, so an app that starts on one and moves to the other changes one config line.

Why the pipe is the default even with its weak DACL: it removes the whole browser-origin class of attack, which is the one a developer is least likely to test for. Why TCP stays available: some clients can't speak pipes.

### Auth and pairing

- **Pairing starts in the app, by the person.** Either the app shows a one-time code to type into the client, or the client asks to pair and the app shows a prompt naming it. Nothing pairs without a click on the app's own window.
- **One secret per client**: at least 256 random bits, shown once, stored by the app **only as a hash** (SHA-256 is enough for a secret of that length), compared in constant time.
- **Every secret has an expiry** and appears in a list with "last used" and a **Revoke** button. Revoking drops that client's live connections.
- **Challenge-response on connect**: the server sends a nonce, the client answers with an HMAC of it under the secret, and the server proves itself the same way. The secret never crosses the wire, so an impostor endpoint learns nothing.
- **Scopes per client**, deny by default. Mark every method `read`, `write` or `destructive`; a client is paired for a set of them. Destructive methods ask the person every time, on the app's window, showing the exact arguments.
- **Not exposed means not possible.** The API has no method that returns a cookie, a token, a stored secret or an environment variable. A lint rule keeps the module from importing the session or the secret store.
- **Rate-limit failed auth**, per endpoint, and log each failure.
- **Never put the endpoint's secret into a terminal's environment** or any place a child process inherits.

### "Being driven" must be visible

- While any client is connected: a banner in every window, in a colour the app uses for nothing else, naming the client; a different tray icon; and the window title changed.
- **One-click stop** on the banner and in the tray menu: drop every connection, close the listeners, and persist "off" so a restart doesn't quietly re-enable it.
- The API is **off until the person turns it on**, and the setting shows which listeners are active.
- An audit log of each call: time, client, method, decision, outcome. Not the arguments, which may hold private text.
- A request that needs the person and gets no answer is refused, never auto-approved after a timeout.

### Sources (local API)

- `libuv/libuv` `v1.x`: `src/win/pipe.c`. `nodejs/node` `main`: `doc/api/net.md`. Read 2026-11-22.
- `MicrosoftDocs/win32` `docs`: `desktop-src/ipc/named-pipe-security-and-access-rights.md`.
- [S] `nodejs/node` issue 47086, "Can't change NamedPipe permissions with Windows" (opened 2023-03-14, closed not planned; comments through June 2026), read through a fetch summary.
- [S] Web search, 2026-11-22: Chrome for Developers, "New permission prompt for Local Network Access" (2025-06-09, updated 2025-09-29 for Chrome 142).
- [I] The auth rules follow common guidance for static secrets (least privilege, expiry, revocation, hashed storage). No standard sets the numbers.

---

## 6. Testing

### Layers

| Layer | Tool | What it covers | Runs where |
|---|---|---|---|
| Unit: shared and services | Vitest 5.1.1, Node environment | Schemas, services with memory fakes, window-state maths, the env allowlist, auth for the local API | Any runner, no Electron |
| Unit: controllers and IPC | Vitest, `electron` mocked | `register.ts` (sender check, parse, envelope), each controller | Any runner |
| Unit: renderer | Vitest with a DOM environment | Hooks, views with their loading, empty and error states, the API client | Any runner |
| Integration: native | Vitest, real `node-pty` | Spawn a process that echoes, resize, kill; pipe listener and pairing | Windows and Linux runners |
| E2E | Playwright 1.65.1 `_electron`, packaged e2e build | The `auto` acceptance checks, security checks, multi-window flows | Linux under `xvfb`; Windows for a Windows-first app |
| Smoke | The hardened build with a `--smoke` flag | It starts, loads the renderer, quits with code 0 | Every system that ships |

### Playwright's Electron support today [V, Playwright `v1.65.1`]

- Still labelled **experimental**. Imported as `_electron`. Supports Electron 21 and later.
- `electron.launch({ executablePath, args })` starts the app with `--inspect=0 --remote-debugging-port=0`. On Linux it adds `--no-sandbox` unless `chromiumSandbox` is set.
- Known issue from its docs: launch times out unless the `nodeCliInspect` fuse is left on. This is the conflict in section 2.
- `electronApp.evaluate(({ app, dialog, BrowserWindow }) => …)` runs code in the main process. The docs show it replacing `dialog.showOpenDialog` so native dialogs never open. The same trick reads window bounds, counts windows, and triggers "move tab to new window".
- `electronApp.windows()`, `firstWindow()` and the `window` event give a `Page` per window "created and loaded".
- **Not verified:** whether a child `WebContentsView` shows up as a `Page`. Each `webContents` is a debugging target, so it probably does, but nothing in the docs says so [I]. Spike S2 answers it. If it doesn't, drive views through `evaluate` and `webContents.executeJavaScript`.
- Fallback if Playwright breaks on an Electron major: WebdriverIO with `@wdio/electron-service` 10.4.1, which Electron's testing guide documents first [V].

### What an agent can and can't verify

| An agent can verify, in CI | Needs a human, on a real machine |
|---|---|
| Every unit and integration test above | How the app looks and feels: native frame, title bar, taskbar grouping, tray icon |
| The packaged app starts and renders (Linux `xvfb`, Windows runner) | SmartScreen, Smart App Control and Gatekeeper prompts on a downloaded build |
| Security: no `require` in the page, CSP blocks inline script, navigation refused, permissions refused, fuses as expected | An installer run end to end; an auto-update from the previous version |
| IPC contract: bad input and a foreign sender are refused | Two physical monitors, mixed scale factors, docking and undocking |
| Windows and tabs by command: open, move to a new window, move back, close; no leaked `webContents` | The drag gesture itself |
| Partition isolation: set a cookie in one, read none in another | Signing in to a third-party site. By rule the person does this, never an agent |
| A terminal echoes, resizes and dies cleanly; a stripped variable is absent in the child | Whether a real CLI behaves in the terminal over an hour |
| The local API refuses unpaired, expired and revoked clients, and requests with an `Origin` | The pairing prompt reads clearly; the banner is impossible to miss |

### Screenshot tests

- `page.screenshot()` and `toHaveScreenshot()` capture one `webContents`: no native frame, no title bar, no taskbar, and no other views stacked in the same window [I].
- Fonts and anti-aliasing differ per system, so baselines are per-OS. Keep pixel assertions to the Linux job, at one fixed window size and scale factor, with animations off.
- Use them for the renderer's own screens. For "is the tab's view in the right place", assert bounds through `evaluate`, not pixels.
- A whole-window image for a human reviewer can come from `win.capturePage()` per view, attached to the pull request as an artifact, not asserted [I].

### Sources (testing)

- `microsoft/playwright` `v1.65.1`: `docs/src/electron-api/class-electron.md`, `class-electronapplication.md`, `packages/playwright-core/src/server/electron/electron.ts` and `loader.ts`. Read 2026-11-22.
- `electron/electron` `v45.4.1`: `docs/tutorial/automated-testing.md`.
- npm registry: `vitest`, `@playwright/test`, `@wdio/electron-service`, `electron-playwright-helpers`.

---

## 7. The check contract and CI

### Mapping

| Command | Runs | Notes |
|---|---|---|
| `lint` | `eslint . --max-warnings=0 && prettier --check .` | Process, module and layer boundary rules; the banned `webPreferences` options |
| `typecheck` | `tsc -p tsconfig.main.json && tsc -p tsconfig.preload.json && tsc -p tsconfig.renderer.json` | Three targets |
| `test` | `vitest run` | Unit and integration. Native integration tests skip themselves where the module isn't available, and CI fails if they skip on Windows |
| `build` | `electron-forge package && node scripts/verify-fuses.ts && node scripts/smoke.ts` | The **hardened** app folder: release fuses, checked, then started once with `--smoke`. No installer, no signing |
| `test:e2e` | `APP_E2E=1 electron-forge package` into a separate output folder, then `playwright test` (under `xvfb-run -a` on Linux) | The e2e flavour differs from `build` in one fuse (`EnableNodeCliInspectArguments` on) and is never uploaded as a release |
| `check` | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | As the contract says |
| `make`, `release` (not checks) | `electron-forge make`, `electron-forge publish` | Installers; release tags only |

Three options for the fuse conflict, since it's a real decision:

| Option | Trade-off |
|---|---|
| **A. Two flavours (recommended):** `build` hardened plus smoke, `test:e2e` builds its own | Packages twice (a minute or two). E2E doesn't run the exact shipped binary; the smoke test covers that it boots |
| B. One flavour with the inspect fuse left on | Simple, and what many apps do. Ships an app anyone can attach a debugger to with a command-line flag |
| C. E2E against the unpackaged dev app | Fast, but it tests the dev server, the dev CSP and no fuses or archive. It doesn't meet "the built app for desktop" in the contract |

### CI layout

- **Pull requests, `ubuntu-latest`:** install, `npx install-electron`, `check`, then `test:e2e` under `xvfb`.
- **Pull requests, `windows-latest`, when the app is Windows-first or uses a terminal, pipes or taskbar code:** `test`, `build`, `test:e2e`. Those code paths don't exist on Linux, so a Linux-only pipeline would report green on code that never ran.
- **`main` after merge:** `make` on Windows (and macOS when the app ships there), upload the installers as workflow artifacts, and publish a beta prerelease (section 8).
- **Release tag:** the three-system matrix with signing secrets, only after the person has said yes to signing.
- **No job on a pull request sees a signing secret.**

### Caching and native modules

- Cache the pnpm store keyed on OS, architecture and the lockfile hash.
- Cache Electron's download keyed on the Electron version, and run `npx install-electron` so the binary exists before tests (Electron no longer fetches it on install [V]).
- `node-pty` needs no compiler on Windows and macOS runners because of its prebuilds; on Linux it compiles, which the stock runner image can do [V for the prebuilds; I for the runner tools].
- Don't cache `node_modules` across operating systems, and don't cache the packaged output.

### Cost

GitHub Actions on a private repo: Linux $0.006, Windows $0.010, macOS $0.062 a minute, with $12 a month included on the Free plan; all free on a public repo [V in the earlier dossier's fact-check, row 17; not re-read today]. macOS costs about ten times Linux, so it runs on release tags only.

| Run | Rough minutes | Cost, private repo |
|---|---|---|
| Pull request, Linux only | 8 | $0.05 |
| Pull request, Linux + Windows | 8 + 12 | $0.17 |
| Release, three systems | 15 each | $1.17 |

The minute counts are guesses [I]. At 100 pull-request runs a month with the Windows job, that's about $17, which is over the free allowance.

### Sources (CI)

- `research/platform-packs.md`, fact-check rows 17 and 35 (Actions prices).
- `electron/electron` `v45.4.1`: `docs/breaking-changes.md` (42.0). `electron/forge` `v8.0.1`: template scripts.
- The check contract in this repo's `AGENTS.md`.

---

## 8. Packaging, signing and auto-update

### Makers [V, Forge `v8.0.1` docs]

| Maker | Output | Use it when | Watch out |
|---|---|---|---|
| Squirrel.Windows | `Setup.exe`, a `.nupkg`, `RELEASES` | **Default on Windows.** Per-user install, no admin prompt, built-in updates | Builds on Windows (or Linux with mono and wine). Starts the app with `--squirrel-*` flags on install; handle them first (`electron-squirrel-startup`). Sets its own AppUserModelID (section 10) |
| ZIP | A zip of the app | Always on macOS (the updater needs it); handy on Windows for "unzip and run" while unsigned | No shortcuts, no uninstaller |
| DMG | A disk image | macOS download | macOS only |
| deb, rpm | Packages | Linux | No auto-update |
| MSIX | `.msix` | The Microsoft Store, or managed company PCs | "Experimental" since Forge 7.10. Needs the Windows SDK. Must be signed to install [I]. **Redirects `AppData`** (section 10) |
| WiX MSI | `.msi` | IT departments that deploy MSI | Per-machine by default |

### Windows signing in 2026

| Option | Who can get it | Cost | Notes |
|---|---|---|---|
| **Azure Artifact Signing** (the renamed Trusted Signing) | Electron's docs: "limited to developers in certain countries" [V]. Forge's docs, dated October 2025: US and Canada organisations with three or more years of history, and individuals in the US and Canada [V that the doc says so; it's a year old]. The earlier dossier's fact-check: the organisation list has grown; individuals are still US and Canada only [S] | **Unverified.** The pricing page shows two tiers with 5,000 and 100,000 signatures a month, and bills the full month from account creation; the amounts didn't load [S]. About $10 a month for the small tier was the public price earlier [I] | Electron's docs call it "the cheapest option" and say it "gets rid of SmartScreen warnings" [V]. Signs from CI with no hardware token |
| OV or EV certificate from a certificate authority | Organisations anywhere; individuals with some authorities [I] | Roughly $220 to $600 a year through resellers [S] | Since June 2023 the private key must live on a hardware token or a cloud HSM [V, Forge docs], so CI signing needs the authority's cloud signing service. Certificates are capped at about 460 days from early 2026 [S]. EV no longer gives instant SmartScreen reputation [V in the earlier dossier] |
| Microsoft Store (MSIX) | Anyone with a Store developer account | Unverified | The Store signs the package. Brings MSIX's virtualisation with it |
| Free signing for open-source projects | Projects that qualify | Free | Not verified today; treat as a lead |
| Unsigned | Everyone | Free | Fine on your own PC; not for strangers (below) |

**Ask where the person is, and whether they sign as a person or a company, before promising a signed Windows build.** Buying any of this is on the always-stop list.

macOS: Developer ID certificate plus notarisation, $99 a year, wrapped by Forge through `@electron/osx-sign` 2.7.2 and `@electron/notarize` 3.1.2 [V versions; price from the earlier dossier]. An unsigned macOS build also can't keep a Clerk session between launches, because `safeStorage` needs a Keychain entry tied to the signing identity [V, Clerk's deployment guide].

### Staying unsigned safely while the app runs on one PC

What the warnings actually key on:

- **SmartScreen** checks files that carry the "downloaded from the internet" mark. An app built on the same PC has no such mark, so it runs without a prompt; the same build downloaded through a browser from CI shows "Windows protected your PC" with a "Run anyway" link [I].
- **Smart App Control**, when it's in enforcement mode, blocks "unknown, unsigned code … by default" and allows apps only if Microsoft's service recognises them or they're signed by a trusted authority. It exists only on clean installs of Windows 11 and may be in evaluation mode or off [V, Microsoft's overview, dated 2025-11-18]. The same page says it's only enabled in certain regions, and that evaluation mode turns it off by itself for people, developers among them, whom it would get in the way of [V, added by the fact-check]. There's no per-app exception [V in the earlier dossier]. If it's enforcing on the owner's PC, an unsigned build won't run and the choice is to sign or to turn it off for good.

Rules for the pack's "unsigned, local-only" mode:

1. Build on the PC that runs it, or download only from your own repository's CI and check the artifact's SHA-256 against the one the workflow printed.
2. Never switch off Defender or SmartScreen system-wide to get past a prompt.
3. Keep auto-update **off**. An unsigned updater installs whatever the feed serves; with no signature there's no second check. Update by installing the next build yourself.
4. Fuses and the security baseline stay on. "Unsigned" doesn't mean "unhardened".
5. Name and version every build, and show the version and commit in an About box, so "which build is this" always has an answer.
6. Write down the day signing becomes necessary: the first time anyone else installs it.

### Auto-update, once signed

| Option | Works with | Cost | Limits |
|---|---|---|---|
| `update-electron-app` 3.3.0 + update.electronjs.org | Forge, public GitHub repo, GitHub Releases | Free | macOS and Windows only. Builds must be signed on macOS and for MSIX; Squirrel.Windows isn't checked for a signature [V, the service's README] |
| Static storage (Forge's S3 publisher; any S3-style bucket) | Forge, private repos | Storage and egress | Squirrel reads `RELEASES` on Windows and `releases.json` on macOS [V]. A non-S3 bucket is untested |
| `electron-updater` 6.8.11 | electron-builder, not Forge | Free | The route to Linux updates |
| MSIX updater | Electron's `autoUpdater` when running as MSIX | Free | Direct MSIX links or a JSON feed [V] |

### What replaces "deploy to test"

The web pack's loop merges, deploys to a test URL, and smoke-tests it. A desktop app has no URL. The equivalent:

| Web step | Desktop equivalent |
|---|---|
| Preview deploy per pull request | Workflow artifacts on the pull request: the packaged app for Windows (and a screenshot set from e2e) |
| Deploy to the test environment on merge | A **beta channel**: every merge to `main` runs `make` and publishes a GitHub prerelease. The beta build has its own name, app id and data folder, so it installs beside the stable one |
| Smoke test on the test environment | The Windows job downloads the artifact it just made, runs `--smoke`, then the e2e suite against it |
| "Test URL" in `AGENTS.md` | The link to the latest beta prerelease |
| Promote to production | A release tag, signed, after the person's manual checklist |

### Sources (packaging)

- `electron/forge` `v8.0.1`: `docs/config/makers/*.md`, `docs/guides/code-signing/code-signing-windows.mdx`, `docs/advanced/auto-update.md`.
- `electron/electron` `v45.4.1`: `docs/tutorial/code-signing.md`, `docs/tutorial/updates.md`, `docs/api/auto-updater.md`.
- `electron/update.electronjs.org` `main`: `README.md`.
- `MicrosoftDocs/windows-dev-docs` `docs`: `hub/apps/develop/smart-app-control/overview.md`.
- `clerk/clerk-docs` `main`: `docs/guides/development/deployment/electron.mdx`.
- [S] Web search, 2026-11-22: Azure's Artifact Signing pricing page (tiers and quotas, no amounts); reseller price lists and certificate-authority pages on 2026 validity limits.
- `research/platform-packs.md`, fact-check rows 28 to 32.

---

## 9. Clerk on Electron

### Status [V]

- `@clerk/electron` **0.1.18**, published 2026-11-20, tagged beta in Clerk's docs; a `0.1.19` canary appeared on 2026-11-22. First published 2026-06-15. "Patch releases can still change behavior." Pin it exactly.
- Three entry points: `createClerkBridge()` in main (IPC handlers, token storage, the OAuth deep-link transport), `exposeClerkBridge()` in preload, `<ClerkProvider>` from `@clerk/electron/react` in the renderer.
- Needs Electron 28 or later, `contextIsolation` on, and the Native API enabled on the Clerk instance. Every origin the renderer runs on must be in the instance's `allowed_origins` (the dev server, and `app://renderer` or whatever scheme the app uses). Setting that list takes one call with the secret key **from the developer's machine**; the key never goes into the app.
- Needs Node 20.9 or later, too [V, added by the fact-check].
- Sign-in methods: email code and passwords work in dev and packaged. OAuth works only in a packaged app, through the system browser and a deep link. Email links, Google One Tap and Web3 aren't supported. SMS codes are "not verified". **Corrected by the fact-check:** SAML is "not supported" in dev and "not verified" packaged. Passkeys in the renderer are not supported in dev or from a local bundle, because they need an `https://` origin matching the relying party. The alternative is a separate native mode through the optional `@clerk/electron-passkeys` package, and it is "not verified".
- Clerk's UI loads from the network at run time, so the CSP must allow the instance's Frontend API host, and its documented policy includes `'unsafe-inline'` in `script-src`. The sign-in screen doesn't render offline.
- Token storage uses `safeStorage` through `electron-store@8` (latest is 12.0.0). **Fact-check, answered from the 0.1.18 tarball (`dist/esm/storage/index.js`) [V]:** the adapter uses the async API when `isAsyncEncryptionAvailable()` says yes. It falls back to the sync API only if `isEncryptionAvailable` exists as a function. Otherwise it saves nothing, and the person is signed out on restart. So Electron 46's removal of the sync API won't crash it. Its own comment says the async API "generally requires a code-signed app". On Electron 46, an unsigned build will probably sign the person out on every restart [I]. Spike S4 should check that on Electron 45 and 46.
- "Clerk's IPC only answers a `BrowserWindow`'s main frame." This is why section 3 keeps the shell in a `BrowserWindow`.
- With a renderer scheme set, the bridge takes Electron's single-instance lock on Windows and Linux. An app that manages the lock itself passes `manageSingleInstanceLock: false` (section 10).

### Make it an optional module

The core pack has no auth. `optional/auth-clerk/` adds the bridge, the provider, the CSP entries and the API client. Reasons: a local tool has no accounts; the SDK is beta; and its CSP is weaker than the core's. The pack's e2e security test should have two expected policies, one per configuration, so nobody loosens the core by accident.

### Calling the web pack's `/api/v1`

The web pack already has these routes: `Authorization: Bearer <Clerk session token>`, header only, never the cookie [V, this repo]. It sends no CORS headers [V, by search of the web pack's source]. A renderer on `app://renderer` calling `https://app.example.com/api/v1/…` is a cross-origin request with an `Authorization` header, so Chromium sends a preflight, and the API doesn't answer it. Three ways through:

| | A. Through the main process | B. Add CORS to `/api/v1` | C. Loosen the renderer |
|---|---|---|---|
| How | The renderer gets a fresh token from Clerk and calls one IPC channel; main calls `net.fetch` on a fixed base URL | The web pack answers `OPTIONS` and allows the app's origin | `webSecurity: false`, or rewrite response headers in `webRequest` |
| Backend change | None | Yes, in the web pack, per desktop origin | None |
| Security | The renderer's CSP `connect-src` stays closed to the API host. Main must refuse any path outside `/api/v1/` so the channel isn't an open proxy | Fine for a bearer-only API with no cookies. One more thing to keep in sync | Breaks checklist item 6. No |
| Token handling | The token crosses IPC once per call; main doesn't store it | Stays in the renderer | n/a |

**Recommendation: A.** The monorepo pack's typed API client takes an injected `fetch` [V, this repo], so the desktop renderer passes it an IPC-backed one and reuses the client and the contracts unchanged.

Details to get right:

- The IPC schema is `{ method, path, query, body }` plus the token; `path` must match `^/api/v1/`; the base URL comes from build config, never from the renderer.
- Get a fresh token per call; session tokens are short-lived [I].
- If the backend ever sets Clerk's authorised parties, the desktop origin must be on that list; the web pack doesn't set it today [V, by search].
- The web pack's bearer path is unit-tested with fakes. A real token minted in Electron hitting a real deployment hasn't been tried (the earlier fact-check's row 76 is still open).

### Sources (Clerk)

- npm registry: `@clerk/electron` (versions, dates, peers), `electron-store`. Read 2026-11-22.
- `clerk/clerk-docs` `main`: `docs/reference/electron/overview.mdx`, `docs/getting-started/quickstart.electron.mdx`, `docs/guides/development/deployment/electron.mdx`, `docs/guides/configure/auth-strategies/oauth-deep-links.mdx`, `docs/guides/development/making-requests.mdx`.
- This repo: `stacks/tanstack-start/src/server/auth.ts`, `src/lib/http.ts`, `src/routes/api/v1/notes.ts`; `stacks/monorepo-expo/packages/api-client/src/client.ts`.

---

## 10. Windows integration recipes

Each is an optional module with its own tests, copied in when an issue asks for it.

### Taskbar identity (AppUserModelID)

- Windows groups taskbar buttons by AppUserModelID. Set one for the process early with `app.setAppUserModelId(id)` [V].
- **It must match the shortcut.** A Squirrel.Windows install creates a shortcut whose id is `com.squirrel.<PACKAGE_ID>.<exe name without .exe>`; Electron's docs say you have to use the same id in the app, or Windows can't pin it properly to the taskbar [V; the draft added "notifications", which that doc doesn't say].
- **Per window:** `win.setAppDetails({ appId, appIconPath, appIconIndex, relaunchCommand, relaunchDisplayName })`. `appId` "has to be set, otherwise the other options will have no effect", and `relaunchCommand` and `relaunchDisplayName` "must always be set together" [V]. Microsoft's docs confirm the model: a window-level id overrides the process-level one, and a window with its own id should set the relaunch properties so a pinned button knows how to start it [V].
- So a window with its own id gets its own taskbar button, icon and pin. When the person clicks that pin later, Windows runs the relaunch command, which starts a second copy of the app. The single-instance handler (below) must read the argument and open or focus the right window in the running copy.
- Agents can test that the calls are made with the right values. Whether the taskbar looks right needs a person.

### Tray

- Create the `Tray` once and keep a reference, or it's garbage-collected and vanishes [I]. Use an `.ico` with several sizes on Windows.
- Left click shows or focuses; the context menu has Quit and, when the local API module is present, its state and the stop action.
- Closing the last window either quits or hides to the tray. Pick one and say so in the UI; hiding silently is how apps end up running unnoticed.

### Deep links and single-instance forwarding

- Declare the scheme in `packagerConfig.protocols`; macOS reads it from `Info.plist` and Linux from the `.desktop` file at package time, while Windows registers at run time with `app.setAsDefaultProtocolClient` [V]. In dev on Windows the call needs the script path as an extra argument (`process.defaultApp`) [V].
- On macOS the running app gets `open-url`. On Windows and Linux the link starts a second process; take `app.requestSingleInstanceLock()` first, read the URL from `commandLine` in the `second-instance` event, focus a window, and let the second process quit [V].
- **A deep link is untrusted input** from any web page or program. Parse it with a strict schema, allow a fixed set of actions, and require a click inside the app for anything that changes state. Never pass it to a shell or `openExternal`.
- One lock per app: with the Clerk module, either let Clerk hold it or pass `manageSingleInstanceLock: false` and forward Clerk's callback yourself [V].
- In MSIX, `setAsDefaultProtocolClient` doesn't apply; the protocol is declared in the package manifest [V].

### Auto-start

- `app.setLoginItemSettings({ openAtLogin, args })` on Windows and macOS [V]. On macOS it's only reliable for a signed and notarised app [V].
- With Squirrel.Windows the registered path should be the stable launcher stub rather than the versioned exe, or the entry breaks on the next update [I, from Electron's own example].
- In MSIX, start-up is a manifest declaration and a system setting, not this API [I].
- Off by default, behind a visible setting. Start hidden only if a tray icon shows the app is running.

### MSIX and path virtualisation: read this before shipping MSIX

From Microsoft's MSIX docs [V]:

- On Windows 10 1903 and later, **new files and folders an MSIX app creates under `AppData` go to a private per-user, per-package location**, merged at run time so the app sees them in the usual place. "Other apps will not" see them. Changes to files that already exist are written through.
- Writes under `HKEY_CURRENT_USER` are copied on write to a private location too.
- On Windows 11 a package can declare specific `AppData` folders and `HKCU` keys as unvirtualised, or turn write virtualisation off altogether; both need the restricted `unvirtualizedResources` capability. Only locations inside `%USERPROFILE%\AppData` can be declared.
- Writes outside the package and outside `AppData` are allowed as normal.

What that does to an app that works with other apps:

- A config file the app writes "to `%APPDATA%\SomeTool`" isn't where the other tool, or the person's own terminal, will look. Public bug reports against one well-known MSIX-packaged Electron app describe exactly this: the settings button opens one copy of a config file while the app reads another, and programs the app launches see different files from the same programs started in a normal terminal [S].
- Reports disagree on whether child processes stay inside the package's view of the file system [S]. Assume neither; test it.
- A path the app hands to another program must be a real path that program can open.

Advice for the pack:

1. **Default to Squirrel.Windows.** It's an ordinary per-user install with ordinary paths.
2. If MSIX is required, keep any state shared with other programs **outside `AppData`** (for example a folder directly under the user profile), or declare the folders as excluded and test on both Windows 10 and 11.
3. Resolve every shared path in one function, and log the real path at start-up.
4. Add an e2e check on the installed MSIX: write a file from the app, read it from a separate ordinary process.

### Sources (Windows recipes)

- `electron/electron` `v45.4.1`: `docs/api/app.md` (`setAppUserModelId`, `setAsDefaultProtocolClient`, `setLoginItemSettings`), `docs/api/base-window.md` (`setAppDetails`), `docs/api/auto-updater.md` (the Squirrel id), `docs/tutorial/launch-app-from-url-in-another-app.md`, `docs/tutorial/windows-taskbar.md`.
- `MicrosoftDocs/win32` `docs`: `desktop-src/shell/appids.md`. `MicrosoftDocs/msix-docs` `main`: `msix-src/desktop/desktop-to-uwp-behind-the-scenes.md`, `msix-src/desktop/flexible-virtualization.md` (dated 2021-10-20).
- `clerk/clerk-docs` `main`: the OAuth deep links guide and the Electron overview FAQ.
- [S] Web search, 2026-11-22: public issue reports about an MSIX-packaged Electron app reading its config from the package's `LocalCache` folder.

---

## Recommended pack spec

### Pinned versions to verify

All read from npm on 2026-11-22 [V] unless marked. Pin each exactly; no `^`.

| Piece | Version | Re-check with |
|---|---|---|
| Electron | 45.4.1 (Chromium 156.0.8078.100, Node 24.22.3, from its `DEPS` file) | `npm view electron version` |
| Node for tooling | 24.x (Forge needs 22.13+; the web pack needs 22.18+) | `node -v` |
| `@electron-forge/cli`, `plugin-vite`, `plugin-fuses`, `plugin-auto-unpack-natives`, `maker-squirrel`, `maker-zip`, `maker-dmg`, `maker-deb`, `maker-rpm`, `publisher-github` | 8.0.1 | `npm view @electron-forge/cli version` |
| `@electron/fuses` | 2.1.3 | |
| `@electron/rebuild`, `@electron/asar`, `@electron/packager` | 4.2.1, 4.3.2, 20.3.0 (pulled in by Forge) | |
| `electron-squirrel-startup` | 1.0.1 | |
| TypeScript | **6.0.3** (npm `latest` is 7.0.2; follow the web pack) | read `stacks/tanstack-start/package.json` |
| Vite, `@vitejs/plugin-react` | 8.3.8, 6.3.0 | same file |
| React, TanStack Router and Query, Tailwind, shadcn/ui, Zod 4.6.7 | as the web pack | same file |
| ESLint 10, `typescript-eslint`, `eslint-plugin-boundaries` 7.4.4, Prettier | as the web pack | same file |
| Vitest | 5.1.1 | |
| `@playwright/test` | 1.65.1 | |
| Optional: `@xterm/xterm`, `addon-fit`, `addon-webgl`, `addon-serialize` | 6.0.0, 0.11.0, 0.19.0, 0.14.0 | |
| Optional: `node-pty` | 1.1.0 | `npm view node-pty dist-tags` |
| Optional: `@clerk/electron`, `electron-store` | 0.1.18 (beta), `8.x` (peer `^8.2.0`) | `npm view @clerk/electron version time peerDependencies` |
| Optional: `update-electron-app` | 3.3.0 | |
| Optional signing: `@electron/windows-sign`, `@electron/osx-sign`, `@electron/notarize` | 2.1.0, 2.7.2, 3.1.2 | |
| Not used: `electron-window-state` 5.0.3 (2022), `xterm` 5.3.0 (2024), `@electron-forge/template-vite-typescript` 7.11.2 (retired) | | |

### Folder tree

```
forge.config.mts                  makers, fuses (release and e2e profiles), the native-module copy hook
vite.main.config.mts  vite.preload.config.mts  vite.renderer.config.mts
tsconfig.json  tsconfig.main.json  tsconfig.preload.json  tsconfig.renderer.json
eslint.config.js  vitest.config.ts  playwright.config.ts
pnpm-workspace.yaml               nodeLinker: hoisted; allowBuilds for electron, electron-winstaller
.env.example                      names only, in the secrets skill's format
src/
  main/
    index.ts                      start-up order only: squirrel events, lock, schemes, security, windows
    composition.ts                the one place that builds adapters and wires services
    security/
      web-preferences.ts          the only builder of webPreferences
      harden-session.ts           permission handlers, download policy; used for every session
      navigation-guards.ts        will-navigate, will-redirect, window-open, will-attach-webview
      app-protocol.ts             app://renderer handler, path check, CSP header
      open-external.ts            the https-only wrapper
    ipc/
      register.ts                 the only ipcMain.handle; sender check, Zod parse, error envelope
    windows/
      window-manager.ts           creates windows; owns every view's lifetime
      window-state.ts             save, restore, clamp to a display
    modules/
      <feature>/
        <feature>.ipc.ts          route table
        <feature>.controller.ts
        <feature>.service.ts
        <feature>.<port>.ts  <feature>.<port>.<adapter>.ts  <feature>.<port>.memory.ts
  preload/
    index.ts                      contextBridge API generated from the contract
  renderer/                       the web pack's layout
    routes/  modules/<feature>/{ui,hooks,api.ts,schemas.ts,types.ts}
    components/ui/  components/  hooks/  lib/
  shared/
    ipc/contract.ts               channel names, input and output schemas
    errors.ts                     the one error envelope
optional/                         recipes, each with its own README, tests and boundary entries
  tabs/                           WebContentsView tabs, tear-off, re-attach
  web-tabs/                       remote content views, one partition per profile
  terminal/                       xterm.js + node-pty, env allowlist, flow control
  local-api/                      pipe or socket listener, pairing, banner, stop
  auth-clerk/                     the bridge, provider, CSP entries, IPC-backed API client
  windows-taskbar/  tray/  deep-links/  auto-start/  auto-update/
e2e/
  smoke.spec.ts  security.spec.ts  windows.spec.ts
scripts/
  verify-fuses.ts  smoke.ts  copy-natives.ts
.github/workflows/
  ci.yml                          pull requests: Linux, plus Windows when configured
  beta.yml                        main: make, artifacts, prerelease
  release.yml                     tags: matrix, signing off until the person says yes
```

The example module should exercise the main-side layers, which the web pack's `notes` example can't. Suggestion: a `settings` module (read and write a small JSON file through a port, validated, with a memory fake) for the core, and `notes` over `/api/v1` inside `optional/auth-clerk/`.

### Check-contract mapping, CI and release

As in section 7 (scripts and the two build flavours) and section 8 (beta channel and release). In one line each:

- `check` = lint (three boundary rules) → typecheck (three targets) → test → build (hardened package, fuses verified, smoke start).
- `test:e2e` = package the e2e flavour → Playwright against it.
- Pull requests: Linux always, Windows when the app needs it. `main`: beta prerelease. Tags: signed release after a human checklist.
- The human checklist before a release stays as the stub has it, plus: taskbar grouping and pins, a second monitor, and the Smart App Control state of the test PC.

### Corrections the stub pack needs

Applied to `stacks/electron-desktop/PACK.md` on 2026-11-23, together with the fact-check's corrections.

1. Scaffold command: `--template vite --typescript` on `create-electron-app@8.0.1`.
2. Version traps: TypeScript 6.0.3 and `plugin-react` 6.3.0 work with Forge 8; remove the "decide in step 3" trap, keep a note that Clerk's quickstart text predates Forge 8.
3. `@electron-forge/template-vite-typescript` row: replace with `@electron-forge/template-vite` 8.0.1.
4. "Those `/api/v1` routes are being added": they exist. The CORS item is answered by section 9, option A.
5. `test:e2e` and `build`: add the e2e fuse flavour and the smoke test.
6. Folder structure: add the main-side module layers and `security/`.
7. Clerk becomes an optional module.

---

## Risks

1. **Playwright's Electron support is experimental and needs a debug fuse.** The two-flavour answer is sound on paper and unbuilt. If Playwright can't see child views, e2e for tabs falls back to main-process evaluation.
2. **Native modules in a Forge + Vite package.** The plugin's code drops `node_modules`, though its docs say native modules mostly work; if spike S1 confirms the failure, the copy hook is the pack's own code and must be re-proved on every Forge upgrade.
3. **The local API.** Easy to build, easy to get wrong. A Node-created Windows pipe is weaker than it looks, loopback TCP is reachable from browsers, and nothing defends against software running as the same user. Ship it off by default, with the banner and stop switch, or not at all.
4. **Electron's pace.** A major every 8 weeks, three supported. Electron 46 removes the sync `safeStorage` API (confirmed in its alpha docs); Electron 45 already changed sandboxed preloads. A pack that isn't upgraded is out of support in about six months.
5. **Windows signing.** Price unverified, eligibility limited by country and by person versus company, and Smart App Control can block unsigned builds outright.
6. **Clerk's Electron SDK is beta**, forces `'unsafe-inline'`, takes the single-instance lock, and only answers a `BrowserWindow`'s main frame.
7. **Embedded sign-in to third-party sites** can be refused by the site at any time. The pack can't fix that and mustn't try to hide what it is.
8. **MSIX** silently changes where files go. Default to Squirrel.
9. **pnpm hoisting** inside a shared monorepo workspace.
10. **Agents can't see the desktop.** Taskbar, tray, prompts, monitors and installers need a person, every release.

## Before anyone builds

Four spikes, each a few hours, in this order. Each ends in a line in `docs/decisions.md`.

| Spike | Question | Done when |
|---|---|---|
| **S1** | Does a Forge 8 + Vite package with `node-pty` start and spawn a shell on Windows and Linux, with hardened fuses? | A packaged app echoes a line from a pty on both runners; note whether `@electron/rebuild` compiled anything |
| **S2** | Does Playwright launch the e2e flavour, and does it see child `WebContentsView`s as pages? | One spec opens the app, finds a child view, and reads its title on Linux `xvfb` and Windows |
| **S3** | Does a `WebContentsView` holding a WebGL terminal, and one holding a signed-in page, survive a move to another window and back on Windows, across two monitors with different scaling? Use the pack's route (`removeChildView`, then `addChildView` on another `BrowserWindow`'s `contentView`), not the upstream test's `setContentView` | A person watches it; state, scrollback and session all intact |
| **S4** | Does `@clerk/electron` 0.1.18 work on Forge 8 with TypeScript 6.0.3 and `plugin-react` 6.3.0, and does a token from it pass the web pack's `/api/v1` through the main-process route? Does an unsigned build keep its session across a restart on Electron 45 and on 46? | Sign in with an email code in a packaged build and list notes from a test deployment |

What this dossier could not verify at all, after the fact-check: the Azure Artifact Signing price and current eligibility; whether free signing for open-source projects is still offered; Google's current embedded sign-in policy text; Chrome's Local Network Access rollout details (secondary only); Node issue 47086 (secondary only); whether Forge 8's Vite package really drops a native module; whether `addChildView` re-parenting keeps the page; how reachable a Node-created named pipe is from another machine on a default Windows install; whether `node-pty` loads in a `utilityProcess`; whether killing a ConPTY ends all grandchildren; GitHub Actions run times; and anything that needs a real Windows desktop.

<sub>onRails · research dossier · 2026-11-22 · fact-checked 2026-11-23</sub>
