# Research

How onRails made its bigger decisions. These are the kit's history, not guides for your app: they stay in this repo and are never copied into a project. Each one has its sources inside and marks which claims were verified.

This folder follows the same standard as an app's `docs/research/` (the `research` skill). Each dossier has a `<topic>/provenance.json` with the model and effort of every role. These six were written before the standard, so most models and efforts are `unknown`: nobody recorded them. Check the folder with `node scripts/check-research.mjs research/`.

| Dossier | Question | Decision | Date | Status | Re-check | Author model · effort |
|---|---|---|---|---|---|---|
| [Foundations](foundations.md) | Which one library per area should the web pack use? | Temporal for time, `dinero.js` for money, a small logger of our own, Paraglide for translations, `zod-openapi`, and a typed `track()` for analytics. | 2026-11-23 | current | 2027-02-23 | unknown · unknown |
| [Platform packs](platform-packs.md) | Which stack pack should the kit build for mobile, desktop, Python, Unity and a monorepo? | Expo for mobile, Electron Forge for desktop, FastAPI for Python services, Unity with GameCI for games, and pnpm workspaces with Turborepo for monorepos. | 2026-11-22 | current | 2027-02-22 | unknown · unknown |
| [Electron pack](electron-pack.md) | What does a production-grade Electron starter pack need? | Electron 45 with Forge 8 and Vite, Electron's full security checklist, windows and tabs, terminals and an optional local API. | 2026-11-22 | current | 2027-05-22 | unknown · unknown |
| [Authorization](authorization.md) | How should the kit build in relationship-based authorization behind a port? | A small Zanzibar-style engine of our own on D1 behind one typed `Authz` port, with no library for now. | 2026-11-23 | current | 2027-02-23 | unknown · unknown |
| [Plugin plan](plugin-plan.md) | How should the kit ship as a Claude Code plugin? | The `core@onrails` plugin with `/or:` commands that install the kit and hand off to the project's own skills. | 2026-11-23 | superseded by the build in #4: `plugin/` is the source of truth | — | unknown · unknown |
| [Competitors](competitors.md) | Where does onRails stand against other kits that steer coding agents? | Twelve ranked ideas worth taking from GitHub Spec Kit, Superpowers, BMAD, OpenSpec, Task Master, Agent OS, Kiro and Conductor. | 2026-11-23 | current | 2027-02-23 | claude-opus-5-5 · unknown |
| [Agile flow](agile-flow.md) | How should the kit plan and run a build so small, try-able changes keep reaching the test site with few gaps? | Cut each pass into thin steps checked by a script, keep three issues in flight, and let the loop keep working at a pass gate while new scope waits for the person. | 2026-11-23 | draft | 2027-02-23 | claude-fable-5-2 · high |

Re-check dates: 3 months where prices, betas or fast-moving tools drive the answer, 6 months otherwise.
