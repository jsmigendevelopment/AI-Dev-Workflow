> **Draft, 2026-11-22, fact-checked the same day** by an independent pass (see [Fact-check](#fact-check-2026-11-22)). Nothing in it has been built or run. Every version number was re-read from its registry and matched, apart from the notes below. **Still unverified:** the Azure Artifact Signing price, Fly.io and Railway pricing (third-party sources disagree), Unity's licence terms for CI machines, the Unity 6.6 release date and support window, Unity Build Automation's free minutes, Unity's MCP beta, Apple's payment rules, CPU per FastAPI request on Python Workers, and whether `clerk-backend-api` runs under Pyodide. (Whether the Clerk TanStack Start helper accepts header tokens was verified on 2026-11-23: it does.) Treat the picks as a starting point.

## Fact-check (2026-11-22)

**No recommended pick changes.** One of the two findings that affect the web pack is weaker than first written: Expo does **not** force the web app onto Expo's React version. Under pnpm's default isolated installs, `apps/web` can stay on React 19.3.1 while `apps/mobile` uses 19.3.0. A shared React version is still the simpler setup, but it is a choice, not a requirement (see the Monorepo gotchas). The other finding, that mobile and desktop need `/api/v1` server routes with Clerk bearer tokens, holds.

Corrections made in the text: the Expo SDK 55 date; Azure Artifact Signing eligibility; GameCI's docs and release lines (`@v5` exists, and some docs examples are `@v6`-only); the v6.0.0 date; the claim that the Electron renderer needs no changes from the web pack; the duplicate-React finding. Marks upgraded from [I] to [V] where checked: Clerk's iOS and Android SDKs, `turbo --affected`, Turborepo's MIT licence, pnpm catalogs, Google Play's $25 fee (secondary).

How it was checked: npm `dist-tags` and `time`, the PyPI JSON API, the crates.io API, the pub.dev API, the Flutter release feed, the Docker Hub tags API, `git ls-remote` and a bare clone for tag dates (the GitHub API was blocked), and docs source read from `raw.githubusercontent.com`. Claims about pages that could not be reached were searched on the web and are marked secondary.

| # | Claim | Verdict | Source | How checked |
|---|---|---|---|---|
| 1 | Expo 58.0.26 (2026-11-17); SDK 58 pins React Native 0.88.1, React 19.3.0, expo-router ~58.0.32, jest-expo ~58.0.15, expo-updates ~58.0.22, TypeScript ~6.0.3 | correct | npm; `expo/expo` `sdk-58` template `package.json` and `bundledNativeModules.json` | registry + raw GitHub |
| 2 | `@clerk/expo` 4.17.4 (2026-11-20), peer `expo >=54 <59` | correct | npm | `npm view … peerDependencies time` |
| 3 | eas-cli 27.11.0, uniwind 1.14.0 (MIT, peer `tailwindcss >=4`), nativewind 4.2.7 / 5.0.0-rc.1, RNTL 14.1.0, eslint-config-expo 58.0.4, eslint-plugin-boundaries 7.4.4, stripe-react-native 0.85.1 (SDK expects 0.81.0), react-native-purchases 11.0.4, Capacitor 8.6.2, reusables CLI 0.7.1 (2026-03-14), TypeScript latest 7.0.2 | correct | npm; `bundledNativeModules.json` | registry |
| 4 | Flutter 3.50.1 / Dart 3.14.0 (2026-11-20); `clerk_flutter` 0.0.18-beta (2026-07-17); patrol 4.11.0 | correct | Flutter release feed; pub.dev API | registry. Added: `clerk_flutter` is published by the verified publisher clerk.com, from the `clerk-community` GitHub org |
| 5 | Maestro CLI 2.12.1, 2 Nov | correct (2026-11-02) | `cli-2.12.1` tag | bare clone, tag date |
| 6 | Clerk has iOS and Android SDKs [I] | correct | `clerk/clerk-ios` (tags to 1.7.3), `clerk/clerk-android`, quickstarts in `clerk-docs` | git ls-remote + raw GitHub |
| 7 | New Architecture always on from SDK 55 | correct | `docs/pages/guides/new-architecture.mdx` | raw GitHub |
| 8 | "SDK 55 was current in January 2026" | **wrong → fixed** | npm `expo` time: 55.0.0 on 2026-02-25, 56 on 05-20, 57 on 06-30, 58 on 09-29 | registry |
| 9 | Expo `main` tracks React Native 0.89.0-rc.2 | correct | `main` template | raw GitHub |
| 10 | EAS Starter $19 with $45 credit; builds $1 to $4; Free can't be billed over. Free: 15 Android + 15 iOS builds, 1,000 update MAU | correct; the Free counts are secondary | `billing/plans.mdx`, `usage-based-pricing.mdx`; web search of expo.dev/pricing | raw GitHub + search |
| 11 | Expo Workflows: no matrix builds; a Maestro e2e job exists | correct | `eas/workflows/limitations.mdx`, `examples/e2e-tests.mdx` | raw GitHub |
| 12 | Maestro can't drive physical iOS devices | correct | Maestro `README.md` | raw GitHub |
| 13 | Clerk Expo traps: Native API, production domain, Native applications page, native components in beta | correct | `clerk-docs` Expo overview and deployment guide | raw GitHub |
| 14 | Apple Developer Program $99 a year | correct | Tauri `distribute/Sign/macos.mdx` | raw GitHub |
| 15 | Google Play $25 one-time [I] | correct (secondary) | Play Console help 6112435 | web search |
| 16 | Personal Play accounts after 2023-11-13: 12 testers for 14 days | correct (secondary) | Play Console help 14151465 | web search |
| 17 | Actions: Linux $0.006, Windows $0.010, macOS $0.062 a minute; Free includes $12 a month; macOS about ten times Linux | correct | `github/docs` reusables | raw GitHub |
| 18 | Apple IAP, US link-out ruling, EU terms of 2026-10-01 | unverifiable | — | not re-checked |
| 19 | Electron 45.4.1 (2026-11-19); a major every 8 weeks; latest three supported | correct | npm; `electron-timelines.md` | registry + raw GitHub |
| 20 | `@electron-forge/cli` 8.0.1 | correct | npm (published 2026-09-29) | registry. Note: `@electron-forge/template-vite-typescript` is still 7.11.2 on `latest` |
| 21 | electron-builder 26.18.0, electron-updater 6.8.11 | correct | npm `latest` (the `v26` tag is one patch ahead: 26.18.1, 6.8.12) | registry |
| 22 | `@clerk/electron` 0.1.18, beta, first published 2026-06-15, `electron-store@8` peer, the sign-in method limits, UI needs the network, no secret key in the app | correct | npm; `clerk-docs` Electron overview, quickstart, deployment guide | registry + raw GitHub |
| 23 | Tauri CLI 2.12.6, crate 2.12.7 (2026-11-18), updater plugin 2.14.1, `@wdio/tauri-service` 1.5.1, embedded driver covers macOS, `tauri-action@v1`, updater signature can't be disabled | correct | npm; crates.io; `tauri-docs` v2 | registry + raw GitHub |
| 24 | No official Clerk Tauri SDK; `tauri-plugin-clerk` 0.1.1 (2026-03-15) | correct | npm (it describes itself as "unofficial"; no `@clerk/tauri`) | registry |
| 25 | Wails v3.0.0 stable | correct | `wailsapp/wails` README | raw GitHub |
| 26 | Playwright's Electron support is "experimental" | correct | `automated-testing.md` | raw GitHub |
| 27 | update.electronjs.org: public repo, GitHub Releases, macOS and Windows, macOS signed | correct | `updates.md` | raw GitHub |
| 28 | Azure Artifact Signing: renamed Trusted Signing, "cheapest", removes SmartScreen warnings, limited countries | correct | `code-signing.md` | raw GitHub |
| 29 | Artifact Signing price | unverifiable | Azure pricing page shows the tiers (5,000 / 100,000 signatures) but no amounts | web search |
| 30 | Public-trust signing open to organisations in US, Canada, EU, UK; individuals in US and Canada | **wrong → fixed** (the organisation list is longer now; the individual rule holds) | Microsoft Learn quickstart (secondary) | web search |
| 31 | Since 2024 an EV certificate gives no instant SmartScreen reputation | correct | Tauri `distribute/Sign/windows.mdx` | raw GitHub. Note: Electron's `code-signing.md` still says EV has been required since June 2023, so the two docs conflict |
| 32 | Smart App Control blocks unsigned apps with no per-app override | correct | Tauri Windows signing doc | raw GitHub |
| 33 | The web pack's renderer stack carries over to Electron Forge unchanged [I] | **overstated → marked** | Clerk's Electron quickstart pins `@vitejs/plugin-react@4` and `typescript@5` because Forge's Vite template loads its config as CommonJS | raw GitHub |
| 34 | Vitest 5.1.1, Playwright 1.65.1, `@electron/fuses` 2.1.3, update-electron-app 3.3.0 | correct | npm | registry |
| 35 | A 15-minute release on three systems costs about $1.20 | correct ($1.17) | from row 17 | arithmetic |
| 36 | FastAPI 0.165.0 (2026-11-18, Python 3.11+), Litestar 2.25.0, Django 6.1.3, django-ninja 1.8.0, Flask 3.1.3, uvicorn 0.54.0, pydantic 2.14.4, pydantic-settings 2.16.3, ruff 0.17.6, pyright 1.1.414, mypy 2.4.1, ty 0.0.108, import-linter 2.17, uv 0.13.9, pytest 9.2.0, pytest-asyncio 1.5.0, httpx 0.28.1 (2024-12-06), schemathesis 4.34.0, poethepoet 0.49.0, clerk-backend-api 7.1.1, PyJWT 2.15.1, SQLAlchemy 2.1.9, psycopg 3.3.9, workers-py 1.17.9, anthropic 2.12.0, pydantic-ai 2.71.0 | correct | PyPI JSON API | registry |
| 37 | Python 3.15.2 and 3.14.10 are current | correct | `actions/python-versions` manifest | raw GitHub |
| 38 | Python Workers GA on 2026-09-21 | correct (secondary) | Cloudflare blog title, InfoQ, Simon Willison | web search |
| 39 | Python Workers docs: no beta label, Pyodide in a V8 isolate, package support "still in early stages", FastAPI via `asgi.entrypoint`, `requires-python >=3.13`, deploy-time memory snapshot | correct | `cloudflare-docs` Python pages | raw GitHub |
| 40 | Workers limits: 100,000 requests a day free, 10 ms CPU free / 5 min paid, 128 MB, 64 MiB, 1 s startup, 25 MiB per static asset | correct | `workers/platform/limits.mdx`, `pricing.mdx` | raw GitHub |
| 41 | Containers: none on Free, $5 Workers Paid, 25 GiB-hours, 375 vCPU-minutes, 200 GB-hours, billed per 10 ms | correct | `containers/platform/pricing.mdx` | raw GitHub |
| 42 | Cloudflare maintains `django-cf` | correct | `cloudflare/workers-py` README (`packages/django-cf`) | raw GitHub |
| 43 | Fly.io: no free tier. Railway: $1 Free, $5 Hobby | unverifiable (third-party sources conflict) | comparison sites | web search |
| 44 | ty's README says beta | correct | `astral-sh/ty` README | raw GitHub |
| 45 | uv's docs pin `setup-uv` v9.0.0 by hash | correct | `uv` `docs/guides/integration/github.md` | raw GitHub. Note: `setup-uv` tags reach v10.4.0, so pin the current release |
| 46 | `clerk-backend-api` has `authenticate_request` with authorized parties | correct | `clerk-sdk-python` README | raw GitHub |
| 47 | `clerk-backend-api` runs under Pyodide | unverifiable | — | needs a spike |
| 48 | import-linter has `layers`, `independence`, `forbidden` contracts | correct | `mkdocs.yml` | raw GitHub |
| 49 | CPU per FastAPI request on Pyodide | unverifiable | — | needs a measurement |
| 50 | Newest GameCI 6.3 image is 6000.3.29f1, with base, webgl, android, ios and windows-mono modules | correct (linux-il2cpp and mac-mono also exist) | Docker Hub tags API | registry |
| 51 | Unity 6.3 LTS supported until December 2027 | correct (secondary) | unity.com Unity 6 support page | web search |
| 52 | Unity 6.6 = 6000.6.0f1, 2026-08-31, an update release | unverifiable | Docker Hub has 6000.6.x images up to 6000.6.10f1; date and support window not found | registry + search |
| 53 | Unity 6.7 LTS in beta since 2026-11-19 | correct (secondary) | docs.unity.com "Unity 6.7 Beta User Manual"; Unity Discussions thread | web search |
| 54 | unity-builder v4.8.2 (September) backported the Unity 6.6 shared-memory fix | correct (2026-09-02) | tag commit message | bare clone |
| 55 | unity-builder v6.0.0 dated 10 Sep | **unverifiable → reworded** | the tag commit is dated 2026-08-29; the release page could not be read | bare clone |
| 56 | "GameCI's docs write `@v4` in every example" | **overstated → fixed** | `04-builder.mdx` has two `@v6`-only examples and covers `@v4`/`@v5`/`@v6` differences; a v5 line exists (5.0.0 on 2026-05-07, 5.0.1 on 2026-09-02) | raw GitHub + tags |
| 57 | `unity-test-runner@v4` | correct (latest stable v4.4.0; v5.0.0-beta.1 exists) | tags | git ls-remote |
| 58 | `unityVersion: auto` is the default | correct | `action.yml` | raw GitHub |
| 59 | Personal activation: `.ulf` in a secret, sign out of Hub, Discord for missing `.ulf` | correct | `02-activation.mdx` | raw GitHub |
| 60 | Unity Personal is for revenue and funding under $200,000 | correct (secondary) | unity.com Personal page | web search |
| 61 | Personal licence allowed on hosted CI? | unverifiable | — | not found |
| 62 | LFS: 10 GiB storage and 10 GiB bandwidth; blocked at a $0 budget. Actions cache 10 GB per repo | correct | `github/docs` | raw GitHub |
| 63 | Unity MCP in `com.unity.ai.assistant` 2.0, beta since May 2026 | unverifiable | — | not re-checked |
| 64 | Unity Build Automation: 100 free Mac minutes from 2026 | unverifiable | — | not re-checked |
| 65 | pnpm 12.21.0, turbo 2.11.13 (2026-11-18), nx 24.0.6 (2026-11-10), dependency-cruiser 18.9.0, syncpack 15.3.4, sherif 1.13.0, `@nx/eslint-plugin` 24.0.6 | correct | npm | registry |
| 66 | `turbo boundaries` is experimental and checks outside-folder imports, undeclared dependencies and tags | correct | `reference/boundaries.mdx` | raw GitHub |
| 67 | Turborepo doesn't support nested packages and recommends `exports` | correct | `structuring-a-repository.mdx` | raw GitHub |
| 68 | Vercel Remote Cache free on all plans; `actions/cache` guide | correct | `remote-caching.mdx`, `ci-vendors/github-actions.mdx` | raw GitHub |
| 69 | `turbo run --affected` [I] | correct | `reference/run.mdx` | raw GitHub |
| 70 | Turborepo is MIT [I] | correct | npm licence field, `LICENSE` | registry + raw GitHub |
| 71 | pnpm catalogs live in `pnpm-workspace.yaml` [I] | correct | `pnpm/pnpm.io` `docs/catalogs.md` | raw GitHub |
| 72 | Expo: isolated installs from SDK 54, `nodeLinker: hoisted` escape hatch, no `watchFolders` needed, `autolinkingModuleResolution` | correct | `guides/monorepos.mdx` | raw GitHub |
| 73 | The web pack pins pnpm 12.21.0 and React 19.3.1 and has a `pnpm-workspace.yaml` | correct | `stacks/tanstack-start/package.json` | this repo |
| 74 | **Finding (a):** mobile and desktop need `/api/v1` server routes with a Clerk bearer token, not server functions | correct; reworded from "can't" to "aren't meant to" | TanStack `server-functions.md` ("same-origin RPC… use server routes for public APIs"), `server-routes.md`; Clerk `making-requests.mdx` | raw GitHub |
| 75 | **Finding (b):** React 19.3.1 vs 19.3.0 in one monorepo breaks at runtime | **overstated → fixed** | Expo's monorepo guide says duplicate React *in a single app* causes errors. Separate apps can differ under isolated installs. The risk is real only with `nodeLinker: hoisted` or a shared package that bundles React | raw GitHub |
| 76 | `@clerk/tanstack-react-start` `auth()` accepts a header bearer token | **correct (verified 2026-11-23)** | Source: `clerkMiddleware` calls `authenticateRequest` with `acceptsToken: 'any'`, and a token in the `Authorization` header wins over the session cookie | spike on the built Worker with a self-signed `CLERK_JWT_KEY`: on `/api/v1`, a valid token gave 200, an expired token 401, and a cookie alone 401 |

**Totals: 76 claims.** 61 correct (7 of them rest wholly or partly on secondary sources), 2 wrong and fixed, 3 overstated and fixed or marked, 10 unverifiable (one of them, row 55, reworded to what could be checked). Row 76 was verified later, on 2026-11-23.

# Platform packs: research dossier

**Question:** which stack pack should the kit build for mobile, desktop, Python services, Unity and a monorepo, so each meets the check contract (`check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`), has decoupled features with a boundary check in lint, CI on GitHub Actions and a deploy path?

**Date:** 2026-11-22. Everything below is as of that day. Re-check versions and prices before building a pack.

**Constraints used:** Cloudflare first where it's free, no Vercel or Next.js (since relaxed: Next.js is now a supported alternative to TanStack Start), Clerk for auth, Stripe for money, and the owner's values: popular and maintained, typed, AI-friendly, testable, cheap.

## How to read the evidence marks

| Mark | Meaning |
|---|---|
| **[V]** | Verified today against a primary source: the npm, PyPI, crates.io, pub.dev or Docker Hub registry API, or the project's own docs source in its GitHub repo. |
| **[S]** | Secondary: a web-search summary of an official page I could not open, or a third-party write-up. Treat as a lead, not a fact. |
| **[I]** | Inferred from how the tools work, or from my training knowledge (cut-off mid-2026). Not checked today. |

**What I could not open.** This session's network only reached package registries, `raw.githubusercontent.com`, `github.com` and Docker Hub. These sites were blocked: `expo.dev`, `docs.expo.dev`, `clerk.com`, `developers.cloudflare.com`, `blog.cloudflare.com`, `docs.github.com`, `tauri.app`, `game.ci`, `unity.com`, `docs.unity3d.com`, `fly.io`, `railway.com`, `learn.microsoft.com`, `turborepo.com`, `nx.dev`. Where a project keeps its docs in a public GitHub repo I read the source files there instead, which is why many citations are repo paths. Pricing pages that exist only on the blocked sites are marked [S]. No experiment was run: nothing below was installed, built or deployed.

## Summary

| Platform | Recommended pack | Runner-up | Confidence | Biggest risk |
|---|---|---|---|---|
| Mobile | **Expo SDK 58** (React Native 0.88, Expo Router, `@clerk/expo`, Uniwind, Jest, Maestro, EAS) | Flutter 3.50 | **High** for Expo; medium for the styling and e2e-in-CI details | SDK upgrade treadmill; iOS CI cost; App Store payment rules |
| Desktop | **Electron 45 + Electron Forge 8** (Vite, React, `@clerk/electron`, Vitest, Playwright) | Tauri 2.12 | **Medium** | Clerk's Electron SDK is beta; signing costs money; 100 MB+ installers |
| Python service | **FastAPI 0.165 + uv + ruff + pyright + pytest + import-linter**, deployed to Cloudflare Python Workers when the dependencies allow, a container otherwise | Litestar 2.25 | **High** for the code stack; **medium-low** for Python Workers as the deploy target | Pyodide package gaps; no free container hosting on Cloudflare |
| Unity | **Unity 6.3 LTS + GameCI on GitHub Actions**, assembly definitions as modules, EditMode and PlayMode tests | Unity Build Automation | **Medium** for CI; **low** for "an agent can build the game alone" | Personal licence in CI; agents can't see or safely edit scenes |
| Monorepo | **pnpm 12 workspaces + Turborepo 2.11** | Nx 24 | **High** | React version coupling between web and Expo (a choice, not forced; see the fact-check); `turbo boundaries` is experimental |

Build order I'd suggest: monorepo first (it changes where the others live), then mobile, Python, desktop, Unity.

Two findings that change the existing web pack:

1. **Mobile and desktop shouldn't call TanStack Start server functions.** TanStack's docs call them same-origin RPC for the Start app itself and say to use server routes for anything called from outside it, so these clients need plain HTTP routes. The web pack should grow a `/api/v1/*` layer of server routes that call the same services and accept a Clerk bearer token. See [Mobile](#1-mobile-ios-and-android).
2. **The web pack pins React 19.3.1; Expo SDK 58 pins 19.3.0.** *Fact-check: overstated.* Expo's docs say duplicate React versions **in a single app** cause runtime errors. Two apps in one monorepo can keep different versions under pnpm's default isolated installs. It only breaks if the repo falls back to `nodeLinker: hoisted`, or a shared package ships React itself instead of declaring it as a peer. One shared version is still the simpler choice, but the web pack doesn't have to change. See [Monorepo](#5-monorepo-web-mobile-shared-packages).

---

## 1. Mobile (iOS and Android)

### Options compared

| | Expo (React Native) | Flutter | Native Swift + Kotlin |
|---|---|---|---|
| Current version | Expo SDK 58.0.26 (2026-11-17), React Native 0.88.1 [V] | Flutter 3.50.1, Dart 3.14.0 (2026-11-20) [V] | Not checked today |
| Language shared with the web pack | TypeScript, React, zod, TanStack Query | None (Dart) | None |
| Clerk | `@clerk/expo` 4.17.4 (2026-11-20), official, GA; native components in beta [V] | `clerk_flutter` 0.0.18-beta, last published 2026-07-17, from the verified publisher clerk.com but kept in the `clerk-community` GitHub org [V] | Clerk has iOS (`clerk/clerk-ios`, 1.7.3) and Android (`clerk/clerk-android`) SDKs with quickstarts [V, fact-check] |
| Build and release | EAS Build, Submit and Update; or `eas build --local` on your own runner | `flutter build` + fastlane or a paid CI | Xcode + Gradle + fastlane, twice |
| OTA updates | Built in (EAS Update) | Third-party only (Shorebird) [I] | None |
| Unit tests | Jest via `jest-expo` | `flutter test` (very good) | XCTest + JUnit |
| E2E | Maestro (framework-agnostic) | Maestro or Patrol 4.11.0 [V] | XCUITest + Espresso, or Maestro |
| Codebases to keep | 1 | 1 | 2 |
| Agent fit | Same language and patterns as the web pack; one module layout to learn | Good tooling, but a second language, second lint and test stack | Two of everything |

**Recommendation: Expo.** The deciding facts are not popularity:

- It's the only option where the mobile app shares a language, the zod schemas, the API client and the Clerk mental model with the web pack.
- Clerk's Flutter SDK is a beta that hasn't shipped in four months. Choosing Flutter means building auth by hand or betting on that beta.
- Build, signing, store submission and OTA updates come from one vendor with a free tier, and can also run on plain GitHub Actions.

Flutter is the right pick only when the person already works in Dart or doesn't use Clerk. Native is right for apps that are mostly platform APIs (widgets, watch apps, heavy camera or AR work).

Not compared in depth: Capacitor 8.6.2 [V], which wraps the web app in a web view. It reuses the most code but gives a web-feeling app; worth a look for internal tools only.

### Recommended stack and versions

| Piece | Pick | Version | Mark |
|---|---|---|---|
| Framework | Expo | 58.0.26 | [V] npm |
| React Native | bundled by SDK 58 | 0.88.1 | [V] `sdk-58` branch |
| React | bundled by SDK 58 | 19.3.0 (not 19.3.1) | [V] |
| Router | Expo Router | 58.0.32 | [V] |
| TypeScript | as the SDK 58 template | ~6.0.3 (npm `latest` is 7.0.2; the template has not moved) | [V] |
| Auth | `@clerk/expo` + `expo-secure-store` | 4.17.4; peer range `expo >=54 <59` | [V] |
| Data | `@tanstack/react-query` + zod | 5.108.3, 4.6.7 (same as web pack) | [V] |
| Styling | Uniwind (Tailwind 4 for React Native, MIT) | 1.14.0; peer `tailwindcss >=4` | [V] |
| Unit tests | `jest-expo` + `@testing-library/react-native` | ~58.0.15, 14.1.0 | [V] |
| E2E | Maestro CLI | 2.12.1 (2 Nov) | [V] GitHub releases page; year not shown |
| Lint | ESLint 10 + `eslint-config-expo` 58.0.4 + `eslint-plugin-boundaries` 7.4.4 + Prettier | | [V] |
| Build and release | `eas-cli` | 27.11.0 | [V] |
| OTA | `expo-updates` | 58.0.22 | [V] |
| Payments | `@stripe/stripe-react-native` (SDK 58 expects 0.81.0; npm latest 0.85.1) or `react-native-purchases` 11.0.4 | | [V] |

Notes:

- **Use `npx expo install`, not `pnpm add`, for anything native.** It picks the version SDK 58 expects. The Stripe row shows why: latest on npm is ahead of what the SDK was tested with.
- **New Architecture is not optional.** From SDK 55 it's always on and can't be turned off [V]. Any library that still needs the old architecture is out.
- **Styling is the least certain pick.** NativeWind stable (4.2.7) still targets Tailwind 3 and its v5 is at `5.0.0-rc.1` [V]. Uniwind's peer dependency is Tailwind 4, which matches the web pack's 4.3.5, and Expo's own Tailwind guide names both [V]. I did not test Uniwind. The shadcn-style kit for React Native, `@react-native-reusables/cli`, last shipped 2026-03-14 [V], so I would not depend on it; copy a small set of components into the pack instead.
- **Jest, not Vitest.** Expo's official unit-test path is the `jest-expo` preset, which mocks the native side [V]. This is one place the mobile pack differs from the web pack on purpose.
- **Naming drift.** Expo's docs now say "Expo Build", "Expo Update", "Expo Workflows" and "Expo Services" where they used to say EAS [V]. The CLI is still `eas`.

### Folder structure

```
apps/mobile/                     (or the repo root, when there is no monorepo)
  app.json  eas.json  metro.config.js  eslint.config.js  jest.config.js
  .maestro/                      e2e flows, one YAML per journey
  src/
    app/                         Expo Router routes: thin, like src/routes in the web pack
      _layout.tsx                ClerkProvider, QueryClientProvider
      (auth)/  (tabs)/
    modules/
      notes/                     the example module, same name as the web pack's
        ui/  hooks/              screens' parts and query hooks
        api.ts                   calls /api/v1/notes through lib/api-client
        schemas.ts  types.ts     or re-exports from packages/contract in a monorepo
    components/ui/               the copied UI kit
    components/  hooks/  lib/    shared pieces; lib/api-client.ts adds the bearer token
```

The module rule is the web pack's: routes import modules, modules import shared folders, modules never import each other. There is no server layer on the device, so the controller, service and repository chain stays in the backend; a mobile module is `ui`, `hooks` and `api`.

### Check contract

| Command | Runs | Needs |
|---|---|---|
| `lint` | `eslint . --max-warnings=0 && prettier --check .` (boundaries rule included) | Linux |
| `typecheck` | `tsc --noEmit` | Linux |
| `test` | `jest` (the `jest-expo` preset) | Linux |
| `build` | `expo export --platform all`: bundles the JS for both platforms and fails on a broken import. It does **not** compile native code. | Linux |
| `check` | `lint && typecheck && test && build`, plus `npx expo-doctor` | Linux |
| `test:e2e` | `maestro test .maestro` against an installed build | An emulator or simulator |
| (release) | `eas build`, `eas submit`, `eas update` | EAS, or macOS for iOS |

Making `build` the JS export keeps `check` fast and free on a Linux runner and inside an agent's sandbox. The native binary is a release step, not a check. That is a judgement call; the gap it leaves is a native build break that only shows up at release, which `expo-doctor` and a nightly native build narrow.

### Reusing the web pack's backend and auth

1. **Add HTTP routes to the web pack.** Server functions are an internal RPC for the web app. TanStack Start server routes (`createFileRoute('/api/v1/notes')({ server: { handlers: { GET, POST } } })`) are the documented way to expose HTTP endpoints [V]. Each handler is a controller that calls the module's existing service. The services don't change.
2. **Send a bearer token.** On the device, `useAuth().getToken()` returns the Clerk session token; send it as `Authorization: Bearer <token>`. Clerk documents exactly this for cross-origin clients [V]. Session tokens are short-lived, so fetch a fresh one per request rather than caching it [I].
3. **Verify on the server** with the Clerk backend SDK's request authentication, which reads the header as well as the cookie, and set authorized parties [V; on 2026-11-23 the TanStack Start helper was checked on a built Worker and accepts header tokens].
4. **Share the contract, not the UI.** Put the zod schemas and a typed fetch client in one shared package. Don't try to share components between web and native in the first version.

Clerk setup traps, all from Clerk's docs [V]:

- Turn on the **Native API** for the Clerk application, in development and again in production.
- A production Clerk instance **needs a domain** even if there's no website.
- Hosted sign-in, native components and native Google or Apple sign-in need the app registered on Clerk's **Native applications** page (bundle ID and team ID for iOS; package name for Android).
- Three ways to do the sign-in UI: hosted (in-app browser, works in Expo Go), native components (SwiftUI and Jetpack Compose, **beta**, needs a development build), or a custom flow. Start with hosted: least code, every sign-in method works.

### Build, signing and release

- **EAS Build** makes the binaries in the cloud and manages signing credentials, so nobody needs a Mac or a keystore file in the repo. **EAS Submit** uploads to the stores. **EAS Update** ships JS and asset changes without a store review.
- **OTA rule:** an update may only change JS and assets. Anything native (a new native module, a permission, an SDK upgrade) needs a new binary. Use the `fingerprint` runtime version policy so an update never lands on a binary it doesn't match [I].
- **Without EAS quota:** `eas build --local` runs the same build on your own runner. iOS still needs macOS.
- **Stores:** Apple Developer Program is $99 a year [V via Tauri's signing doc]. Google Play is a $25 one-time fee [S, Play Console help, fact-check]. A **personal** Play account created after 2023-11-13 must run a closed test with 12 testers for 14 days before it can publish to production [S, Google's help page]. That adds two weeks to a first Android launch; an organisation account avoids it.

### CI and cost

| Job | Runner | Cost on a private repo |
|---|---|---|
| lint, typecheck, test, JS build | `ubuntu-latest` | $0.006 a minute [V] |
| Android e2e (emulator + Maestro) | `ubuntu-latest` with KVM | $0.006 a minute; expect 15 to 25 minutes a run [I] |
| iOS build or e2e | `macos-latest` | $0.062 a minute [V], ten times Linux |
| Either, on Expo Workflows | Expo's machines | Free plan reported as 60 CI minutes a month [S] |

- GitHub Free includes **$12 of Actions compute a month** on private repos, which is 2,000 Linux minutes or about 190 macOS minutes. Standard runners are free on public repos [V, `github/docs` source].
- EAS free plan: reported as **15 Android and 15 iOS builds a month**, low priority, no overage charges [S for the counts; V that the free plan exists, resets monthly and can't be billed over]. EAS Update free: 1,000 monthly active users [S, quoting Expo's docs]. Starter is $19 a month with $45 of build credit and 3,000 update users [V]. On-demand builds cost $1 to $4 each [V].
- Suggested split: every pull request runs the Linux jobs; Android e2e runs on pull requests that touch `apps/mobile`; iOS e2e runs nightly or before a release, through an Expo Workflows Maestro job [V that this job type exists] or a macOS runner.
- Expo Workflows has no matrix builds yet [V].

### Risks and immature parts

- **Upgrade treadmill.** SDK 55 shipped on 2026-02-25, SDK 56 on 05-20, SDK 57 on 06-30 and SDK 58 on 09-29 [V, npm; fact-check corrected "SDK 55 was current in January": SDK 54 was]. SDK 58 is current in November, and Expo's `main` branch already tracks React Native 0.89.0-rc.2 [V]. Plan an SDK upgrade roughly every quarter. `@clerk/expo` caps at `expo <59`, so the SDK 59 upgrade waits on Clerk [V].
- **Payments.** Apple still requires In-App Purchase to unlock digital content; a US court ruling allows links out to web checkout, and EU terms changed again on 2026-10-01 [S]. Stripe in-app is fine for physical goods and real-world services. For digital goods, ask the person before building; this is a money decision, not a technical one.
- **Agents can't see the app.** An agent in a Linux sandbox can run lint, types, Jest and the JS export, but not a simulator. Maestro in CI is the only eyes it has, so e2e flakiness costs more here than on web.
- **Maestro can't drive physical iOS devices** [V, its README].
- **Styling pick is untested** (see above).

**Confidence: high** that Expo is the right base. **Medium** on Uniwind and on how stable Android-emulator e2e is on free runners.

### Sources (mobile)

- npm registry API, read 2026-11-22: `expo`, `react-native`, `expo-router`, `@clerk/expo` (versions, peer dependencies, publish dates), `eas-cli`, `jest-expo`, `@testing-library/react-native`, `uniwind`, `nativewind` (dist-tags), `@react-native-reusables/cli`, `expo-updates`, `@stripe/stripe-react-native`, `react-native-purchases`, `eslint-config-expo`, `detox`, `@capacitor/core`.
- `expo/expo` on GitHub, `sdk-58` branch: `templates/expo-template-default/package.json`, `packages/expo/bundledNativeModules.json`; `main` branch: same template (React Native 0.89.0-rc.2). Read 2026-11-22.
- `expo/expo` docs source, `main`: `docs/pages/guides/new-architecture.mdx`, `guides/monorepos.mdx`, `guides/tailwind.mdx`, `develop/unit-testing.mdx`, `develop/authentication.mdx`, `eas/workflows/examples/e2e-tests.mdx`, `eas/workflows/limitations.mdx`, `billing/plans.mdx`, `billing/usage-based-pricing.mdx`. Read 2026-11-22.
- `clerk/clerk-docs` on GitHub: `docs/getting-started/quickstart.expo.mdx`, `docs/reference/expo/overview.mdx`, `docs/guides/development/deployment/expo.mdx`, `docs/guides/development/making-requests.mdx`, `docs/guides/sessions/session-tokens.mdx`. Read 2026-11-22.
- `TanStack/router` on GitHub: `docs/start/framework/react/guide/server-routes.md`. Read 2026-11-22.
- Flutter release feed, `storage.googleapis.com/flutter_infra_release/releases/releases_linux.json`; pub.dev API for `clerk_flutter`, `patrol`. Read 2026-11-22.
- `mobile-dev-inc/Maestro` on GitHub: releases page and `README.md`. Read 2026-11-22.
- `github/docs` on GitHub: `data/reusables/billing/actions-standard-runner-prices.md`, `actions-included-quotas.md`, `content/billing/concepts/product-billing/github-actions.md`. Read 2026-11-22.
- [S] Web search summaries of `expo.dev/pricing`, Google Play Console help (answer 14151465), Apple's EU payment pages and TechCrunch (2025-05-02) on US App Store links. Searched 2026-11-22.

---

## 2. Desktop (Windows, macOS, Linux)

### Options compared

| | Electron | Tauri 2 | Wails 3 |
|---|---|---|---|
| Current version | 45.4.1 (2026-11-19) [V] | CLI 2.12.6, crate 2.12.7 (2026-11-18) [V] | v3.0.0, marked stable in its README [V] |
| Backend language | TypeScript (Node) | Rust | Go |
| Rendering | Bundled Chromium, identical on all three systems | The system web view: WebView2, WKWebView, WebKitGTK. Three engines. | System web view |
| Installer size | Roughly 80 to 150 MB [I] | A few MB to about 15 MB [I]; Tauri's docs call its binaries "very small" [V] | Small [I] |
| Clerk | `@clerk/electron` 0.1.18, **official, beta**, first published 2026-06-15 [V] | No official SDK. Community `tauri-plugin-clerk` 0.1.1, last published 2026-03-15 [V] | None found |
| E2E | Playwright (Electron support is "experimental" per Electron's docs) or WebdriverIO [V] | WebdriverIO with `@wdio/tauri-service` 1.5.1; an embedded driver now covers macOS too [V]. Not Playwright. | Nothing official [I] |
| Auto-update | Built in (Squirrel) on macOS and Windows; free hosted service for public repos [V] | Updater plugin 2.14.1, signature check can't be disabled, static JSON on any host [V] | Not checked |
| Packaging in CI | Electron Forge makers | `tauri-apps/tauri-action@v1` [V] | Own CLI |
| Agent fit | One language, the web pack's test tools, one rendering engine | Rust for anything native; slow first compile; UI bugs that appear on only one system | Go; smallest community |

**Recommendation: Electron with Electron Forge**, for this kit, at medium confidence. This goes against the size argument, so here is the reasoning:

- **Clerk.** Electron has an official SDK with documented main, preload and renderer entry points and encrypted token storage. Tauri has a stale community plugin. Auth is the part most likely to be got wrong, and the kit's default is Clerk.
- **One language and one test stack.** The main process, preload and renderer are all TypeScript; Vitest and Playwright carry over from the web pack. With Tauri, every native feature is Rust behind a command, and e2e moves to WebdriverIO.
- **One rendering engine.** An agent testing on a Linux runner sees what Windows and macOS users see. With system web views, a layout bug in WebKitGTK or Safari's engine won't show up in the Linux CI run that the agent can read.

What Tauri wins on is real: installers ten times smaller, lower memory use, a deny-by-default capability model, and an updater that needs no server. **Pick Tauri instead when** download size or memory matters to the product, the app doesn't need Clerk's prebuilt UI, or the person already writes Rust. If Clerk ships an official Tauri SDK, redo this comparison.

### Recommended stack and versions

| Piece | Pick | Version | Mark |
|---|---|---|---|
| Runtime | Electron | 45.4.1 (supported: the latest three majors; a new major every 8 weeks) | [V] |
| Tooling | `@electron-forge/cli` with the Vite plugin | 8.0.1 | [V] |
| Renderer | React 19 + TanStack Router and Query + Tailwind 4 + shadcn/ui, as a client-only Vite app | as the web pack | [V] versions. *Fact-check: "needs no changes" is overstated.* Clerk's Electron quickstart pins `@vitejs/plugin-react@4` and `typescript@5`, because Forge's Vite template loads its config as CommonJS. Forge's `template-vite-typescript` is still 7.11.2 on npm. Expect to adjust the Vite config, or the plugin and TypeScript versions, before reusing the web pack's 6.0.3 setup. |
| Auth | `@clerk/electron` + `electron-store@8` | 0.1.18; Clerk's docs name `electron-store@8` as the peer, though npm latest is 12.0.0 | [V] |
| Hardening | `@electron/fuses` | 2.1.3 | [V] |
| Updates | `update-electron-app` (public repo) or a static feed on R2 | 3.3.0 | [V] |
| Tests | Vitest 5.1.1; Playwright 1.65.1 driving the Electron app | | [V] versions |
| Lint | ESLint 10 + `eslint-plugin-boundaries` + Prettier | | [V] |

Electron Forge over electron-builder (26.18.0 [V]) because Forge is the Electron project's own tool and it's what Clerk's quickstart and deployment guide are written for [V]. electron-builder's `electron-updater` 6.8.11 is the better choice if Linux auto-update is a requirement [I].

### Folder structure

```
apps/desktop/
  forge.config.ts  vite.main.config.ts  vite.preload.config.ts  vite.renderer.config.ts
  src/
    main/                        Node side: windows, menus, updates, createClerkBridge()
      ipc/                       one file per channel group; the only door into Node
    preload/                     exposeClerkBridge() and a typed, narrow API
    renderer/                    the React app, laid out like the web pack
      routes/  modules/  components/ui/  components/  hooks/  lib/
    shared/                      IPC channel names and zod schemas, used by both sides
  e2e/                           Playwright specs
```

Two boundary rules, both in `eslint-plugin-boundaries`:

1. The web pack's module rule inside `renderer/`.
2. A process rule: `renderer/` may never import `electron`, `node:*` or anything under `main/`; `main/` never imports `renderer/`; both may import `shared/`. This is the rule that keeps Node out of the page, so it is also a security check.

### Check contract

| Command | Runs |
|---|---|
| `lint` | `eslint . --max-warnings=0 && prettier --check .` |
| `typecheck` | `tsc -p` for each of main, preload and renderer |
| `test` | `vitest run` (renderer logic, IPC handlers with fakes) |
| `build` | `electron-forge package`: a runnable app folder, no installer, no signing |
| `test:e2e` | `playwright test` launching the packaged app; under `xvfb-run` on Linux |
| `check` | `lint && typecheck && test && build` |
| (release) | `electron-forge publish` on a three-system matrix, with signing secrets |

### Code signing

Unsigned apps are not a real option for strangers: macOS blocks them, Windows SmartScreen warns, and Windows 11 Smart App Control blocks them outright with no per-app override [V, Tauri's Windows signing doc].

| System | What you need | Cost | Mark |
|---|---|---|---|
| macOS | Apple Developer Program, a Developer ID Application certificate, notarisation. Forge wraps `@electron/osx-sign` and `@electron/notarize`. | $99 a year | [V] |
| Windows | **Azure Artifact Signing** (the renamed Trusted Signing). Electron's docs call it the cheapest option and say it removes SmartScreen warnings. Limited to certain countries. | Price not verified: the pricing page shows two tiers with 5,000 and 100,000 signatures a month but I could not read the amounts [S]. Earlier public pricing was about $10 a month [I]. | [V] for the description |
| Windows, otherwise | An OV or EV certificate from a certificate authority. Since 2024 an EV certificate no longer gives instant SmartScreen reputation. | Roughly $200 to $500 a year [I] | [V] for the EV change, from Tauri's doc. Electron's `code-signing.md` still says EV has been required since June 2023, so the two docs conflict; trust Tauri's, which cites Microsoft. |
| Linux | Nothing required | Free | [I] |

**Eligibility gap:** Microsoft's Artifact Signing quickstart says public-trust signing is open to organisations in the US, Canada, the EU, the UK, Australia, New Zealand, Japan, South Korea, Singapore, Switzerland, Norway and Israel, and to individual developers only in the US and Canada [S, fact-check; the draft listed only the US, Canada, EU and UK for organisations, from an older version of that page]. Private-trust certificates have no country limit but don't remove SmartScreen warnings for the public [I]. An individual elsewhere may need a company or a classic certificate. Ask the person where they are before promising a signed Windows build.

Signing is spending money, so by the kit's rules the pack stops and asks before it sets any of this up. The pack should ship with signing off and a release checklist.

### Auto-update

- **Public repo:** `update-electron-app` with update.electronjs.org. Free, run by the Electron team, reads GitHub Releases. macOS and Windows only, and macOS builds must be signed [V].
- **Private repo:** point Electron's updater at a static folder. Electron documents static-storage updates with an S3-style base URL [V]; R2 is S3-compatible, so this should work from R2 with no egress fee [I, not tested].
- **Linux:** no built-in updater in this setup. Ship a `.deb`, `.rpm` or Flatpak and let the package manager update it [I].

### CI

- Pull requests: lint, typecheck, test, `package` and e2e on `ubuntu-latest` only.
- Release tag: a matrix of `macos-latest`, `windows-latest` and `ubuntu-latest` running `electron-forge publish`. You cannot cross-build a signed macOS app from Linux [I].
- Cost on a private repo: Windows $0.010 a minute, macOS $0.062 a minute [V]. A release that takes 15 minutes per system costs about $1.20. Free on a public repo.

### Risks and immature parts

- **`@clerk/electron` is beta and five months old.** Its docs warn that patch releases can change behaviour. OAuth works only in a packaged app served from a custom scheme, not in development; email links, Google One Tap and Web3 are unsupported; SMS codes, SAML and passkeys are "not verified". Clerk's UI loads from the network, so sign-in screens don't render offline [all V]. Pin the exact version.
- **Playwright's Electron support is labelled experimental** in Electron's own docs [V]. WebdriverIO is the documented fallback.
- **Electron moves fast.** A major every 8 weeks, and only three are supported [V], so a pack goes out of support in about six months without upgrades.
- **Size.** Every install and every update is a Chromium download.
- **Secrets.** Never put `CLERK_SECRET_KEY` or any server secret in a desktop app; Clerk's guide says so directly [V]. The desktop app is a client of the web pack's API, like mobile.

**Confidence: medium.** The pick depends on Clerk; without Clerk in the picture this would be closer to a coin flip with Tauri, and Tauri would win for anyone who cares about size.

### Sources (desktop)

- npm registry API, read 2026-11-22: `electron`, `@electron-forge/cli`, `electron-builder`, `electron-updater`, `@clerk/electron` (version, created date), `electron-store`, `update-electron-app`, `@electron/fuses`, `@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-updater`, `@wdio/tauri-service`, `tauri-plugin-clerk`, `@playwright/test`, `vitest`.
- crates.io API, read 2026-11-22: `tauri`, `tauri-cli`, `tauri-plugin-updater`, `tauri-plugin-wdio-webdriver`.
- `electron/electron` on GitHub, `main`: `docs/tutorial/electron-timelines.md`, `code-signing.md`, `updates.md`, `automated-testing.md`. Read 2026-11-22.
- `clerk/clerk-docs` on GitHub: `docs/reference/electron/overview.mdx`, `docs/getting-started/quickstart.electron.mdx`, `docs/guides/development/deployment/electron.mdx`. Read 2026-11-22.
- `tauri-apps/tauri-docs` on GitHub, `v2`: `distribute/Sign/windows.mdx`, `distribute/Sign/macos.mdx`, `distribute/Pipelines/github.mdx`, `plugin/updater.mdx`, `develop/Tests/index.mdx`, `develop/Tests/WebDriver/index.mdx`, `concept/size.mdx`. Read 2026-11-22.
- `wailsapp/wails` on GitHub: `README.md`. Read 2026-11-22.
- [S] Web search summaries of Azure's Artifact Signing pricing page and a Microsoft Learn Q&A thread (March 2026). Searched 2026-11-22.

---

## 3. Backend and AI services in Python

**First question to ask the person:** does this need Python at all? A service that only calls model APIs over HTTP can live in the existing TypeScript Worker for nothing extra. Python earns its place when the work needs Python libraries: data frames, document parsing, ML models, an agent framework that only exists in Python.

### Options compared

| | FastAPI | Litestar | Django + django-ninja |
|---|---|---|---|
| Current version | 0.165.0 (2026-11-18), needs Python 3.11+ [V] | 2.25.0 (2026-10-18) [V] | Django 6.1.3 (2026-11-03), django-ninja 1.8.0 [V] |
| Typed request and response | Pydantic models, OpenAPI generated | msgspec or Pydantic, OpenAPI generated | Pydantic via ninja |
| Layering | You choose; nothing built in | Has its own controller and DI ideas | Django's app layout; the ORM pulls logic into models |
| Runs on Cloudflare Python Workers | Yes, documented with an example [V] | Not documented [V: not on the Workers Python pages I read] | Django is named in the GA coverage [S]; Cloudflare maintains `django-cf`, in `cloudflare/workers-py` [V] |
| Maintenance signal | Several releases a week; one main maintainer [V] | Steady, team-run | Very mature |
| Agent fit | The most examples in any model's training data; small surface | Fewer examples | Large surface; agents drift into fat models |

Flask 3.1.3 (last release 2026-02-19 [V]) was also checked; it has no typed request handling without add-ons, so it loses on "typed".

**Recommendation: FastAPI.** It's typed end to end, generates the OpenAPI document the TypeScript side can build a client from, and is the one framework with a first-party Cloudflare Workers guide. Its weakness is being largely one person's project and still on 0.x; pin exactly and read release notes.

### Recommended stack and versions

| Piece | Pick | Version | Mark |
|---|---|---|---|
| Python | 3.14 | 3.14.10. (3.15.2 exists; 3.14 has broader wheel coverage [I]. Cloudflare's examples set `requires-python >=3.13`.) | [V] versions |
| Packaging | uv, with `uv.lock` committed | 0.13.9 | [V] |
| Framework | FastAPI + Pydantic + pydantic-settings | 0.165.0, 2.14.4, 2.16.3 | [V] |
| Server (containers) | uvicorn | 0.54.0 | [V] |
| Lint and format | ruff | 0.17.6 | [V] |
| Type check | pyright, strict | 1.1.414 (2026-09-10) | [V] |
| Boundary check | import-linter | 2.17 (2026-11-18), needs Python 3.11+ | [V] |
| Tests | pytest + pytest-asyncio + httpx | 9.2.0, 1.5.0, 0.28.1 | [V] |
| API e2e | schemathesis (property tests from the OpenAPI document) | 4.34.0 | [V] |
| Task runner | poethepoet, tasks in `pyproject.toml` | 0.49.0 | [V] |
| Clerk | `clerk-backend-api` | 7.1.1 | [V] |
| Model SDKs, if needed | `anthropic` 2.12.0, `pydantic-ai` 2.71.0 | | [V] versions only |

On the type checker, three options:

- **pyright** (recommended): the strictest mature checker, and what editors use. Needs Node; the PyPI wrapper fetches it.
- **mypy 2.4.1** [V]: fine, slower, different inference; pick it if a dependency ships a mypy plugin you need.
- **ty 0.0.108** [V]: Astral's checker, very fast, but its README still says beta [V]. Don't gate CI on it yet. Revisit when it reaches 1.0, since it would put lint, format, types and packaging under one vendor.

One oddity to know about: `httpx` has not had a release since 2024-12-06 [V]. FastAPI's test client depends on it. It works, but it's a stalled dependency in the middle of the test stack.

### Folder structure

```
services/ai/                     (or the repo root)
  pyproject.toml  uv.lock  .importlinter  Dockerfile  wrangler.jsonc
  src/app/
    main.py                      builds the FastAPI app; the composition root
    worker.py                    Cloudflare entry: Default = asgi.entrypoint(app)
    core/                        settings, auth dependency, errors, logging
    modules/
      summaries/                 the example module
        router.py                controller: HTTP in, HTTP out, no rules
        service.py               rules; no FastAPI, no SQL, no HTTP client
        repository.py            a Protocol plus adapters (memory, D1 or Postgres)
        client.py                outbound calls (a model API), behind a Protocol
        schemas.py               Pydantic request and response models
  tests/
    unit/  integration/  e2e/
```

Boundary contracts in `.importlinter`, all standard contract types [V]:

- **`layers`** with `containers = app.modules.*`: `router` above `service` above `repository | client`. A repository can't import a router.
- **`independence`** across `app.modules.*`: modules can't import each other.
- **`forbidden`**: `app.modules.*.service` may not import `fastapi`, `sqlalchemy`, `httpx` or a model SDK. This is the Python twin of the web pack's `notInServices` list.

`lint-imports` runs as part of `lint`, so the boundary check sits in lint as the contract asks.

### Check contract

Python has no `package.json`, so the commands are poe tasks, run as `uv run poe <name>`. In a monorepo, add a five-line `package.json` whose scripts call them, so Turborepo treats the service like any other package.

| Command | Runs |
|---|---|
| `lint` | `ruff check . && ruff format --check . && lint-imports` |
| `typecheck` | `pyright` |
| `test` | `pytest tests/unit tests/integration` |
| `build` | `uv lock --check && docker build .` for a container, or a `pywrangler` dry-run deploy for a Worker (I did not verify the exact flag) |
| `test:e2e` | start the app, then `pytest tests/e2e` and `schemathesis run` against its `/openapi.json` |
| `check` | `lint`, `typecheck`, `test`, `build` |

CI: `astral-sh/setup-uv` (uv's docs pin v9.0.0 by commit hash [V]; the action's tags now reach v10.4.0 [V, fact-check], so pin the current release by hash), then `uv sync --locked` and the tasks above, all on `ubuntu-latest`. This is the cheapest pack to run.

### Deploy options

| | Cloudflare Python Workers | Cloudflare Containers | Fly.io | Railway |
|---|---|---|---|---|
| Status | Reported generally available on 2026-09-21 [S]. The official docs carry no beta label today [V]. | Available on the paid plan [V] | Mature [I] | Mature [I] |
| Free tier | Yes: the Workers free plan, 100,000 requests a day [V] | **No.** Needs Workers Paid, $5 a month [V] | No free tier; pay as you go; card required [S] | Free plan with $1 of usage a month; Hobby $5 a month including $5 of usage [S] |
| Runtime | Pyodide: CPython compiled to WebAssembly, inside a V8 isolate [V] | Any Docker image | Any Docker image | Any Docker image or buildpack |
| Packages | Pure-Python packages, PyEmscripten wheels on PyPI, and packages bundled with Pyodide. Cloudflare's docs: WebAssembly package support "is still in early stages" [V] | Anything | Anything | Anything |
| Limits | 128 MB memory; 64 MiB bundle; 1 s startup; CPU 10 ms per request on free, up to 5 min on paid [V] | Instance types; scales to zero; billed per 10 ms [V] | Yours to size | Yours to size |
| Bindings | D1, R2, KV, Durable Objects, Queues, Workflows, Workers AI, Vectorize [V] | Reached through a Worker in front [V] | None | None |
| Tooling | `uv run pywrangler dev` and `deploy`; `workers-py` 1.17.9 [V] | `wrangler` | `flyctl` | Git push |

Included with Workers Paid for Containers: 25 GiB-hours of memory, 375 vCPU-minutes and 200 GB-hours of disk a month [V].

**Recommendation, as a decision the pack asks about:**

1. **Dependencies are FastAPI, Pydantic, an HTTP client and model SDKs → Python Workers.** Same account, same `wrangler` flow and same bindings as the web pack, and it's free to start.
2. **Anything with native code that Pyodide lacks, heavy CPU, long jobs, threads or raw sockets → a container.** On Cloudflare Containers if the person already pays the $5; Railway's Hobby plan is the same price with less to learn; Fly.io if they need regions or volumes.

The pack keeps both doors open at almost no cost: the app is plain ASGI, `worker.py` is a two-line Cloudflare entry and the `Dockerfile` runs uvicorn. Nothing in `modules/` knows which one is in use.

### Auth

The service receives the same Clerk bearer token as the web API. `clerk-backend-api` has `authenticate_request`, which takes the request and a list of authorized parties [V]. I did **not** verify that this SDK runs under Pyodide. If it doesn't, verify the token's signature against Clerk's public keys with `PyJWT` 2.15.1; that needs the `cryptography` package, which Pyodide bundles [I]. Either way it sits behind one FastAPI dependency in `core/`.

Prefer service-to-service calls: the web Worker calls the Python service over a Cloudflare service binding, and the Python service is not public at all. That removes a whole class of auth mistakes [I].

### Risks and immature parts

- **Tests run on CPython; production runs on Pyodide.** A package can pass every test and fail to import on deploy. The e2e step must run against `pywrangler dev`, not uvicorn, for a Workers deploy. This is the main reason confidence in the deploy target is lower than in the code stack.
- **Free-plan CPU.** 10 ms of CPU per request is tight for JavaScript and I found no published number for a FastAPI request under Pyodide. Cold starts are helped by a memory snapshot taken at deploy time [V], but per-request CPU is not. Assume the paid plan until measured. *Not found in two searches.*
- **GA is recent** (two months, by secondary sources). I could not open Cloudflare's announcement to read the fine print.
- **Databases.** No ORM driver for D1 was verified. Under Workers, expect to call D1 through the binding in a small repository adapter rather than through SQLAlchemy [I]. In a container, SQLAlchemy 2.1.9 with psycopg 3.3.9 against Postgres is the ordinary path [V versions].
- **FastAPI is 0.x and ships several times a week.** Renovate will be noisy; batch updates weekly.

**Confidence: high** for the code stack (FastAPI, uv, ruff, pyright, pytest, import-linter). **Medium-low** for Python Workers as the default deploy until someone runs the example module there and measures CPU per request.

### Sources (Python)

- PyPI JSON API, read 2026-11-22: `fastapi`, `litestar`, `django`, `django-ninja`, `flask`, `uvicorn`, `pydantic`, `pydantic-settings`, `ruff`, `pyright`, `mypy`, `ty`, `import-linter`, `uv`, `pytest`, `pytest-asyncio`, `httpx`, `schemathesis`, `poethepoet`, `clerk-backend-api`, `pyjwt`, `sqlalchemy`, `psycopg`, `workers-py`, `anthropic`, `pydantic-ai`.
- `actions/python-versions` on GitHub: `versions-manifest.json` (Python 3.15.2, 3.14.10). Read 2026-11-22.
- `fastapi/fastapi` on GitHub: `docs/en/docs/release-notes.md` (0.165.0, 2026-11-18). Read 2026-11-22.
- `cloudflare/cloudflare-docs` on GitHub, `production`: `src/content/docs/workers/languages/python/index.mdx`, `packages/index.mdx`, `packages/fastapi.mdx`, `how-python-workers-work.mdx`; `workers/platform/limits.mdx`, `workers/platform/pricing.mdx`; `containers/platform/pricing.mdx`. Read 2026-11-22.
- `cloudflare/workers-py` on GitHub: `README.md`. Read 2026-11-22.
- `astral-sh/ty` on GitHub: `README.md` ("ty is currently in beta"). `astral-sh/uv`: `docs/guides/integration/github.md`, `docker.md`. Read 2026-11-22.
- `seddonym/import-linter` on GitHub: `docs/contract_types/layers.md`, `mkdocs.yml` (contract type list). Read 2026-11-22.
- `clerk/clerk-sdk-python` on GitHub: `README.md`. Read 2026-11-22.
- [S] Web search summaries: "Python Workers are now generally available" (Cloudflare blog title), InfoQ (September 2026) and two third-party posts giving 2026-09-21; Fly.io pricing and docs; Railway pricing docs. Searched 2026-11-22.

---

## 4. Unity game projects

Unity is the platform where the kit's promise holds least. An agent can write and test game **logic** well. It cannot see the game, and it cannot safely hand-edit the files that hold scenes. Read the last part of this section before deciding to build this pack.

### Options compared (how to run CI)

| | GameCI on GitHub Actions | Unity Build Automation | Self-hosted runner with Unity installed |
|---|---|---|---|
| What it is | Open-source actions that run Unity in Docker | Unity's own cloud build service | Your machine, registered as a runner |
| Cost | GitHub minutes only | Free tier, reported to include 100 Mac build minutes a month from 2026 [S]; then paid | Hardware and power |
| Fits the check contract | Yes: same workflow file as every other pack | Partly: builds and tests run outside GitHub Actions | Yes |
| Licence handling | You store a licence file or serial as secrets | Handled by Unity | Activated once on the machine |
| Speed | Slow cold starts: a multi-GB image plus a `Library` import [I] | Managed caching | Fastest: warm `Library` |
| iOS and macOS builds | Needs macOS runners | Included | Needs a Mac |
| Risk | Community project; Personal activation is fragile | Vendor pricing has changed before | One machine to keep alive |

**Recommendation: GameCI on GitHub Actions**, because it keeps one CI system and one contract across every pack. Move to a self-hosted runner when build time, not money, becomes the complaint. Unity Build Automation is the fallback for iOS builds without a Mac.

### Recommended stack and versions

| Piece | Pick | Version | Mark |
|---|---|---|---|
| Editor | Unity 6.3 LTS | 6000.3.x; the newest GameCI image is 6000.3.29f1. Supported until December 2027. | [V] image tag on Docker Hub; [S] support date |
| Tests | Unity Test Framework (EditMode and PlayMode) | The version bundled with 6.3 | Not verified |
| Test action | `game-ci/unity-test-runner` | `@v4` | [V] GameCI docs |
| Build action | `game-ci/unity-builder` | `@v4` (4.8.2, 2026-09-02). There is also a v5 line (5.0.0 on 2026-05-07, 5.0.1 on 2026-09-02). v6.0.0 is the newest release; its tag commit is dated 2026-08-29 (the draft said 10 Sep, which could not be confirmed). | [V] tags |
| Large files | Git LFS | | |
| Scripting backend | Mono for CI builds; IL2CPP only for release | | [V] GameCI docs on which needs which runner |

Version notes:

- **Not Unity 6.6.** It's the newest release (6000.6.0f1, 2026-08-31) but it is an update release, supported only until 6.7 arrives [S]. **Unity 6.7 LTS** is in beta as of 2026-11-19 and due this quarter [S]. Build the pack on 6.3 LTS and plan one upgrade when 6.7 LTS has a few patch releases.
- **Why `@v4` and not `@v6`.** GameCI's own documentation still writes `@v4` in nearly every example. The builder page has two `@v6`-only examples (`GAME_CI_DOCKER_ENV`, `GAME_CI_UNITY_SETTINGS`) and notes where `@v4`, `@v5` and `@v6` behave differently [V, fact-check; the draft said "every example"]. v6.0.0 rewrote the action as a thin wrapper around a new `game-ci` CLI two months ago, and v4 still receives backported fixes (4.8.2 carried the Unity 6.6 shared-memory fix) [V]. Take v6 once the docs do.
- Pin the editor version in `ProjectSettings/ProjectVersion.txt` and let the action read it (`unityVersion: auto` is the default [V]).

### Project structure

```
Assets/
  _Project/
    Core/                              shared kernel: no feature knows another feature
      Runtime/   Core.asmdef
      Tests/     Core.Tests.asmdef
    Features/
      Inventory/
        Domain/    Inventory.Domain.asmdef      pure C#, noEngineReferences: true
        Runtime/   Inventory.asmdef             MonoBehaviours; references Domain and Core
        Editor/    Inventory.Editor.asmdef      Editor-only tools and scene builders
        Tests/
          EditMode/  Inventory.Tests.EditMode.asmdef
          PlayMode/  Inventory.Tests.PlayMode.asmdef
      Combat/ ...
    App/           App.asmdef                   the composition root; references features
    Scenes/  Prefabs/  Settings/  Art/
Packages/manifest.json  packages-lock.json
ProjectSettings/
ci/                                    shell scripts behind the contract commands
.gitattributes  .gitignore
```

How this maps to the kit's rules:

- **An assembly definition is a module.** Code in one assembly can only use assemblies listed in its `references`, and the C# compiler enforces it. So "features don't import each other" becomes "no feature asmdef lists another feature". Set `autoReferenced: false` everywhere so nothing leaks in by default [I, standard Unity behaviour; not re-read today].
- **`Domain` assemblies set `noEngineReferences: true`.** That keeps game rules free of `UnityEngine`, which makes them fast to test and is the Unity version of "services hold rules, not SDKs".
- **The boundary check** is two things. The compiler already rejects an undeclared reference. To reject a *declared but forbidden* one, add an EditMode test that reads every `.asmdef` (they're JSON) and fails if a `Features/X` assembly references `Features/Y`, or if anything other than `App` references two features. That is about forty lines and is the one place this pack hand-rolls a check, because no maintained tool exists for it [I: none found; I did not search widely].
- Layering inside a feature: `Runtime` (the controller: input, MonoBehaviours, views) calls `Domain` (the service: rules), which talks to storage or network through an interface that `App` wires up.

### Check contract

Unity has no script runner, so the commands are small scripts in `ci/` with a `justfile` or `Makefile` in front. They need a Unity Editor, which an agent's Linux sandbox normally does not have; see "what an agent can do" below.

| Command | Runs | Notes |
|---|---|---|
| `lint` | `dotnet format whitespace --folder Assets/_Project --verify-no-changes`, a script that fails on a missing or orphaned `.meta` file, and the asmdef boundary rules | The whitespace and `.meta` checks need no Editor |
| `typecheck` | Unity in batch mode compiling the project with warnings as errors | C# is compiled, so this is "does it compile" |
| `test` | EditMode tests (`unity-test-runner`, `testMode: editmode`) | Seconds to run, minutes to start |
| `test:e2e` | PlayMode tests (`testMode: playmode`), plus a smoke test that loads each scene | The closest thing to a browser test |
| `build` | `unity-builder` for one cheap target (WebGL or `StandaloneLinux64`) | |
| `check` | all of the above except `test:e2e` | |

### CI details

- **Activation.** Every GameCI action needs a licence [V].
  - *Personal:* activate in Unity Hub on your machine, copy the `.ulf` file into a `UNITY_LICENSE` secret, add `UNITY_EMAIL` and `UNITY_PASSWORD`, then sign out of Hub so your machine releases the seat [V]. GameCI's docs warn that Hub does not always produce a `.ulf` and send you to their Discord for workarounds [V]. Unity's own manual says manual activation is not for Personal licences [S].
  - *Pro:* a serial in a secret. *Enterprise:* a licence server URL (`unityLicensingServer` input) [V].
- **Runners and targets** [V]: Linux runners build WebGL, Android, Linux and Windows with Mono. Windows IL2CPP needs a Windows runner. macOS and iOS need a macOS runner. Docker images exist for 6000.3.29f1 with `base`, `webgl`, `android`, `ios` and `windows-mono` modules [V].
- **Caching.** Cache `Library/` keyed on the target platform and a hash of `Assets/**`, `Packages/**` and `ProjectSettings/**`. The Actions cache includes 10 GB per repository [V]; a mid-sized project's `Library` can use most of that [I].
- **Results.** The test runner writes results to an `artifacts` folder and can post a check run with a `githubToken` [V].
- **Cost.** A cold build is commonly 15 to 40 minutes [I]. At $0.006 a Linux minute, the $12 monthly allowance is about 2,000 minutes: 50 to 130 builds. Run EditMode tests on every pull request and builds only on `main` or a label.

### Git LFS

- GitHub Free and Pro include **10 GiB of LFS storage and 10 GiB of bandwidth a month** [V]. With a $0 budget, LFS is blocked for the rest of the month once the quota is used [V].
- **Every CI checkout downloads LFS files and spends bandwidth.** Cache the LFS objects in CI or the quota goes in days [I].
- Track binaries (`*.png`, `*.psd`, `*.fbx`, `*.wav`, `*.mp4`, and so on) in `.gitattributes`. Do **not** put `.unity`, `.prefab`, `.asset` or `.meta` files in LFS: they're text and need diffs. Set the editor to Force Text serialisation and Visible Meta Files, and register UnityYAMLMerge as the merge tool [I].
- Ignore `Library/`, `Temp/`, `Obj/`, `Logs/`, `UserSettings/` and build output.

### Deploy

- **WebGL to Cloudflare:** fits the owner's preference, with a trap. Workers static assets cap each file at **25 MiB** [V], and a Unity WebGL `.data` file is often larger. Keep the build small, or serve the big files from R2.
- itch.io (the `butler` CLI) and Steam (`steamcmd`; GameCI has a deploy action) for desktop builds [I].
- Mobile stores through fastlane; GameCI documents the iOS path [V that the page exists; not read in full].

### What an AI agent can and can't reliably do in Unity

| Reliable | Unreliable or not possible |
|---|---|
| C# gameplay logic, especially in `Domain` assemblies | Judging how anything looks, feels, sounds or plays |
| EditMode tests, and PlayMode tests that build their own objects in code | Hand-editing `.unity` and `.prefab` YAML: file IDs and GUID references break silently |
| Assembly definitions, package manifest, CI workflow | Creating or renaming assets without breaking `.meta` GUIDs |
| Editor scripts that **generate** scenes, prefabs and ScriptableObjects | Animation, lighting, level layout, UI layout by eye |
| ScriptableObject data, shaders and config as text | Anything binary: textures, models, audio |
| Reading a CI log and fixing a compile error | Running `check` locally: there is usually no Editor in the sandbox |

What follows from that for the pack:

1. **Code-first scenes.** The agent never edits a scene file. It writes an Editor script that builds the scene or prefab, and the generated file is committed. The script can be reviewed and re-run; the YAML can't.
2. **The loop is slow.** Without an Editor, the agent's only feedback is CI, at 10 to 20 minutes a round. Keep as much logic as possible in `Domain`, where plain C# tests could even run under `dotnet test` outside Unity [I, not tried].
3. **A person plays the game.** Acceptance checks tagged `agent` on the web pack mostly become checks for a human here. The pack should say so.
4. **Editor bridges exist but are young.** Unity ships an MCP server inside its AI Assistant package (`com.unity.ai.assistant` 2.0), in open beta since May 2026, listing Claude Code and Cursor as clients; it reportedly needs a Unity subscription [S]. With it, an agent can drive an Editor open on the person's machine. That changes the table above but I could not verify how well, and it doesn't work unattended in CI.

### Risks and immature parts

- **Licence terms.** Unity's compliance page says a separate licence is required for build machines and that running Unity on more than one machine at once isn't allowed [S]. Whether a free Personal licence may be used on a hosted CI runner is not something I could confirm either way. GameCI documents doing it. **Ask the person to read Unity's terms, or use a paid seat, before relying on this.** Personal is for revenue and funding under $200,000 a year [S].
- **Activation breaks without warning** when Unity changes Hub or its licence service. It has happened before [S, GameCI's own warning note].
- **GameCI is mid-rewrite** (v6 on a new CLI). Community-maintained, no vendor behind it.
- **Unity 6.7 LTS and Unity 7** are both coming; 6.6 is described as the last non-LTS release before Unity 7 [S].
- **Engine alternative, not compared:** Godot stores scenes as readable text and has no licence step in CI [I], which suits agents better. If the choice of engine is still open, that deserves its own research thread.

**Confidence: medium** that GameCI plus asmdef modules is the right pack shape. **Low** that this pack delivers the kit's "agents write most of the code" promise for anything beyond game logic.

### Sources (Unity)

- `game-ci/documentation` on GitHub, `main`: `docs/03-github/01-getting-started.mdx`, `02-activation.mdx`, `03-test-runner.mdx`, `04-builder.mdx`. Read 2026-11-22.
- `game-ci/unity-builder` on GitHub: releases page (v6.0.0, v5.0.1, v4.8.2) and `action.yml`. Read 2026-11-22.
- Docker Hub API, `unityci/editor` tags for `ubuntu-6000.3` and `ubuntu-6000.6`. Read 2026-11-22.
- `github/docs` on GitHub: `data/variables/large_files.yml`, `content/billing/concepts/product-billing/git-lfs.md`, `data/reusables/billing/actions-included-quotas.md`. Read 2026-11-22.
- `cloudflare/cloudflare-docs` on GitHub: `src/content/docs/workers/platform/limits.mdx` (static asset file size). Read 2026-11-22.
- [S] Web search summaries of unity.com pages: Unity 6 support page (6.3 LTS until December 2027), 6000.6.0f1 release notes (2026-08-31), Unity Discussions ("Unity 6.6 is now available"; "Unity 6.7 Beta is now available", 2026-11-19), licence compliance page, pricing updates page, the Unity blog on its MCP beta (2026-05-11) and the `com.unity.ai.assistant@2.0` manual. Searched 2026-11-22.

---

## 5. Monorepo (web, mobile, shared packages)

### Options compared

| | pnpm workspaces + Turborepo | Nx | pnpm workspaces alone |
|---|---|---|---|
| Current version | pnpm 12.21.0, turbo 2.11.13 (2026-11-18) [V] | 24.0.6 (2026-11-10) [V] | pnpm 12.21.0 [V] |
| What it adds | A task graph and a cache over the scripts each package already has | Task graph and cache, plus generators, plugins that infer tasks, and a module-boundary lint rule with tags [I] | Nothing: `pnpm -r run` and `--filter` |
| Config an agent must understand | One `turbo.json` | `nx.json`, per-project config, plugin behaviour | None |
| Check contract fit | Direct: `turbo run lint` runs each package's own `lint` | Direct, but tasks can be inferred by plugins rather than written down | Direct, no caching |
| Boundary check | `turbo boundaries`, **experimental** [V]; otherwise ESLint | Built in and mature [I] | ESLint only |
| Non-JS packages | Any folder with a `package.json` and scripts | First-class plugins for some languages [I] | Same as Turborepo |
| Remote cache | Free on Vercel on all plans, or self-hosted against a published API, or `actions/cache` [V] | Nx Cloud, free tier with limits [I] | None |
| Vendor | Vercel | Nx (company) | None |

**Recommendation: pnpm workspaces + Turborepo.**

- **It keeps the contract visible.** Every package has the same six script names in its own `package.json`. Turborepo only decides order and what to skip. An agent dropped into `apps/mobile` can read the scripts and run them without knowing the monorepo tool exists. Nx's inferred tasks hide that, which is a cost when the reader is an agent with a small context.
- **The web pack already uses pnpm 12.21.0 and has a `pnpm-workspace.yaml`.**
- **Turborepo is a Vercel project, and that's fine.** It's MIT-licensed [V, fact-check] and needs no Vercel account. Use `actions/cache` for the cache, which Turborepo's own CI guide documents [V], so nothing touches Vercel.

Nx is the better tool for a team of twenty with dozens of packages that wants generators and enforced tags. For a kit that starts with three apps it is more machinery than the job needs. pnpm alone is a fair starting point for two packages; add Turborepo when CI time starts to hurt.

### Folder structure

```
package.json            scripts: check, lint, typecheck, test, test:e2e, build → turbo run …
pnpm-workspace.yaml     packages: apps/*, packages/*, services/*; plus the version catalog
turbo.json
apps/
  web/                  the TanStack Start pack, unchanged inside
  mobile/               the Expo pack
  desktop/              the Electron pack
services/
  ai/                   the Python pack, with a small package.json that calls `uv run poe …`
packages/
  contract/             zod schemas, shared types, the typed API client. No React, no platform code.
  config/               shared tsconfig, ESLint and Prettier presets
```

Turborepo's docs recommend `apps/` and `packages/` and do not support nested packages such as `apps/**` [V]. Give internal packages a namespace (`@repo/contract`) and an `exports` map so nothing reaches into their files [V].

What to share and what not to:

- **Share:** schemas, types, the API client, pure functions, lint and TypeScript config.
- **Don't share, at first:** UI components across web and native, or anything that imports `react-native`, `electron`, `cloudflare:*` or a database driver. A shared package that drags a platform in is the usual way a monorepo turns into one tangled app.

### How the check contract maps

- **Each package** implements the six commands exactly as its pack defines them.
- **The root** forwards them:

  | Root command | Runs |
  |---|---|
  | `lint`, `typecheck`, `test`, `build` | `turbo run <name>` |
  | `check` | `turbo run lint typecheck test build` |
  | `test:e2e` | `turbo run test:e2e --filter=<app>`: e2e needs different machines per app, so it is never run for all at once |

- **`turbo.json`** says `build` depends on `^build` (a package's dependencies build first) and lists each task's outputs so the cache is correct.
- **CI** runs `turbo run … --affected` on pull requests, so a change in `apps/mobile` doesn't run the desktop checks [V, fact-check: `reference/run.mdx` documents `--affected`]. Each platform keeps its own workflow file with a `paths:` filter for the expensive jobs (emulators, macOS, Unity).
- **A Unity project doesn't belong in this monorepo.** Different tools, LFS, and multi-GB checkouts. Keep it in its own repository.

### How boundaries map

There are now two levels, and they need different tools.

| Level | Rule | Enforced by |
|---|---|---|
| Inside an app | Modules don't import each other; controller → service → repository | Each pack's own check: `eslint-plugin-boundaries` 7.4.4, or import-linter for Python. Unchanged. |
| Between packages | Apps never import apps. Packages never import apps. A package only uses what its `package.json` declares, through its `exports`. | pnpm's default isolated `node_modules`, which makes an undeclared import fail to resolve [V, Expo's monorepo guide describes this]; `exports` maps; and one root ESLint rule banning `apps/*` and deep `@repo/*/src/**` imports |
| Between packages, optional | Tag rules, for example "`public` packages can't depend on `internal`" | `turbo boundaries`. It checks for imports outside a package's folder and undeclared dependencies, and supports tag rules, but is marked **experimental** [V]. Run it as a report, not a gate, until it's stable. |
| Versions | One version of each shared dependency | pnpm catalogs in `pnpm-workspace.yaml` [V, fact-check], checked by `syncpack` 15.3.4 or `sherif` 1.13.0 [V versions] |

`dependency-cruiser` 18.9.0 [V] is the alternative if one tool should check both levels from the root. The kit's `stack` skill already lists it next to `eslint-plugin-boundaries`.

### Gotchas

- **One React, and Expo chooses it (recommended, not required).** Expo SDK 58 pins React 19.3.0; the web pack pins 19.3.1 [V both]. Expo's docs: duplicate React versions **in one app** cause runtime errors, and duplicate React Native versions in one monorepo are not supported [V]. *Fact-check:* the draft read this as "two React versions in one monorepo break". They don't, as long as each app resolves one copy. Under pnpm's isolated installs `apps/web` can keep 19.3.1 and `apps/mobile` 19.3.0, provided shared packages list `react` as a peer dependency, never a dependency. It breaks under `nodeLinker: hoisted`, or when a shared React package resolves a different copy from the app using it. The recommendation stays: put `react`, `react-dom` and their types in the pnpm catalog at the version Expo wants, and let the web app follow. That's simpler and survives a switch to hoisted. The cost is that the web pack's React upgrades wait on Expo's release schedule. If that coupling hurts, per-app versions are a valid second option.
- **pnpm's isolated installs and React Native.** Supported from SDK 54, but Expo warns that some React Native libraries still break under it; the documented escape hatch is `nodeLinker: hoisted` in `pnpm-workspace.yaml` [V]. That setting also turns off the "undeclared import fails" protection in the table above, for the whole repo. Try isolated first.
- **Metro needs no monorepo config** when you use `expo/metro-config`; delete any hand-written `watchFolders` or resolver overrides [V].
- **Native module duplicates.** Set `experiments.autolinkingModuleResolution` in `app.json` so Metro resolves the same copy that autolinking links [V].
- **Cache correctness.** A task whose inputs include environment variables or generated files (`wrangler types`, the route tree) must declare them in `turbo.json`, or the cache will serve a stale result. This is the most common Turborepo mistake [I].
- **Deploys stay per app.** `wrangler deploy` from `apps/web`, `eas build` from `apps/mobile`. EAS uploads the whole repo for a monorepo build, so keep large files out of it [I].

### Risks and immature parts

- `turbo boundaries` is experimental and its config may change [V].
- React version coupling between web and mobile (above) lasts as long as both live in one repo and share a catalog version. Per-app versions under isolated installs avoid it, at the cost of more care in shared packages.
- Turborepo's direction is set by Vercel. The lock-in is shallow: remove `turbo.json` and the scripts still run with `pnpm -r`.

**Confidence: high.** The main alternative, Nx, would also work; the choice is about how much the tool hides, not about capability.

### Sources (monorepo)

- npm registry API, read 2026-11-22: `pnpm`, `turbo`, `nx`, `@nx/eslint-plugin`, `eslint-plugin-boundaries`, `dependency-cruiser`, `syncpack`, `sherif`, `react`.
- `vercel/turborepo` on GitHub, `main`: `apps/docs/content/docs/reference/boundaries.mdx`, `crafting-your-repository/structuring-a-repository.mdx`, `core-concepts/remote-caching.mdx`, `guides/ci-vendors/github-actions.mdx`. Read 2026-11-22.
- `expo/expo` on GitHub: `docs/pages/guides/monorepos.mdx`; `sdk-58` template `package.json`. Read 2026-11-22.
- This repo: `stacks/tanstack-start/package.json` (pnpm 12.21.0, React 19.3.1), `eslint.config.js`, `.agents/skills/stack/SKILL.md`. Read 2026-11-22.
- Nx's documentation site was not reachable. Statements about Nx features are [I].

---

## Top risks across all packs

1. **Agents are blind on three of five platforms.** On web an agent can open a preview in a browser. A phone simulator, a signed desktop installer and a Unity scene are all out of reach of a Linux sandbox. The kit's `qa` step, as written for browsers, has no equivalent yet for mobile (Maestro in CI is the nearest), desktop (Playwright under xvfb covers Linux only) or Unity (nothing). Expect more human checking than the web pack needs, and say so in each pack.
2. **Young, beta or recently changed pieces sit on the critical path.** `@clerk/electron` (beta, five months old), Clerk's native Expo components (beta), Cloudflare Python Workers (GA two months ago, by secondary sources), GameCI v6 (rewritten two months ago), `turbo boundaries` (experimental), `ty` (beta). Each recommendation above routes around the beta where it can, but pin exact versions and re-check this dossier before building each pack.
3. **"Free" stops at the store and the signature.** Apple $99 a year (needed for iOS, and for macOS desktop), Windows signing (price unverified, and not open to individuals in most countries), macOS CI minutes at ten times the Linux rate, Cloudflare Containers at $5 a month, and a Unity licence question for CI. All of these are "stop and ask the person" items under the kit's own rules.

Also worth remembering: the Expo, Electron and Unity ecosystems each ship a new major every two to four months. A pack that isn't upgraded goes stale faster than the web pack does.

## What would change these answers

| If this happens | Then |
|---|---|
| Clerk ships an official Tauri SDK | Redo desktop; Tauri likely wins |
| A FastAPI request on Python Workers is measured well over 10 ms of CPU, or a needed package won't load | Default the Python pack to a container |
| `ty` reaches 1.0 | Replace pyright with it |
| Unity 6.7 LTS is released and GameCI's docs move to v6 | Move the Unity pack to both |
| `turbo boundaries` leaves experimental | Make it the package-level gate |
| NativeWind 5 ships stable | Compare it against Uniwind before the mobile pack is built |
| The person doesn't use Clerk | Flutter and Tauri both become stronger candidates |

## Before anyone acts on this

The kit's `research` skill asks for a fresh fact-check before a dossier is used. This one had it on 2026-11-22 (see the top). The fact-check could not close the items below, which still matter, in order:

1. Open the pricing pages nobody could reach (Azure Artifact Signing, Fly.io, Railway; Expo's free-plan counts matched by search) and correct the [S] numbers.
2. Read Cloudflare's Python Workers GA post for limits and the free-plan position (the GA date of 2026-09-21 is now confirmed by three secondary sources).
3. Read Unity's current licence terms on build machines.
4. Run the smallest possible spike for the three untested joins: Uniwind on Expo SDK 58, `clerk-backend-api` under Pyodide, and Playwright driving a packaged Electron Forge app on a Linux runner.
