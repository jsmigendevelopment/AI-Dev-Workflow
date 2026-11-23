# Research

How onRails made its bigger decisions. These are the kit's history, not guides for your app: they stay in this repo and are never copied into a project. Each one has its sources inside and marks which claims were verified.

| Document | What it decided | Date |
|---|---|---|
| [Foundations](foundations.md) | One library per area for the web pack: Temporal for time, `dinero.js` for money, a small logger of our own, Paraglide for translations, `zod-openapi`, and a typed `track()` for analytics. | 2026-11-23, fact-checked the same day |
| [Platform packs](platform-packs.md) | Which pack each platform gets: Expo for mobile, Electron Forge for desktop, FastAPI for Python services, Unity with GameCI for games, and pnpm workspaces with Turborepo for monorepos. | 2026-11-22, fact-checked the same day |
| [Electron pack](electron-pack.md) | What the desktop pack must contain: Electron 45 with Forge 8 and Vite, Electron's full security checklist, windows and tabs, terminals and an optional local API. | 2026-11-22, fact-checked 2026-11-23 |
| [Authorization](authorization.md) | A small Zanzibar-style engine of our own on D1 behind one typed `Authz` port, with no library for now. | 2026-11-23, fact-checked the same day |
| [Plugin plan](plugin-plan.md) | Ship the kit as the `core@onrails` plugin with `/or:` commands that install the kit and hand off to the project's own skills. | 2026-11-23, built in issue #4 |
