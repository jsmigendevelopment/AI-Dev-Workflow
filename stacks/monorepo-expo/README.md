# Monorepo + Expo starter

One repository for a web app, a mobile app (iOS and Android) and the code they share: pnpm workspaces and Turborepo, an Expo app with Expo Router, Clerk sign-in, Uniwind (Tailwind classes for React Native), TanStack Query, Zod, Jest and Maestro, and one API contract both apps follow.

It runs, tests and builds with no accounts and no keys. Without a Clerk key the mobile app shows sign-in as "not set up" and never calls the API.

```
package.json          the check contract: every script runs `turbo run <name>` across workspaces
pnpm-workspace.yaml   apps/*, packages/*, the version catalog, which packages may run install scripts
turbo.json            task graph, cache inputs and outputs
tsconfig.base.json    strictness every workspace extends
eslint.workspace.config.js, scripts/check-workspace-deps.js   the cross-workspace boundary check
(no .github/workflows: checks, previews and deploys run from the session)
apps/
  web/                the TanStack Start pack, pulled in at slice 0 (not stored here)
  mobile/             the Expo app
    app.json eas.json metro.config.js jest.config.js eslint.config.js
    e2e/              Maestro flows
    src/
      app/            Expo Router routes: thin, they pick a module's screen
      modules/<f>/    ui/screens, ui/components, hooks, api. Modules never import each other.
      components/     shared: auth-provider.tsx (the only file that imports Clerk), api-provider.tsx, states
      components/ui/  the small UI kit: button, text-field, screen
      hooks/          use-session.ts (auth, vendor-free), use-api.ts
      lib/            env.ts, errors.ts, query-client.ts
      test/           test helpers (fake API, fake session) and route tests
packages/
  contracts/          @repo/contracts: Zod schemas, types and the route table for /api/v1
  api-client/         @repo/api-client: a typed fetch client for /api/v1 with a Clerk bearer token
```

## Slice 0: apply the pack

```sh
npx degit jsmigendevelopment/onRails/stacks/monorepo-expo .
npx degit jsmigendevelopment/onRails/stacks/tanstack-start apps/web
```

(or the kit CLI, which does both). Then fold the web pack into the monorepo:

1. **Delete `apps/web/pnpm-workspace.yaml` and `apps/web/pnpm-lock.yaml`.** A nested workspace file makes pnpm treat `apps/web` as its own repo. Copy any `allowBuilds` or `minimumReleaseAgeExclude` entries it had that the root lacks into the root `pnpm-workspace.yaml`.
2. **Move `apps/web/.github/dependabot.yml` to `.github/`** and set its npm `directory` to `/`, then delete `apps/web/.github/`. Neither pack ships a GitHub Actions workflow: never add one. The web pack's checks and deploys run from the root (`pnpm check:merge`, `pnpm deploy:test` and the rest, below).
3. **Delete `apps/web/lefthook.yml`** (its git hook would install from `apps/web`, not the repo root). The merge gate lints everything anyway.
4. Set the names: `name`, `slug`, `scheme`, `ios.bundleIdentifier` and `android.package` in `apps/mobile/app.json`; `appId` in `apps/mobile/e2e/*.yaml`; the scheme and workspace names in `e2e:build:ios` (`apps/mobile/package.json`); then the web pack's own renames (its README).
5. `pnpm install`, then `pnpm check`. Both must pass before you change anything. Commit the `pnpm-lock.yaml` that install wrote: the merge gate installs with `--frozen-lockfile`.

**Why no lockfile in this pack:** a lockfile must cover every workspace, and `apps/web` arrives from another pack at slice 0, so any lockfile stored here would be wrong the moment it is applied (and stale whenever the web pack changes). Every direct dependency is pinned to an exact version instead, and pnpm's minimum release age keeps brand-new transitive releases out. The project's own lockfile is created and committed at slice 0.

## Commands

| Command                                       | Does                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                | install every workspace (pnpm version pinned in `package.json`)                                                                                                                        |
| `pnpm check`                                  | `turbo run lint lint:workspace typecheck test build` across all workspaces. Turborepo runs them in parallel where it can and skips anything unchanged; any failure fails the whole run |
| `pnpm lint`                                   | each workspace's ESLint (with its module boundary check) and Prettier, plus the cross-workspace check                                                                                  |
| `pnpm typecheck` / `pnpm test` / `pnpm build` | the same task in every workspace that has it                                                                                                                                           |
| `pnpm test:e2e`                               | the web app's Playwright suite (it runs on Linux)                                                                                                                                      |
| `pnpm test:e2e:mobile`                        | Maestro flows in `apps/mobile/e2e` against an installed build on a running simulator or emulator                                                                                       |
| `pnpm boundaries:report`                      | `turbo boundaries`, as a second opinion (experimental, not a gate)                                                                                                                     |
| `pnpm check:merge`                            | after `pnpm check`, before merge: the web pack's extra checks (budgets, migrations match the tables, the audit (it covers every workspace from `apps/web`), licences, gitleaks over the whole repo's tracked files, Semgrep, screenshots). Skips what the machine can't run, and says so |
| `pnpm pr:rules <n>`                           | pull request `<n>` is tied to an issue and small enough to review |
| `pnpm deploy:preview <n>`, `deploy:test`, `deploy:production` | the web app's deploys, from the session (the web pack's README, "Deploys") |
| `pnpm connect`                                | the web app's `pnpm connect` (keys, one provider at a time, from your own terminal), plus the mobile app's `EXPO_PUBLIC_*` in `apps/mobile/.env`                                       |
| `pnpm --filter mobile dev`                    | Expo dev server (press `i` or `a`, or scan the QR code with Expo Go)                                                                                                                   |
| `pnpm --filter mobile expo:doctor`            | Expo's project health check (needs network)                                                                                                                                            |
| `pnpm turbo run <task> --affected`            | only workspaces changed since the base branch                                                                                                                                          |

Per workspace: `cd apps/mobile && pnpm test` works the same way. Packages have no `build` (consumers bundle their TypeScript source) and no `test:e2e`.

**Mobile's `build` is `expo export` for iOS and Android:** it bundles the JS (Hermes bytecode) and fails on a broken import, but compiles no native code. Store binaries are an EAS step (below), not part of `check`.

## Boundaries

| Level                              | Rule                                                                                                                                                                                                | Checked by                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Inside mobile                      | routes → modules → shared (`components`, `hooks`, `lib`); modules never import each other; shared code never imports a module; only `auth-provider.tsx` imports Clerk; only tests import `src/test` | `eslint-plugin-boundaries` in `apps/mobile/eslint.config.js`            |
| Inside web                         | the web pack's own rules                                                                                                                                                                            | `apps/web/eslint.config.js`                                             |
| Between workspaces                 | apps never import apps; packages never import apps; no relative path into another workspace; no deep import of `@repo/*/src`                                                                        | `eslint.workspace.config.js` (run with `-c`, so only this file applies) |
| Between workspaces, by declaration | no `package.json` depends on an app; shared packages never depend on React, React Native, Expo or Clerk                                                                                             | `scripts/check-workspace-deps.js`                                       |
| Undeclared imports                 | a workspace only resolves what its `package.json` lists                                                                                                                                             | pnpm's isolated `node_modules`                                          |

**Why ESLint and not `turbo boundaries` as the gate:** `turbo boundaries` works here (it caught a deliberate `apps/mobile` → `apps/web` import), but Turborepo's docs still mark it experimental (checked 2026-11), and it can't express "a package never imports an app" without tags. `eslint-plugin-boundaries` is what the web pack already uses, so one rule language covers every level. CI runs `turbo boundaries` as a report that can't fail the build. Switch the gate when it leaves experimental.

## The API contract

`packages/contracts` is the one source of truth for `/api/v1`. The web app serves it (TanStack Start server routes; see the web pack) and every client calls it through `@repo/api-client`.

| Method and path            | Body or query                                | Success                                                                    |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/v1/notes`        | `?cursor=<opaque>&limit=1..100` (default 20) | 200 `{ ok: true, data: { items: NoteDto[], nextCursor: string \| null } }` |
| `POST /api/v1/notes`       | `{ title }`                                  | 201 `{ ok: true, data: NoteDto }`                                          |
| `PATCH /api/v1/notes/:id`  | `{ title }`                                  | 200 `{ ok: true, data: NoteDto }`                                          |
| `DELETE /api/v1/notes/:id` | none                                         | 200 `{ ok: true, data: { id } }`                                           |

- **Auth:** `Authorization: Bearer <Clerk session token>`. No cookies. A missing or bad token is 401 `unauthenticated`. The client asks Clerk for a fresh token on every call (they expire within minutes) and, without one, fails before touching the network.
- **Errors:** always `{ ok: false, error: { code, message, fields? } }` with the HTTP status of its code (`ERROR_STATUS`: validation 400, unauthenticated 401, not_found 404, rate_limited 429, internal 500, unavailable 503, ...). `message` is safe to show. Someone else's id is 404, never 403.
- **Inputs are strict:** an unknown field is a 400 `validation` error with `fields`.
- The client validates every response against the schema too, so a server that leaks an extra field type or sends an HTML error page becomes a clean `ApiError`, not a crash.

**Add a shared contract:** a schema file in `packages/contracts/src/<resource>.ts` (strict input objects, a DTO, `page(dto)` for lists), its routes in `routes.ts`, an export in `index.ts`, tests next to it. Then a method group in `packages/api-client/src/client.ts` with tests against a fake `fetch`. The web routes and the mobile hooks follow.

## Mobile

**Run it:** `cp .env.example apps/mobile/.env` and fill in the two values (or leave them empty), then `pnpm --filter mobile dev --go` to open it in Expo Go (without `--go`, `expo start` targets a development build, because `expo-dev-client` is installed). Hosted sign-in works in Expo Go. `EXPO_PUBLIC_API_URL` must be reachable from the phone: in development that is your computer's LAN address (`http://192.168.x.x:3000`), not `localhost`.

**Add a module:** `src/modules/<f>/api/<f>-api.ts` (cache keys and the calls it makes through `ApiClient`), `hooks/use-<f>.ts` (TanStack Query), `ui/screens/<f>-screen.tsx` (loading, empty, error and data states) and `ui/components/`. Use `useApi()` and `useSession()`, never the Clerk SDK. A thin route in `src/app/` renders the screen. Tests: render the screen with `renderWith(<Screen />, { api: fakeApi({ ... }) })` from `src/test/render.tsx`; a method you don't fake rejects, so a stray call fails the test.

**Add a native package:** `pnpm --filter mobile exec expo install <pkg>`, then pin the exact version it chose. `expo install` picks the version the SDK was tested with; npm's latest is often ahead.

**Styling:** Uniwind compiles `className` at build time from `src/global.css` (Tailwind 4, theme tokens for light and dark). The class names work on React Native's own components.

**Clerk setup (the person does this, once per Clerk instance):** turn on the **Native API**; add the app on **Native applications** (iOS bundle ID and team ID, Android package name); a production instance needs a domain even without a website. Add the app's own claim to the session token: **Sessions** → **Customize session token** → `{"app": "<the value of CLERK_NATIVE_APP_CLAIM>"}`, on the development and the production instance. Use the same Clerk application as the web app so one account works on both, and a Clerk application of its own per product: `apps/web` accepts the mobile app's tokens, which carry no origin (`azp`), because `CLERK_ALLOW_NATIVE_TOKENS` is `"true"` and `CLERK_NATIVE_APP_CLAIM` is set in `apps/web/wrangler.jsonc`, and only when they carry that `app` claim. Clerk puts the same claims in every token an instance issues, so the claim can't tell two apps on one instance apart; it makes native sign-in fail closed until both Clerk and the Worker are set up for it.

## Mobile e2e (Maestro)

`apps/mobile/e2e/signed-out.yaml` is the smoke flow (fresh install lands on sign-in). `notes.yaml` (tag `signed-in`, skipped by default) signs in with a Clerk test user and adds and deletes a note; its hosted-page labels were not checked on a device.

Maestro needs a running simulator or emulator, so it can't run in an agent's Linux sandbox or in `check`. It runs on a machine that has one, usually the person's: install Maestro 2.12.1, build a release binary without EAS or signing, install it, then run the flows. The build scripts were moved from the old CI jobs and not yet run: expect to adjust the first run.

| Platform | Build (in `apps/mobile`) | Then |
| --- | --- | --- |
| Android | `pnpm e2e:build:android` (Java 17 and the Android SDK) | `adb install android/app/build/outputs/apk/release/app-release.apk` on a running emulator, then `pnpm test:e2e:mobile` from the root |
| iOS | `pnpm e2e:build:ios` (a Mac with Xcode) | `xcrun simctl install booted <the .app under build/Build/Products>`, then `pnpm test:e2e:mobile` |

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the shell for the build to test against the test environment (public values). Expo Workflows also has a Maestro job type if you'd rather run on Expo's machines (it is paid past the free allowance: the person's call). Maestro can't drive a physical iPhone.


## Builds, signing, stores and updates (EAS)

`apps/mobile/eas.json` has three build profiles, all on Node 22 and pnpm 12.21.0:

| Profile       | For                                                                     | Distribution            | Update channel |
| ------------- | ----------------------------------------------------------------------- | ----------------------- | -------------- |
| `development` | a dev client with native modules (needed for Clerk's native components) | internal (install link) | `development`  |
| `preview`     | testers: an APK on Android, an ad hoc build on iOS                      | internal                | `preview`      |
| `production`  | the stores; build numbers auto-increment                                | store                   | `production`   |

First time, from `apps/mobile`: `npx eas-cli@27.11.0 login`, `eas init` (writes the project ID into `app.json`), `eas update:configure` (adds the update URL), `eas env:set` for the two `EXPO_PUBLIC_*` values per environment (`env:create` still runs but is deprecated). Then `eas build --profile preview --platform all`, and later `eas submit --profile production`. These need the person's Expo account: an agent never runs them.

- **Signing:** EAS generates and stores the Android keystore and the iOS certificates and provisioning profiles (`credentialsSource: remote`), so no Mac and no keystore file is needed, and none goes in git (`.gitignore` blocks them). Losing the Android upload key means asking Google to reset it, so let EAS keep it, or download a backup with `eas credentials`.
- **Store accounts:** Apple Developer Program, **$99 a year**, needed for any iOS device build beyond the simulator. Google Play, **$25 once**. A **personal** Play account made after 2023-11-13 must run a closed test with 12 testers for 14 days before its first production release, which adds two weeks to an Android launch; an organisation account skips this.
- **EAS costs:** the Free plan has a monthly build allowance (reported as 15 Android and 15 iOS builds, low priority) and can't be billed over; EAS Update is free up to about 1,000 monthly active users. Starter is $19 a month with $45 of build credit and 3,000 update users; extra builds cost $1 to $4 each. `eas build --local` builds on your own machine for free (iOS still needs a Mac). Re-check prices before you rely on them: these are as of 2026-11.
- **Over-the-air updates:** `eas update --channel production` ships JS and asset changes to installed apps without a store review. An update can change only JS and assets. A new native module, permission or SDK upgrade needs a new binary. `runtimeVersion.policy: fingerprint` stops an update from reaching a binary whose native code doesn't match it. Keep updates to fixes and small changes: the store rules forbid changing what the app is for without a review.

All of these cost money or touch production, so they are "stop and ask the person" steps.

## React versions

`apps/web` pins React 19.3.1; Expo SDK 58 pins 19.3.0. Under pnpm's default isolated installs each app resolves its own copy, which works. It stays safe as long as:

- nothing sets `nodeLinker: hoisted` (that merges the trees and removes the "undeclared import fails" protection);
- shared packages never depend on React; they may list it as a peer (`scripts/check-workspace-deps.js` enforces this);
- mobile pins `react-dom` 19.3.0 too, because Clerk's React SDK has it as a peer.

Putting one React version in the catalog is the simpler setup if you prefer it, at the cost of the web app waiting on Expo's release schedule.

## What an agent can't check here

Lint, types, Jest, the JS export and the boundary checks run on Linux with no device. Nothing here shows the app on a screen: layout, dark mode, the keyboard, safe areas, hosted sign-in in the in-app browser, deep-link return from Clerk, and push or camera permissions all need a person with a phone (Expo Go or a preview build), or the Maestro flows on a simulator. Say so in the pull request and ask the person to try it on a device before merge.
