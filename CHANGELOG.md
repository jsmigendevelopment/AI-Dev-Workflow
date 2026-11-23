# Changelog

All notable changes to the kit are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The kit's version is the one at the bottom of `AGENTS.md`. The CLI on npm carries the same version.

## [Unreleased]

### Added

- **Four ideas from Matt Pocock's skills (#27),** rewritten in the kit's voice. A new `diagnose` skill: a check that goes red on the bug before any theory, then shrink, guess, probe, fix with a regression test and clean up; a bug in production is a blocker. `build` step 5 spells out red, green, refactor, one check at a time, and `guide/testing.md` matches. `/back` after a long run and `/afk` at its hard stop run a short retro: at most 5 findings, each an app issue or a drafted kit issue the person files. A new `writing-for-agents` skill for editing skills and `AGENTS.md`, linked from CONTRIBUTING. A root `NOTICE` carries his MIT licence, and the CLI and plugin bundles ship it.
- **Credits** in the README: Matt Pocock for the "grill me" interview and test-driven development with AI, plus the books, people and projects the kit borrows from.
- **TanStack recipes, loaded only when needed (#9).** `stack-tanstack-start/references/tanstack/` has one recipe per library: Start, Router, Query, Form, Table v9, Charts, Markdown, Highlight, Virtual and Hotkeys. Each quotes TanStack's official agent prompt with its source and date, records the version checked on npm (2026-11-23), checks every API the prompt names against the library's source, and adds the kit's rules and a "Done when" list. The `stack` skill and the `docs/stack.md` template make them the default per area for any web app, installed only by the issue that needs one; an issue's new `Recipes:` line names the recipe and `build` loads it. `dependencies` says how to pin exactly and marks Hotkeys (0.x) as young.
- **The TanStack Start pack keeps list state in the URL and shows every data state (#7).** The notes list keeps its search, order and page count in validated search params (small hand-written parsers, so no schema library ships with every page). A note has its own page, `/notes/$noteId`, with a params schema, a designed not-found state, and a "More notes" part streamed behind `<Suspense>`. Rename and delete are optimistic, roll back when refused, and say so in a designed toast with a reference id. Background refetches show "Updating…", and a failed refetch keeps the data under a "Couldn't refresh" banner. Slow navigations show the page skeleton (`defaultPendingComponent`, 300 ms delay, 500 ms minimum). The note forms use TanStack Form and load lazily behind a form-shaped skeleton, so the pages stay within their budgets; the generator's form uses TanStack Form too.
- **Lint for the routing and state rules (#7).** Raw internal `<a href>`, string-built `to` and `navigate('/path')` fail lint; a Zustand store can't import TanStack Query, a module's hooks, server code or wire types; a route that isn't fully server-rendered says why. Each rule has a test.
- **`init` offers to start the session.** In a terminal it asks "Start Claude Code here now with /idea?" (`/join` when the folder already has code), asks which agent when you have both, and hands the terminal over. `--start` skips the question, `--no-start` turns it off.
- **`init --global`** copies the four entry skills (`idea`, `join`, `back`, `afk`) to `~/.claude/skills` and `~/.agents/skills`. It never overwrites, and `doctor` warns when they fall behind the CLI.
- **Cloudflare's agent setup, offered in slice 0.** The TanStack Start skill offers Cloudflare's skills and MCP server for Claude Code or Codex, from a reviewed copy dated 2026-11-22. Creating resources still goes through `setup-cloudflare`.
- **The onRails plugin** for Claude Code and Codex: `/plugin marketplace add jsmigendevelopment/onRails`, then `/plugin install core@onrails`. It gives you `/or:idea`, `/or:join`, `/or:back` and `/or:afk` in any folder. Each one hands off to the project's copy, or offers to install the kit from a CLI copy inside the plugin, with no npm. `sync-skills` makes the skills, `npm run bundle` makes `plugin/cli/`, and CI validates both. `doctor` reports the plugin's version. `init --global` now points to the plugin.
- **Click-by-click key setup, per provider.** `secrets` now walks you through one provider at a time from `secrets/providers/` (Cloudflare, GitHub, Clerk, Google, GitHub OAuth, Facebook, LinkedIn, Yandex, Entra, Stripe, Resend, Sentry, Supabase, Expo): deep links, copy blocks, the provider's CLI where there is one, and what you'll see when it worked. Each file is dated, lists the official docs it was checked against, and marks unchecked steps. The agent re-checks those docs before each walkthrough and opens an issue when they differ. Keys are asked for right after planning, so the first test deploy never waits on one. setup-cloudflare's Access login steps now point to the same files.
- **A plan for shipping the kit as a Claude Code plugin:** [`guide/plugin-plan.md`](guide/plugin-plan.md).

### Changed

- **Bundle budgets (#7):** unchanged for `/` (145 KB gzip, measured 136.4) and `/notes` (170 KB, measured 143.9); new ones for a note's page (170 KB, measured 144.0) and the lazy chunks for the note forms (42 KB, measured 36.7) and the toaster (12 KB, measured 9.2). Start splits every route on its own: `autoCodeSplitting` isn't an option there, and the build shows one chunk per route.
- **The README is rewritten under the name onRails** (#22): the plugin first, a run from idea to the test site, the guardrails, the packs and add-ons. It says plainly that `npx onrails` isn't published yet. The banner says onRails, and the cheat sheet shows `/or:idea` next to the project's `/idea`.

### Fixed

- **Clerk tokens are checked against the app's own origins** (`authorizedParties`) in the TanStack Start pack, for the session cookie and `/api/v1` bearer tokens. The list comes from `SITE_URL`, localhost and the test Worker's previews, so there is no new setup step; `CLERK_AUTHORIZED_PARTIES` adds more. A token for another site, or with no `azp`, gets the same 401 as no token, and production with Clerk keys but no origin refuses to start. Native apps, whose tokens have no `azp`, opt in with `CLERK_ALLOW_NATIVE_TOKENS` (bearer on `/api/v1` only); the monorepo-expo pack turns it on. The refusal reason no longer reaches the page or the response headers. The `Authorization` header is parsed exactly as Clerk does (`bearer x` no longer counts), and on `/api/v1` the cookie never reaches Clerk (#12).
- `.clerk/` (Clerk claim files and temporary keys) is git-ignored in both packs, and CI fails if anything under it is committed.
- **The first pull request can merge now.** `setup-cloudflare` deploys the test Worker once, as the Coming soon page, so previews have a Worker to upload to. `--no-first-deploy` skips it. If the test Worker is missing, the `preview` job fails and names the fix (#3).

### Being built

- A needs-you convention: one clear way for agents to flag what's waiting on you.
- A status board: where every issue and pull request stands, in one place.
- A "Coming soon" page that keeps an app private until you choose to make it public.
- Permissions by relationship (ReBAC): a built-in engine behind a swappable port, and `authorize()` returns a proof the repository needs. The notes example uses it, so agents copy the real pattern.
- Go-style results: services return a value or a typed error instead of throwing.
- An app map: every file belongs to a named area, `pnpm map:check` fails on a gap, and the loop never runs two issues on the same one-at-a-time area.
- One-command dev: `pnpm dev` checks what's missing and names the fix, then migrates, seeds and waits for the health check.
- Tests for the kit itself: scripted sessions replayed each release to prove the agents still follow the rules.
- An incident skill: find the cause, roll back, open the fix issue, write what happened.

- **Renaming the kit to OnRails.** The npm package becomes `onrails`, and the plugin's short name is `or`, so commands read `/or:idea`, `/or:join`, `/or:back` and `/or:afk`. The repo, CLI, plugin and README move together in one pull request.

### Planned, after 0.4

- Tree-shakeable framework packages, and code fixes on update.
- AI cost per issue on the board, privacy export and delete, uptime checks and backup-restore drills.

## [0.4.0] - 2026-11-23

### Added

- **Monorepo + Expo pack.** One repo for a web app and an iOS and Android app, with one API contract both follow.
- **Stub packs** for Electron desktop apps, Python with FastAPI, and Unity. Each is researched and fact-checked, with a `PACK.md` the agent builds from.
- **Add-ons for the TanStack Start pack:** analytics, Sentry, background jobs, email through Resend, Stripe, uploads to R2, and a move to Supabase Postgres. With no keys set, the app still builds and the feature stays off.
- **Deploys.** A test and a production environment, each with its own database. Main deploys to test, every pull request gets a preview, and production deploys only when you start it. A failed deploy rolls back.
- **A versioned `/api/v1` HTTP API** in the TanStack Start pack, for mobile and desktop apps. It takes Clerk bearer tokens.
- **`setup-cloudflare`**, a script that creates the Cloudflare databases, buckets and queues and pushes the secrets. It shows a dry run first.
- **Presence across threads.** `/afk` in one thread tells the other threads on the machine that you're away. The first `/back` after it tells them you're back.
- **An opt-in work log.** Your first prompt starts the clock and `/afk` stops it. It lives in your home folder or a Google Drive folder, never in the repo.
- **CLI:** `doctor --fix` offers a fix for each problem and runs it only after a yes. `profile init`, `show` and `copy` manage your personal defaults. `init` installs the Claude Code hooks.
- Public project files: this changelog, a security policy, a contributing guide, a code of conduct, and issue and pull request templates for the kit itself.

### Changed

- The TanStack Start pack is hardened: security headers and a strict CSP on every response, rate and body limits, accessibility checks on every route, page-weight budgets in CI, and SEO files from the start.
- Making an app public is on the always-stop list, next to deploying to production.
- The README is rewritten, with a path chart and a flow chart.
- The coordinator names every skill from the issue in the builder's brief.

### Fixed

- `setup-github.mjs` now asks for your GitHub plan (`--plan free|team|enterprise`, or `github_plan` in your profile) and labels each step with the plan it needs. On a private repo, a required reviewer on `production` needs GitHub Enterprise, not Team. The script no longer claims Team turns it on.

## [0.3.0] - 2026-11-22

### Added

- **The check contract.** Every project has the same six commands, whatever the stack: `check`, `lint`, `typecheck`, `test`, `test:e2e` and `build`. Skills, CI and the loop call only those.
- **Guardrails.** CI runs the checks, a secret scan, and a guard that blocks changes to the agents' own rules until you add the `human-approved` label. Force pushes and pushes to main are blocked in the tool.
- **The TanStack Start stack pack.** A working web app with configs, the folder skeleton, an example module through every layer, CI and the checks. It runs with no accounts and no keys.
- **The `ai-dev-workflow` CLI:** `init`, `update`, `doctor` and `add`. It never overwrites a file of yours.
- **Codex support:** command rules and project settings, next to Claude Code's.
- **Know-how skills:** `web-performance`, `web-security`, `seo`, `a11y` and `dependencies`.
- **The `secrets` skill.** It lists every key the app needs and where to get it, and pushes values without printing them.
- **A one-time GitHub setup script**, sized to your plan.
- **A personal profile** for what never changes for you, and app presets for the product grill.
- Hooks for Claude Code: a session-start hook that gives every session the branch, the last commit and `docs/state.md`, and a desktop notification when an agent needs you.

### Changed

- Feature folders: a feature's UI, server code and schemas live together, and lint stops one feature importing another.
- Cloudflare first for hosting and data, where it's free.
- `qa` uses Playwright first, then your own browser.
- Agents tell you right away when they're rate-limited or blocked, and keep doing other work.

## [0.2.0] - 2026-11-22

### Added

- **Four commands:** `/idea`, `/join`, `/back` and `/afk`. The other skills are called for you.
- **Checks before merge.** Acceptance checks are tagged `auto` (CI runs them) or `agent` (a fresh agent checks the preview).
- **Lanes:** tiny, normal and risky. Only risky changes get a security review.
- **The always-stop list:** real data, production, secrets and money always wait for you.
- Slice 0 sets up CI, a boundary check and a test deploy.

### Changed

- Skills are renamed to short names that don't clash with built-in commands, and each one names the next.
- Reviewers read the diff from main, never the author's description. Two rejections send an issue to you.
- The product grill goes by topic, and the MVP's core is never a default.
- The strongest model plans. The everyday model writes the issues.

## [0.1.0] - 2026-11-22

### Added

- The first kit: `AGENTS.md`, skills for the product grill, the tech grill, research, the tracer-bullet pyramid, issues, model routing, the build loop, reviews and browser tests, plus templates and a guide.
- Skills live in `.agents/skills` for Codex and are copied to `.claude/skills` for Claude Code. CI checks the copies match.

[Unreleased]: https://github.com/jsmigendevelopment/AI-Dev-Workflow/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/jsmigendevelopment/AI-Dev-Workflow/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jsmigendevelopment/AI-Dev-Workflow/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jsmigendevelopment/AI-Dev-Workflow/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jsmigendevelopment/AI-Dev-Workflow/releases/tag/v0.1.0
