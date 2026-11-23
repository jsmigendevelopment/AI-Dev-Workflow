# Changelog

All notable changes to the kit are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The kit's version is the one at the bottom of `AGENTS.md`. The CLI on npm carries the same version.

## [Unreleased]

### Being built

- A needs-you convention: one clear way for agents to flag what's waiting on you.
- A status board: where every issue and pull request stands, in one place.
- A "Coming soon" page that keeps an app private until you choose to make it public.

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
