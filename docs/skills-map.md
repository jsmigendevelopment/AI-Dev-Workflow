# Skills map

Every folder in `.agents/skills/` has one row. This is step 1 of #86, the split into `core@onrails` (the method) and `apps@onrails` (the app-only parts). No file moves because of this map (decision 711-1).

- **`core`:** the method. It works for any kind of project, not only an app.
- **`app-only`:** it builds, checks or ships a web or mobile app. It moves to apps whole.
- **`mixed`:** the method plus app steps. The reason says which part would move to apps (it starts `Moves to apps:`). The rest stays in core.

The labels are an AI pick, not reviewed. The owner can change any of them. `cli/test/skills-map.test.mjs` keeps this table in step with the folders: a skill with no row, a row with no skill, a second row for one skill, a label that isn't one of the three, an empty reason, or a `mixed` row that doesn't say what moves, all fail it.

| Skill | Label | Reason |
|---|---|---|
| `a11y` | `app-only` | WCAG checks with axe on every route of a web app. |
| `afk` | `core` | Keeps the loop going while the person is away: usage, state note, watchdog, hard stop. Nothing in it is about apps. |
| `ask` | `mixed` | The Needs you levels, handoffs and the stop rules are method. Moves to apps: `preflight` and its reference (the install, port and browser probes of a build sandbox). |
| `automation` | `core` | The four levels and the custom switches for how much agents do alone. |
| `back` | `core` | Rebuilds the picture from the repo and the board, reports what changed, runs the retro. Its one dev-server line is a detail. |
| `build` | `app-only` | Builds one issue into code with tests, the checks and a pull request. |
| `coordinate` | `app-only` | The build loop: claims issues, runs the checks on each pull request, merges and smoke-tests the test site. |
| `dependencies` | `app-only` | Picks libraries and licences, and pins exact versions, for the app's code. |
| `diagnose` | `app-only` | Debugs failing code with a red check first, then the fix. |
| `grill` | `mixed` | How to ask (three questions, a recommended answer, a log) is method. Moves to apps: the product topics that lead into the screens (the main flow, look and feel) and the tech topics. |
| `idea` | `mixed` | The kickoff order is method. Moves to apps: the name, wireframes and stack steps, the presets and the app templates. |
| `issues` | `mixed` | The contract (acceptance checks, size, risk, dependencies) is method. Moves to apps: the Recipes line, the generator line and the `pnpm pr:rules` and preview wording. |
| `join` | `mixed` | Mapping a repo and grilling the person on what the code can't say is method. Moves to apps: running the app and the app-shaped docs it writes. |
| `name` | `app-only` | Names the app, makes its repo and moves the kickoff notes into `docs/`. |
| `pr-review` | `app-only` | Reviews a code diff for tests, fence, architecture and readability. |
| `pr-security` | `app-only` | Audits a code diff for access, input, secrets and injection. |
| `pyramid` | `mixed` | Passes, the thin test and the plan check are method. Moves to apps: slice 0 (the running app, the stack pack, the test deploy) and designing the schema and API from the wireframes. |
| `qa` | `app-only` | Runs the acceptance checks in a real browser on a preview or the test site. |
| `research` | `core` | Runs a focused research thread with three or more options and a fact-check, then writes a dossier. |
| `routing` | `mixed` | Roles, tiers, effort and the escalation steps are method. Moves to apps: the job rows for wireframes, build, review and browser checks. |
| `secrets` | `app-only` | Wires an app's API keys and environment variables, and `pnpm connect`. |
| `seo` | `app-only` | Meta tags, sitemap and share images of a web site. |
| `stack` | `app-only` | Picks the platform, framework, database, hosting and the risk dial for an app. |
| `stack-monorepo-expo` | `app-only` | Stack pack: a web app and an Expo mobile app in one repo. |
| `stack-tanstack-start` | `app-only` | Stack pack: a TanStack Start app on Cloudflare Workers. |
| `test-by-hand-as-the-user` | `app-only` | Clicks through the app in a browser and checks each value it shows. |
| `update` | `core` | Brings the onRails plugins, entry skills and project kit to the latest release, for any pack. |
| `web-performance` | `app-only` | Load speed, bundle budgets and Core Web Vitals of a web page. |
| `web-security` | `app-only` | Bots, spam, rate limits and security headers of a web app. |
| `wireframes` | `app-only` | Draws the app's screens in two stages and keeps the clickable prototype. |
| `writing-for-agents` | `core` | How to write a skill, `AGENTS.md` or an issue body so an agent follows it. |
