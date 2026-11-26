<!-- Made by scripts/npm-readme.mjs from README.md and cli/CLI.md. Edit those, then run it. -->

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/banner-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/banner.svg" alt="onRails: put your AI on rails. A train passes Pitch, Grill, Slice and Ship at golden hour. By Jay Smigen, JS Dev." width="960">
</picture>

[![Status: beta](https://img.shields.io/badge/status-beta-b45309?style=flat-square)](https://github.com/jsmigendevelopment/onRails/blob/main/CHANGELOG.md) Early and actively changing. Expect rough edges, especially on first setup.

**onRails** helps AI agents plan, build, review and ship your app within rules you set.

## ⚡ Install

Use Node 22 or newer with Claude Code or Codex. Run these two commands in a terminal to install for your Claude Code account.

```bash
claude plugin marketplace add jsmigendevelopment/onRails
claude plugin install core@onrails --scope user
```

Start a new Claude Code session. For other setups, see [Codex](#codex) or [npm](#from-npm).

## 💬 The four commands

| Claude Code · Codex | When to use it | What happens |
|---|---|---|
| [`/idea`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/idea/SKILL.md) · `$idea` | Start a new app | Plan from pitch to issues. Below Full, you approve the screens before tech work; on Full, the agent picks and sends them in an FYI. |
| [`/join`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/join/SKILL.md) · `$join` | Set up an existing repo | Map and run the repo, ask questions, then write `AGENTS.md` and `docs/`. |
| [`/back`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/back/SKILL.md) · `$back` | Start or resume work | See what changed, who's working and what to do first. |
| [`/afk`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/afk/SKILL.md) · `$afk` | Step away | Set a time, check usage and safety, then keep building until a hard stop. |

To get the latest onRails, type `/update` (`$update`). The other 26 skills run for you. To run one step yourself, see the [cheat sheet](https://github.com/jsmigendevelopment/onRails/blob/main/guide/cheat-sheet.md#-advanced-run-one-step-yourself).

[![npm package version](https://img.shields.io/npm/v/onrails?style=flat-square&color=a63407)](https://www.npmjs.com/package/onrails)
[![Works with Claude Code](https://img.shields.io/badge/works%20with-Claude%20Code-7c3aed?style=flat-square)](#-install)
[![Works with Codex](https://img.shields.io/badge/works%20with-Codex-2563eb?style=flat-square)](#codex)
[![MIT licence](https://img.shields.io/badge/licence-MIT-55566b?style=flat-square)](https://github.com/jsmigendevelopment/onRails/blob/main/LICENSE)

[Install](#-install) · [Commands](#-the-four-commands) · [Defaults](#-opinionated-defaults) · [A run](#-what-a-run-looks-like) · [Guardrails](#-guardrails) · [Stacks](#-stacks-and-add-ons) · [Existing repo](#-add-it-to-a-repo-you-already-have) · [Cheat sheet](https://github.com/jsmigendevelopment/onRails/blob/main/guide/cheat-sheet.md)

## More install options

### Install as a plugin

In Claude Code, check the account install with `claude plugin list`. Look for `core@onrails` at `user` scope.

Already in Claude Code? Run `/plugin marketplace add jsmigendevelopment/onRails`, then `/plugin install core@onrails`. Pick **user** when it asks for a scope, then run `/reload-plugins`. User scope works in any folder. Project and local scope work in that folder only.

The first time you use a command in a folder, it asks to install the kit there. The plugin includes the kit and keeps your files. If another plugin or command uses the same name, use the prefix, as in `/or:idea`.

### Codex

Run these two commands in a terminal:

```bash
codex plugin marketplace add jsmigendevelopment/onRails
codex plugin add or@onrails
```

Then type `$idea` or `$join`.

- **Update the plugin, and the rest of onRails.** Type `/update` (Codex: `$update`), or run `npx onrails@latest update --all` in a terminal. It updates the plugin, your global entry skills and the project's kit, then runs `doctor`. Then run `/reload-plugins`. By hand, it's `claude plugin marketplace update onrails`, then `claude plugin update core@onrails`; in Codex, `codex plugin marketplace upgrade onrails`.
- **Marketplace 'onrails' not found?** The marketplace was added in a project. Run both install commands again for your account.
- **The project's copy wins.** Once you install the kit in a folder, commands use that project's skills. Cloud sessions also use the repo's skills since they don't load personal plugins.
- **The plugin works without npm.** Its CLI includes the rules and skills. Stack packs come from a clone or from GitHub at slice 0.

### From npm

Run this in your project folder:

```bash
npx onrails init
```

It installs the rules and skills, keeps your files and offers to open Claude Code or Codex with `/idea` (or `/join` if the folder already has code).

| CLI command | What it does |
|---|---|
| `init [dir]` | Installs the kit, keeps your files and offers to start a session there. |
| `update [dir] --dry-run` | Updates the kit and keeps files you changed. `--dry-run` shows the plan first. |
| `update --all` | Brings everything to the latest: the plugin, your global entry skills and the project's kit, then `doctor`. The `/update` command runs it for you. |
| `doctor --fix` | Checks tools, sign-ins and env var names. Runs each offered fix after you type `y`. |
| `profile init` | Saves things like your GitHub owner, naming style and models in your profile. |
| `add <pack>` · `add <pack>/<add-on>` | Copies a stack pack or add-on into your project. `add --list` shows the packs. |

[CLI reference](https://github.com/jsmigendevelopment/onRails/blob/main/cli/README.md) · [Release steps for maintainers](https://github.com/jsmigendevelopment/onRails/blob/main/RELEASING.md)

## 🤔 What it is, and why

AI agents follow your instructions. Where you leave a gap, they guess. They can take the first fix that works, invent UI components or build extra features. Add onRails to your project to set the rules and check its work.

| Part | What it is | When it applies |
|---|---|---|
| [`AGENTS.md`](https://github.com/jsmigendevelopment/onRails/blob/main/AGENTS.md) | 13 standing rules, the code rules and a stop-and-ask list | Every session |
| 31 skills | Step-by-step instructions, one job each | When a request names the skill |
| Guardrails | CI checks, lint rules and blocked git commands | Always. They don't depend on a prompt. |

- **Rules and conventions keep it on track.** It asks instead of guessing. Lint and CI fail the build when the code breaks a rule.
- **You stay in charge.** You pick the product, the core and the stack. Production, secrets, real data and money always wait for you.
- **Nobody checks their own work.** One fresh agent builds an issue. Other fresh agents review it and test it.

See the [principles](https://github.com/jsmigendevelopment/onRails/blob/main/guide/principles.md) and [evidence](https://github.com/jsmigendevelopment/onRails/blob/main/guide/evidence.md) behind the kit.

## 🧰 Opinionated defaults

onRails ships its maker's own preferences. They are a starting point, not the only right way.

- **The stack:** TanStack Start on Cloudflare, Clerk for sign-in, shadcn/ui, Drizzle and pnpm. See [Stacks](#-stacks-and-add-ons).
- **The writing rules:** plain words, short sentences, about an 8th-grade reading level.
- **The model routing:** which model and effort runs each job. See [Model routing](#-model-routing).
- **The review steps:** nobody checks their own work, a fresh reviewer reads the diff, and a new commit needs a new review.

**What you can change today: your profile.** Make it with `npx onrails profile init`. It lives at `~/.onrails/profile.toml`, and each new project gets a copy as `docs/profile.toml`. The skills read it as your defaults. The sections that matter most:

| Section | What it sets |
|---|---|
| `[web]` | The framework, UI kit, database, sign-in, hosting, and tools never to suggest |
| `[defaults]` | The package manager, risk dial, automation level, grill mode, repo visibility and licence |
| `[design]` | The look and feel, light or dark, roomy or dense, and how your app's text sounds |
| `[routing]` | Your model for each tier, and whether to ask before the strongest one |

Below Full, the grill still shows each pick for you to confirm; on Full, each pick is an "AI pick, not reviewed" in an FYI. What you say in the session beats the profile. Only two stack packs are ready: TanStack Start, and TanStack Start with an Expo mobile app. For another stack, the agent sets up the same parts by hand. The risk dial and the automation level change who merges, but the review steps stay.

**What the profile can't change yet:** the rules in `AGENTS.md` and the skills, such as the writing rules and the review steps. Today you edit those files in your project. `update` keeps your edits and puts the kit's new copy next to yours to compare. Layered settings and personal rules, with no kit files to edit, are planned in [#124](https://github.com/jsmigendevelopment/onRails/issues/124). They haven't shipped yet.

**This is not a guarantee.** Agents can still be wrong, even with these rules and checks. You own what you ship.

## 🔁 What a run looks like

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/how-it-works-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/how-it-works.svg" alt="Plan once from pitch through issues. Then coordinate, build, run CI and code review, check the preview, review risky changes, merge to test and smoke test. Failed checks go back to Build. Your test site feedback becomes new issues." width="960">
</picture>

Plan once. Each step saves to files, so you can stop any time and pick up with `/back`.

| # | Step | What happens | Saved to `docs/` |
|---|---|---|---|
| 1 | **Pitch** | You describe the idea in your own words. The agent repeats it in 3 to 5 lines and points out weak spots. | |
| 2 | **Product grill** | Seven topics cover things people miss. Each round has three questions with suggested answers. Once the main flow is clear, your everyday model draws rough wireframes in the background. You describe the look, then the agent asks to use your strongest model for the full design. You see each screen as it's done. | `vision.md`, `features.md`, `decisions.md`, `wireframes/index.html`, `design.md` |
| 3 | **MVP** | You pick the one thing that makes the app stand out. | `mvp.md` |
| 4 | **Name** | While the screens finish, you get 5 to 7 names, `git init` and a GitHub repo if you say yes. | |
| 5 | **You approve the screens** (below Full) | Try the full set as a clickable light and dark prototype. Below Full, the agent asks what to change and starts tech work after you approve. On Full, it records the screens as "AI pick, not reviewed", goes on, and sends the prototype in an FYI. | `decisions.md` |
| 6 | **Tech grill** | Platform, stack, data, auth, environments, CI and the risk dial. Accept the picks or swap them. | `stack.md`, `architecture.md`, `security-policy.md` |
| 7 | **Plan** | On the strongest model (below Full, after you approve it), it outlines three passes, cuts the first into steps you can try, and designs the schema and API from the approved screens. A script checks the steps. | `pyramid.md`, `design.md` |
| 8 | **Issues** | One per step in the current pass. Each says what to try, gives WHEN/THEN checks with IDs, and lists scope limits, dependencies, risks, a lane and a complexity score. A read-only check looks for gaps in the plan. | GitHub issues |
| 9 | **Keys** | It lists the accounts and keys for the first deploy and helps you set them up in about 10 minutes. | |
| 10 | **Build loop** | Say "start the loop". Slice 0 sets up the app, CI and the test deploy. Then one fresh agent builds each issue, three in flight at most (one on Hands-on). | `state.md`, a line on what to try per merge |
| 11 | **Pass gate** | The loop keeps going. A fresh audit checks the code against the plan and screens. The loop fixes what it finds and does some cleanup. Try it when you can, then the agent plans the next pass. | `pyramid.md` |

**What each pull request goes through:** build → CI → code review → QA on the preview → security review (risky changes only) → merge the exact commit that was checked → deploy to the test site → smoke test. A failed check goes back to a fresh builder. After two rejected rounds, the issue is parked and you're asked.

**You control the test site.** The default stack lets you use Cloudflare Access, a password page or open access. Production starts on a “Coming soon” page. You decide when to go live.

### How the build is sliced: the tracer-bullet pyramid

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/tracer-bullet-pyramid-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/tracer-bullet-pyramid.svg" alt="Three passes narrow toward the core: Works covers every slice, Real deepens the core and key support, and Ready polishes the core. A gate sits between passes." width="960">
</picture>

If you build the full schema, then the API, then the UI, there’s nothing to try until the end. **Tracer bullets** cut through all three in thin slices. Try the first slice and steer while changes are cheap.

- **Slice 0** is the skeleton: the app runs, CI checks every pull request, and main deploys to test.
- **The MVP is three passes:** Works (a thin tracer bullet through every slice), Real (the core goes deep), Ready (the core polished, plus speed, accessibility, SEO and the launch checklist).
- **A pass is an improvement** to what's already there.
- **Each pass is cut into thin steps.** A slice is one thing the app lets you do, like "the shared list". A step is the smallest change to it that you can try, like "add an item". One step is one issue and one pull request, so every merge puts something new on the test site to try.
- **Only what the core can't work without** goes in the MVP. Everything else comes after.
- **A gate between passes:** a fresh audit and cleanup, which start at once, then you try it (on Full, `qa` tries it and nothing waits), then a re-plan. Later passes stay an outline until then.
- **The end of pass 3 is "MVP complete" on the test site, not launch.** Going live is your call, whenever you choose.
- **After the MVP, an hourglass:** the shape turns upside down and widens. Each layer adds new features, each in thin, plus a pass on what's already there, the core every time. Same gate between layers.

**In agile terms**, a step is a user story sliced vertically. A slice is the activity its stories belong to. A pass or a layer is an iteration. The gate is the review, the retro and backlog refinement in one. `features.md` is the backlog. "Done means" in `pyramid.md` is the definition of done. Three in flight is the work-in-progress limit. The kit makes agents follow these rules. [The research behind it](https://github.com/jsmigendevelopment/onRails/blob/main/research/agile-flow.md)

→ [The `pyramid` skill](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/pyramid/SKILL.md)

## 🔒 Guardrails

### Checks before merge

Every issue has a **lane**. The lane sets the checks.

| Lane | Checks before merge | When |
|---|---|---|
| **tiny** | CI · code review | Copy, styling, config. No logic. |
| **normal** | CI · code review · QA on the preview | Most issues |
| **risky** | Normal · security review · you, unless you chose Full automation | Auth, secrets, personal data, money, migrations, new dependencies |

- **The reviewer reads the diff.** It skips the pull request description.
- **The review names the commit to merge.** A new commit needs a new review.
- **A test is never weakened to pass.** The reviewer checks that too.

### Two dials

**The risk dial** is how careful each merge is. **The automation level** is how much agents do without you. Below Full, when they disagree, the more careful one wins. On Full, a careful dial adds reviews, never you (#103).

| Risk dial | Who merges | Pick it when |
|---|---|---|
| 🟢 **Move fast** | Agents, after the checks pass | Side project, no real users yet |
| 🟡 **Careful** | Agents. Below Full, you read schema and API changes first; on Full, an extra review. | Real users or real money |
| 🔴 **Strict** | You approve every merge (below Full; on Full, an extra review and a security review) | Bank, health, anything regulated |

| Automation level | Agents do | You do |
|---|---|---|
| **Recommended** | Run the loop. Build, review and merge tiny and normal changes. Deploy to test. | Approve risky and schema changes, answer decisions, try it |
| **Full** | Everything, risky too, plus overnight | Answer blockers |
| **Hands-on** | Plan, write issues, build one issue when asked | Open and merge every pull request |
| **Custom** | Whatever you set each switch to | |

Change it any time with `/automation`. → [Pings, the board and automation](https://github.com/jsmigendevelopment/onRails/blob/main/guide/staying-in-the-loop.md)

### The always-stop list

At every risk and automation level, the agent stops and asks before:

- deleting or migrating real data
- touching production settings, secrets or `.env` files
- deploying to production or making the app public
- spending money or signing up for a paid service
- stopping or restarting a running strongest-tier job on its own call. "Not yet" means new work only; your "stop it" stops it at once

### Security reviews

| Check | When | What it does |
|---|---|---|
| [`pr-security`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/pr-security/SKILL.md) | Risky lane | A fresh agent reads the diff against `docs/security-policy.md`: access, input, injection, secrets, data exposure, dependencies, abuse and money. |
| [`qa`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/qa/SKILL.md) | Normal and risky lanes | A fresh agent opens the preview in a real browser. It tries to read and delete another user's data. |
| Secret scan | Every pull request | gitleaks in CI. |
| Agent-file guard | Every pull request | Below Full, a change to the agents' own rules can't merge until you add the `human-approved` label. On Full there's no label: a fresh weakening review decides. |
| Second opinion | Personal data or money | A reviewer from another vendor's model, if you have one. |

### Code rules that fail the build

The rules are in [`AGENTS.md`](https://github.com/jsmigendevelopment/onRails/blob/main/AGENTS.md). In the `tanstack-start` pack, tools enforce them, so a review only judges what a tool can't.

| Rule | Checked by |
|---|---|
| No `any`, `@ts-ignore` or `as unknown as`. An exception needs a reason and an issue number. | ESLint |
| No `console`. No TODO without an issue number. No empty catch. | ESLint |
| Files stop at 500 lines and warn at 300. | ESLint |
| One feature can't import another. No barrel `index.ts` files. | ESLint, with a boundary check |
| Design tokens only. No one-off colours or sizes. | ESLint |
| No unused files, exports or dependencies. No copy-pasted code over 3%. | knip, jscpd |
| No migration that drops or renames a column, or stores money in a float. | A migration lint |
| Every pull request closes an issue and stays under about 400 changed lines. | A pull request check |
| Pages don't change by accident. | Screenshot tests, every route, both themes |

→ [Code style](https://github.com/jsmigendevelopment/onRails/blob/main/guide/code-style.md) · [App conventions](https://github.com/jsmigendevelopment/onRails/blob/main/guide/app-conventions.md) · [Testing](https://github.com/jsmigendevelopment/onRails/blob/main/guide/testing.md)

### Keys never go through chat

The [`secrets`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/secrets/SKILL.md) skill lists each variable and where to get it. It has click-by-click steps for 14 providers. You type values into a git-ignored file or a prompt. A script pushes them to GitHub and Cloudflare and prints names only. Paste a key into chat by mistake? It tells you to rotate it. → [Environments](https://github.com/jsmigendevelopment/onRails/blob/main/guide/environments.md)

### Tests that the skills change behaviour

[`evals/`](https://github.com/jsmigendevelopment/onRails/blob/main/evals/README.md) holds seventeen small scenarios, one per rule that matters most: the grill asks before it builds, no force push or push to main, keys never in chat or git, test first inside the fence, a reviewer catches a weakened test, the wireframe gate, asking before the strongest model, a plan cut into thin steps you can try, a plan cut by layer sent back, the auto grill surfacing a one-way door, slice 0 showing the running app before CI, a blocker recorded instead of left in chat, a handoff answered with a reading, "go ahead" building more than one issue, a blocked issue not stopping the next one, "not yet" leaving a running strongest-tier job alone, and "stop it" stopping it. Each runs in Claude Code twice, with the kit and without, and checks what the agent did from its transcript and files, never from another model's opinion. A scenario passes only if the kit made the difference. CI runs them on Claude Haiku 5.5 when a skill, `AGENTS.md`, the plugin or a script changes. A full run cost about $0.16 when measured in 2026-11. Not every scenario passes on that model yet: [the evals README](https://github.com/jsmigendevelopment/onRails/blob/main/evals/README.md#cost-controls) says which. `npm run evals` runs them locally with your own login.

### And the rest

| Guardrail | How it works |
|---|---|
| **No force pushes, no pushes to main** | Blocked in the tool: `.claude/settings.json` for Claude Code, `.codex/rules/git-safety.rules` for Codex. Codex rules match only the start of a command, so a `--force` typed after the branch name is left to rule 12 in `AGENTS.md`. |
| **No silent waiting** | A rate-limited or blocked agent tells you what's blocked and when it resets, then keeps doing other work. |
| **A few things at a time** | The loop keeps three issues in flight (one on Hands-on), counting claimed work that waits on you, and finishes one before it starts another. `flow.mjs` prints how many merged, how long one took and the longest gap with no merge. |
| **Every session starts informed** | A hook gives the session the branch, the last commit and `docs/state.md` before you type. Local files only. |
| **Pings at three levels** | 🛑 Blocker: now. ⏳ Decision: batched. ℹ️ FYI: never interrupts. A desktop notification, or your phone if you set `NTFY_TOPIC`. |

## 📦 Stacks and add-ons

The tech grill recommends a stack and shows the options for each part. Keep its picks or swap them. These are the web app defaults.

| Part | Recommended | Or |
|---|---|---|
| Framework | **TanStack Start** (React, TypeScript) | Next.js, React Router, SvelteKit |
| Look and feel | **shadcn/ui** components + **Tailwind** | Mantine, Radix |
| Database | **SQLite** on Cloudflare D1, queried with **Drizzle** | Supabase Postgres, Convex |
| Sign-in | **Clerk** | Supabase Auth, Better Auth |
| Hosting | **Cloudflare Workers** | Netlify |
| Tests | **Vitest** for units, **Playwright** in a real browser | Jest |

**How the server side talks to the app:**
- **The web app** calls typed server functions, so there's no API layer to write by hand.
- **Phones and other clients** get a versioned HTTP API at `/api/v1`, signed in with Clerk tokens.
- **Every input** is checked with Zod schemas, on both paths.

**When a feature needs it, the defaults are TanStack libraries:**
- Query for server data;
- Form;
- Table;
- Charts;
- Markdown;
- Highlight for code;
- Virtual for long lists;
- Hotkeys.

Each one comes with a recipe. Nothing is installed until a feature needs it.

**How the code is laid out:** one folder per feature. A request goes route → service → database, and features can't reach into each other. That's a rule lint enforces, not a stack choice. See [Guardrails](#-guardrails).

A **stack pack** is that stack already working: configs, the folder skeleton, an example module through every layer, CI and the checks. At slice 0 the agent pulls it into your project. There are 5 packs: 2 ready, 3 stubs.

| Pack | Status | What's in it |
|---|---|---|
| [`tanstack-start`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start/) | Ready | The default web stack on Cloudflare. It runs, tests and builds with no accounts and no keys. Security headers, rate limits, accessibility checks, SEO files, generators and deploys are in from the start. |
| [`monorepo-expo`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/monorepo-expo/) | Ready | One repo for web and mobile: an Expo app for iOS and Android, the web pack in `apps/web`, and one API contract both follow. |
| [`electron-desktop`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/electron-desktop/PACK.md) · [`python-fastapi`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/python-fastapi/PACK.md) · [`unity`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/unity/PACK.md) | Stub | Researched and fact-checked in 2026-11. Not built yet. The agent builds the starter in your project from `PACK.md`. |

No pack for your stack? The agent sets up the same things by hand, and offers to save the result as a new pack.

The `tanstack-start` pack has 7 optional **add-ons**. The tech grill offers them as needed. Without keys, the app still builds and the add-on stays off.

| Add-on | Adds | Lane |
|---|---|---|
| [`analytics`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start-addons/analytics/ADDON.md) | Cloudflare Web Analytics | tiny |
| [`sentry`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start-addons/sentry/ADDON.md) | Error reports from the server and the browser | normal |
| [`jobs`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start-addons/jobs/ADDON.md) | Background jobs and schedules | normal |
| [`email-resend`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start-addons/email-resend/ADDON.md) | Sending email through Resend | risky |
| [`stripe`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start-addons/stripe/ADDON.md) | Checkout, the customer portal and a signed webhook, in test mode | risky |
| [`r2-uploads`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start-addons/r2-uploads/ADDON.md) | File uploads to Cloudflare R2, scoped to the owner | risky |
| [`database-supabase`](https://github.com/jsmigendevelopment/onRails/blob/main/stacks/tanstack-start-addons/database-supabase/ADDON.md) | A move from D1 to Supabase Postgres | risky |

**The check contract:** every project has the same six commands, whatever the stack: `check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`. The skills, CI and the loop call only those.

## 🧠 Model routing

The strongest model at high effort takes more time and usage. The cheapest model can miss things. onRails picks a **model tier** and an **effort level** for each job.

| Job | Tier · effort | Example model |
|---|---|---|
| The thread you talk to all day (the loop) | Everyday · low | Claude Opus 5.5 |
| Grill and planning chat | Everyday · medium | Claude Opus 5.5 |
| Wireframes, stage 1: grey-box layout | Everyday · medium | Claude Opus 5.5 |
| **CTO work:** research, the pyramid, schema, API design, wireframes stage 2 (the detailed design) | **Strongest · high** | Claude Fable 5.2 |
| Writing issues from the plan | Everyday · medium | Claude Opus 5.5 |
| Building an issue | Everyday · low at complexity 1–4, medium at 5–7 or from pass 2 | Claude Opus 5.5 |
| Code review | Everyday · never below the builder | Claude Opus 5.5 |
| Security review (risky changes only) | Everyday · one step above review | Claude Opus 5.5, plus a second vendor's model when it touches personal data or money |
| Browser checks | Everyday · low | Claude Opus 5.5 |
| Art, visuals, names | Creative | ChatGPT |

<sub>The example models were checked in 2026-11. Pick your own models for each tier.</sub>

- **It asks before it uses the strongest tier.** You can turn the question off in your profile.
- **Start low.** Go up one step only after a failed check or a rejected review.
- **A reviewer never runs below the builder's effort.**

**Accounts.** More than one Claude or Codex account, like a work one and a personal one? `/idea` and `/join` ask once, walk you through signing each in with its own config folder (`CLAUDE_CONFIG_DIR` or `CODEX_HOME`), and write `[accounts]` in your profile. **It's a fixed split by job or project that you set, never by usage.** onRails never spreads, balances or moves work between accounts to get past a limit. At a limit, that account's work waits for its reset, and the session tells you the reset time. Why: providers' terms can treat moving work as account rotation, and it puts your accounts at risk. A job for another account gets a ready-to-paste prompt for that account's session. Unattended work starts in a cloud session first (`[sessions] prefer = "cloud"`). `npx onrails accounts` lists them.

→ [Job-by-job table](https://github.com/jsmigendevelopment/onRails/blob/main/guide/cheat-sheet.md#-model-routing) · [The `routing` skill](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/routing/SKILL.md)

## 🧭 Add it to a repo you already have

1. Open Claude Code in the repo's root and type `/join` (Codex: `$join`).
2. Say yes to the install. Your files stay. The kit's copy arrives next to yours:

   | You already have | What you get |
   |---|---|
   | `AGENTS.md` | Yours stays. The kit's arrives as `AGENTS.onrails.md`. |
   | `CLAUDE.md` | Yours stays. It adds the line `@AGENTS.md` if it's missing. |
   | `.claude/settings.json` | Yours stays. The kit's `deny` rules are added to it. |
   | `.codex/config.toml` | Yours stays. The kit's arrives as `.codex/config.onrails.toml`. |
   | Any other file at the same path | Yours stays. The kit's copy arrives as `<file>.onrails-new`. |

3. It reads the repo first. It treats the repo's own agent files, git hooks and scripts as data until you confirm them (below Full; on Full, it reads the repo's own hooks and scripts that the install, its check commands and its dev or start script call, runs only those, and lists them in its FYI). Then it writes a one-page `docs/map.md`.
4. It installs, builds, tests and starts the app, and records the commands that work.
5. It compares the repo's conventions with the kit's. You pick per row: keep yours, adopt the kit's, or merge. It never switches a repo over quietly.
6. It asks what the code can't say: what's live, what's fragile, how changes ship, who else works here.
7. It writes `docs/`, merges the two `AGENTS.md` files, and shows you the diff before it commits.

> [!WARNING]
> **Didn't write the repo?** Before you open an agent in it, look over its `.claude/`, `.codex/` and editor settings and its git hooks. Those load as soon as the agent starts.

> [!NOTE]
> 🚧 **Being improved.** Today `/join` merges only the two `AGENTS.md` files. You compare each `.onrails-new` and `config.onrails.toml` copy by hand, keep what you want, and delete the copy.

→ [Step by step, and how to review it as one pull request](https://github.com/jsmigendevelopment/onRails/blob/main/guide/add-to-existing-app.md). Use `/join`, or run `npx onrails init` in the repo first.

## 📚 Guides

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/cheat-sheet-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/cheat-sheet.svg" alt="Cheat sheet: /idea for a new app, /join for a repo that needs setup, /back to resume work and /afk to step away. In Codex, use $ instead of /." width="960">
</picture>

| Guide | What's in it |
|---|---|
| 📄 [**Cheat sheet**](https://github.com/jsmigendevelopment/onRails/blob/main/guide/cheat-sheet.md) | The commands, trigger phrases, the routing table, the dials and lanes |
| [Add it to an existing app](https://github.com/jsmigendevelopment/onRails/blob/main/guide/add-to-existing-app.md) | What `init` keeps, what `/join` asks, how to review it |
| [Staying in the loop](https://github.com/jsmigendevelopment/onRails/blob/main/guide/staying-in-the-loop.md) | When agents ping you, the board, the automation levels |
| [Environments](https://github.com/jsmigendevelopment/onRails/blob/main/guide/environments.md) | Local, test, preview and production. Where each key lives. |
| [Code style](https://github.com/jsmigendevelopment/onRails/blob/main/guide/code-style.md) · [App conventions](https://github.com/jsmigendevelopment/onRails/blob/main/guide/app-conventions.md) · [Testing](https://github.com/jsmigendevelopment/onRails/blob/main/guide/testing.md) | The rules the builders follow, with the reason for each |
| [Principles](https://github.com/jsmigendevelopment/onRails/blob/main/guide/principles.md) · [Evidence](https://github.com/jsmigendevelopment/onRails/blob/main/guide/evidence.md) | The 10 ideas behind the kit, and the tests behind them |
| [Plugin plan](https://github.com/jsmigendevelopment/onRails/blob/main/research/plugin-plan.md) | Why the plugin works the way it does |
| [Research](https://github.com/jsmigendevelopment/onRails/blob/main/research/README.md) | [Foundations](https://github.com/jsmigendevelopment/onRails/blob/main/research/foundations.md) · [Platform packs](https://github.com/jsmigendevelopment/onRails/blob/main/research/platform-packs.md) · [Electron](https://github.com/jsmigendevelopment/onRails/blob/main/research/electron-pack.md) · [Authorization](https://github.com/jsmigendevelopment/onRails/blob/main/research/authorization.md) · [Agile flow](https://github.com/jsmigendevelopment/onRails/blob/main/research/agile-flow.md) |

### What’s in this repo

```
AGENTS.md                  ← rules every agent follows, every session (Codex + Claude)
CLAUDE.md                  ← one line: @AGENTS.md
.agents/skills/            ← the 31 skills, master copy (Codex reads this)
.claude/skills/            ← the same skills (Claude Code reads this)
.claude/settings.json      ← Claude Code: blocked git commands and hooks
.claude/hooks/             ← the session-start and notify hooks
.codex/                    ← Codex: settings, command rules, and the same hooks
.github/ISSUE_TEMPLATE/    ← the slice issue template
stacks/                    ← 5 stack packs and 7 add-ons
cli/                       ← the onrails CLI
plugin/                    ← the plugin: the four entry skills, `update` and a copy of the CLI (generated)
.claude-plugin/            ← the plugin marketplace (Codex: .agents/plugins/)
guide/                     ← the guides above
research/                  ← the research and plans behind the kit (never copied into a project), indexed with provenance
assets/                    ← diagrams
scripts/sync-skills.mjs    ← keeps the skill copies identical, and makes plugin/skills
scripts/check-research.mjs ← checks a research folder: index, provenance, labels, re-check dates (ships in the research skill)
```

| Skills | |
|---|---|
| **You type** (5) | `idea` · `join` · `back` · `afk` · `update` |
| **Planning** (9) | `grill` · `wireframes` · `name` · `stack` · `secrets` · `research` · `pyramid` · `issues` · `routing` |
| **The loop** (9) | `coordinate` · `build` · `diagnose` · `pr-review` · `pr-security` · `qa` · `test-by-hand-as-the-user` · `ask` · `automation` |
| **Know-how**, named in issues (6) | `web-performance` · `web-security` · `seo` · `a11y` · `dependencies` · `writing-for-agents` |
| **Stack packs** (2) | `stack-tanstack-start` · `stack-monorepo-expo` |

## 🤝 Contributing

Fixes and clearer words are welcome. To keep the kit small, start with an issue for a new skill, pack or add-on. [CONTRIBUTING.md](https://github.com/jsmigendevelopment/onRails/blob/main/CONTRIBUTING.md) · [Code of conduct](https://github.com/jsmigendevelopment/onRails/blob/main/CODE_OF_CONDUCT.md) · [Changelog](https://github.com/jsmigendevelopment/onRails/blob/main/CHANGELOG.md)

Report security problems privately. [SECURITY.md](https://github.com/jsmigendevelopment/onRails/blob/main/SECURITY.md)

## 🙏 Credits

| Who | What onRails took |
|---|---|
| **Matt Pocock** ([his video](https://www.youtube.com/watch?v=4DhcSPkEbwI) · [his skills](https://github.com/mattpocock/skills)) | The "grill me" interview (his [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) skill), the push to do test-driven development with AI (his [`tdd`](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) skill), and the skills adapted from his: `diagnose` (from [`diagnosing-bugs`](https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs)), the red, green, refactor loop in `build`, the retro in `/back` and `/afk` (from [`retro`](https://github.com/mattpocock/skills/tree/main/skills/engineering/retro)) and `writing-for-agents` (from [`writing-for-agents`](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents)). MIT, see [NOTICE](https://github.com/jsmigendevelopment/onRails/blob/main/NOTICE) |
| **Andy Hunt and Dave Thomas,** [*The Pragmatic Programmer*](https://pragprog.com/titles/tpp20/) | Tracer bullets: thin slices that run end to end, the idea behind the pyramid |
| **Kent Beck,** *Test-Driven Development: By Example* | Write the failing test first |
| **[Code with Antonio](https://www.youtube.com/@codewithantonio)** | Feature modules with views, sections and components |
| **[Ruby on Rails](https://rubyonrails.org/)** | Conventions over configuration, generators, and the name |
| **Google's [Zanzibar paper](https://www.usenix.org/conference/atc19/presentation/pang)** | Permissions by relationship |
| **TanStack, Clerk and Cloudflare** | Their own agent prompts, quoted and dated in the recipes and walkthroughs |

## 📜 Licence

[MIT](https://github.com/jsmigendevelopment/onRails/blob/main/LICENSE). Use it, change it, ship with it.

---

<!-- onrails:signature start -->
<p align="center">
  <a href="https://jsmigen.dev">
    <img src="https://jsmigen.dev/brand/readme/professional-mark.svg" width="64" height="64" alt="JS Dev monogram">
  </a><br>
  Built by <a href="https://jsmigen.dev"><b>Jay Smigen</b></a><br>
  <sub>JS Dev · Full-stack software engineer</sub><br><br>
  <a href="https://jsmigen.dev">JS Dev</a> ·
  <a href="https://me.jsmigen.dev">Portfolio</a> ·
  <a href="https://jsmigen.dev/blog/">Build Log</a> ·
  <a href="https://www.linkedin.com/in/jayson-smigen/">LinkedIn</a> ·
  <a href="https://github.com/jsmigendevelopment">GitHub</a>
  <br><br>
  <sub>Build it right. Ship it.</sub>
</p>
<!-- onrails:signature end sha256=60f1ea1f381e9b6d2458a0cc4cd15e943393915d1873455b8d009d0cf06cc8c8 -->

---

# CLI reference

Needs Node 22 or newer. No dependencies, and works offline: each CLI version carries one kit version.

### Use it

In your project folder:

```bash
npx onrails init
```

At the end it asks: **Start Claude Code here now with /idea? (Y/n)**. Say yes and your terminal becomes that session, with `/idea` already typed. It's `/join` when the folder already has files other than a README, licence, `.gitignore` or `.git`. With both Claude Code and Codex installed, it asks which; Codex gets `$idea` or `$join`. It asks only in a real terminal, never in CI or when piped. `--start` starts with no question (Claude Code if you have both), `--no-start` never starts. Using the desktop app or an IDE instead? Open the folder there, start a new session and type the command. In Codex, mark the project as trusted when it asks.

| Command | What it does |
|---|---|
| `npx onrails init [dir]` | Installs the kit: `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/`, `.codex/` and `.github/ISSUE_TEMPLATE/`. Writes `.onrails.json`, a record of what it installed. Then offers to start a session (`--start`, `--no-start`). |
| `npx onrails init --global` | Copies only the four entry skills (`idea`, `join`, `back`, `afk`) to `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex), so `/idea` works in any folder before the kit is there. Never overwrites: a file you changed keeps yours, and the kit's copy goes next to it as `.onrails-new`. In Claude Code your personal copy runs instead of a project's copy with the same name, so keep them in step. The [plugin](https://github.com/jsmigendevelopment/onRails#install-as-a-plugin) is the recommended way now; use one or the other. |
| `npx onrails@latest update [--dry-run] [--yes]` | Updates to the newest kit. Files you haven't touched are replaced, files you changed are kept, new kit files are added, and files dropped from the kit are deleted if you never changed them. `--dry-run` shows the plan and writes nothing. A repo on Full automation coming from a kit before 0.7.0 is told so. `--yes` renames a kit record that still has its old name (see [Moving from ai-dev-workflow](#moving-from-ai-dev-workflow)). |
| `npx onrails@latest update [dir] --all [--dry-run] [--yes]` | Brings everything to the latest, in order: (1) the onRails plugin, with `claude plugin marketplace update onrails` then `claude plugin update core@onrails` for Claude Code and `codex plugin marketplace upgrade onrails` for Codex, only for a tool whose plugin is installed, each run by the full path found on `PATH` with no shell (on Windows a `.cmd` shim, such as an npm-installed `claude`, runs through `cmd.exe` by its full path). The `PATH` search skips relative entries, entries whose real path is inside the project or the current folder, and every `node_modules/.bin` (npx puts the project's first), so a `claude` the project ships never runs. The project is the nearest folder at or above `dir` that has `.onrails.json`, so a run from a subfolder works the same: the project kit step and `doctor` use it. The nearest such folder at or above the current folder only has its tools skipped; its kit is not updated. A filesystem root never counts as the project or the current folder, and neither do the home folder and a folder that holds it (`/home`) unless it has `.onrails.json`, so `~/.local/bin` is searched when you run it from `~`. A project that holds `HOME` is still a project, so its tools are skipped; when `~` itself is an onRails project, every tool folder under it is skipped. A tool found only in a skipped entry is named as that (`claude found only inside this project, not run`). When `~` is the project, the message adds its path and the commands to run by hand if it is yours; anywhere else it says a project can ship its own, with no command. On Windows a `.cmd` path that holds `%` is refused, since `cmd.exe` expands it even inside quotes. On Windows `NoDefaultCurrentDirectoryInExePath=1` is set for every command `update --all`, `doctor --fix` and `init --start` start, so the agent session `init --start` opens, and what it runs, inherit it; (2) the global entry skills, when `init --global` was used, the same way `init --global` copies them; (3) this project's kit, as `update` does, when the folder is in an onRails project (else it says it skipped it); (4) `doctor`. Then a summary of each part's version before and after, and what's left, such as `/reload-plugins` in Claude Code. A failed plugin command is shown and ends that tool's steps; the rest still run, and the exit code is 1. `--dry-run` prints the plan and runs nothing. It never bumps, tags or publishes a version. In Claude Code or Codex, the [`/update`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/update/SKILL.md) command (`$update`) runs `npx onrails@latest update --all` for you, from a temp folder outside the project, with the project's path. A part that fails is shown as FAILED; `doctor` and the summary still run, and the exit code is 1. Plain `update` still updates only the project. |
| `npx onrails doctor` | Checks Node, git, `gh` and its sign-in, pnpm, Claude Code or Codex, the kit and its version (a repo on Full automation with a kit before 0.7.0 gets an ✗: those kits still stop for gates that Full and your decisions lift), `AGENTS.md`, that `.agents/skills` and `.claude/skills` match, `docs/state.md`, that `.env.example` names every variable in `.env.local`, the Playwright Chromium (when the project uses `@playwright/test`) and wrangler and its sign-in (when there's a `wrangler.jsonc`), that your global entry skills (from `init --global`) match this CLI's kit, and whether the onRails plugin is installed (Claude Code or Codex) and matches the project's kit version, and that each account's config folder in the profile's `[accounts]` exists. It reads local install records only, and never looks inside an account's folder. Each problem gets a one-line fix. |
| `onrails preflight [dir] [--record] [--if-changed] [--json] [--mark-read] [--model <id>] [--effort <level>] [--tool <name>]` | For agents. `doctor` checks your terminal; this checks the agent's own sandbox, which has other permissions. It probes repo write, `.git` write, the package registry, GitHub, loopback, a browser (when the tests use Playwright), Node and the package manager, and prints one table. Each failure gets a ladder: a workaround in the sandbox, one command outside it, the environment tools, and you last, in one message. `--record` writes the result to `docs/state.md`; `--if-changed` skips the probes when nothing changed. It changes nothing but temp files. The kit ships the same script: `node .agents/skills/ask/scripts/preflight.mjs`. Run that, or a globally installed `onrails` by its absolute path, never through `npx` before the repo has been read (`--mark-read`): npx changes `PATH` and which `onrails` runs, in ways the repo can steer. |
| `npx onrails ps [dir] [--json]` | Lists every background process an agent started through the process registry: its id, age, owner session and whether that session is still alive, CPU, memory, why it runs and when it should stop. Stale ones (their session is gone, or they're past their time or their pause) are marked. It reads the project's `.onrails/procs.json` (shared by its worktrees and ignored by git), `~/.onrails/procs.json` and every project registry listed in `~/.onrails/procs-index.json`. The kit ships the same script for agents and the session hooks: `node .agents/skills/ask/scripts/procs.mjs`. |
| `npx onrails ps [dir] --stop <id\|all\|stale\|pid> [--yes]` | Stops them: TERM to the process group (on Windows, `taskkill /T`), then KILL (`/F`) after 5 seconds, to the group's other members too if its leader has gone. Before any signal it checks each record: a PID above 1 that isn't itself, its parent or the agent, a start time that matches the live process (a record with none is never used), and, for a group signal, a process that leads its own group, in a group that holds none of those three. A PID the system gave to another program is left alone. A PID the registry didn't record, or one another session started that is live or has no agent recorded, gets a `[y/N]` question first; `--yes` answers it. A registry that git tracks (or that git can't answer for), that another user owns or can write, whose folder or logs folder another user owns or can write (only `~/.onrails` may be group-writable, never world-writable), or that is a symlink or not a plain file is never read or written. The file is checked and read through one open file, and so is the index. An index entry must be the registry of a git repo the user owns, whose root others can't write: the group only when the root has the sticky bit or the group is the user's own, with no one else in it, and the root has no ACL (on Linux, asked of `getfacl` or GNU `ls`; anything unclear counts as one). A registry of yours that others can write (one written at `0664` before this check) is refused with the `chmod 600` that fixes it, its records are kept, and `ps` and `doctor` name it with that line. An index written at `0664` before this check is named the same way, and the next write keeps its entries. `ps` without `--stop` only reads. |
| `npx onrails doctor --fix [--yes] [--dry-run]` | Offers a fix for each problem and runs it only after you type `y` (`--yes` says yes to all, `--dry-run` only prints the plan). See [What `doctor --fix` does](#what-doctor---fix-does). |
| `npx onrails accounts [dir]` | Lists the accounts in the profile's `[accounts]` (the project's `docs/profile.toml`, else yours): label, tool, config folder and whether it exists, projects and jobs. Accounts are a fixed split by job or project, never by usage. |
| `npx onrails signature [--theme professional\|personal] [--style full\|compact] [--markdown] [--write <file>]` | Prints your README signature from `[me.signature]` in the profile (the project's `docs/profile.toml`, else yours). `--theme personal` puts `[me.signature.personal]` on top. `--style compact` makes it one line. `--markdown` prints plain Markdown instead of HTML. `--write README.md` keeps the signature as the file's ending. It writes the block between `<!-- onrails:signature start -->` and `<!-- onrails:signature end sha256=<hex> -->`, the sha256 of the block, or adds `---` and the block at the end, so running it again changes nothing. A later run replaces the block when the end marker is the last non-blank line (markers count only as whole lines at column 0, outside fenced code) and the block's sha256 matches, or, for an end marker with no sha256, when the block equals a render of the current profile in any theme, style or mode. Anything else between the markers is refused. It keeps the file's line endings. A lone marker, two pairs, a reversed pair, text after the end marker or a code fence left open at the end is refused. Every key must have its type: strings, sizes from 1 to 512, `links` as `{ label, url }` strings. Unknown, dotted and duplicate keys, `[[me.signature.links]]` and `me = { signature = .. }` are refused. Values are allowlisted in every mode: URLs are plain `https://` with a lowercase host and a path (no port, query, fragment, `%`, `&` or `@`); text is normalized to NFC and holds only letters, numbers, emoji (skin tones, joined emoji, keycaps and flags too), single spaces and `. , ! ? ' ’ - – : ; ( ) & +`, with no combining mark left over, no invisible filler, and no email, `mailto:`, bare `scheme:` or `www.`. A colon before a space or at the end ("Builder: web apps", "Note:") is fine. A full stop needs a space after it or must end the value, so `example.com`, `Node.js` and `2.0` are refused, except in a link label. Escaping (HTML, and Markdown with `--markdown`) stays as a second layer. `mark_dark` is checked but not used yet. Exit codes: 1 a refused value or markers (nothing is written), 2 bad flags, 3 no `[me.signature]` (it says how to add one). |
| `npx onrails profile init [--yes]` | Makes your personal profile, `~/.onrails/profile.toml`, from the kit's template: asks for your GitHub owner, plan (free, team or enterprise), naming style and models per tier, with defaults. Asks before replacing one you have (`--yes` takes the defaults and never replaces). |
| `npx onrails profile show` | Prints your profile. |
| `npx onrails profile copy [dir]` | Copies your profile into `<dir>/docs/profile.toml`, asking before replacing a different one. `init` does this too when the project has none. |
| `npx onrails add <pack> [--force]` | Copies a stack pack (a working starter app) into the project root and prints its next steps. Files you already have are skipped unless you pass `--force`. |
| `npx onrails add --list` | Lists the stack packs. |
| `npx onrails add <pack> --list-addons` | Lists a pack's optional add-ons (for `tanstack-start`: analytics, sentry, email-resend, jobs, stripe, r2-uploads, database-supabase). |
| `npx onrails add <pack>/<addon> [--force]` | Copies an add-on's new files into the project (files you already have are skipped unless you pass `--force`), then prints the rest of its `ADDON.md` apply steps: installs with pinned versions, and small edits to `composition.ts`, `wrangler.jsonc` and friends. |

onRails was called AI-Dev-Workflow before. The old `ai-dev-workflow` and `adw` commands are gone: use `onrails`.

### What `doctor --fix` does

Every command is shown in full before it runs, `sudo` included, and runs only after a yes.

| Problem | Fix |
|---|---|
| git or `gh` missing | Windows: `winget install --id Git.Git` / `GitHub.cli`. macOS: `brew install git` / `gh` (no Homebrew: a link to https://brew.sh). Linux: `sudo apt-get`, `dnf` or `pacman`, whichever you have (no `sudo` as root). |
| pnpm missing | `corepack enable` then `corepack prepare pnpm@latest --activate` (first `npm install -g corepack` if your Node has none). |
| Playwright Chromium missing | `pnpm exec playwright install chromium` in the project (after `pnpm install` if needed). |
| `.claude/skills` differs from `.agents/skills` | Replaces `.claude/skills` with a fresh copy of `.agents/skills`, the master. |
| `.env.example` missing names from `.env.local` | Adds the missing names with no values (creates the file if needed). Values are never printed or copied; they're read only to tell you which are empty. |
| wrangler not in the project | Prints `pnpm add -D wrangler` for you to run (never a global install). |
| Sign-ins (`gh auth login`, `wrangler login`), Claude Code, Codex, Node, the kit | Printed for you to run yourself. The Claude Code and Codex installers change, so they're never run for you. |

### Your own files are safe

- **`AGENTS.md`** already there: the kit's goes in `AGENTS.onrails.md`. Type `/join` and it merges the two.
- **`CLAUDE.md`** already there: kept, with `@AGENTS.md` added on its own line if it's missing.
- **`.claude/settings.json`** already there: kept, with the kit's `permissions.deny` rules added.
- **`.codex/config.toml`** already there: kept. The kit's goes in `.codex/config.onrails.toml`.
- **Any other file** you already have or have changed: kept. The kit's copy goes next to it as `<file>.onrails-new`. Compare the two, keep what you want, and delete the `.onrails-new`.

Commit `.onrails.json`: `update` uses it to tell your changes from the kit's.

### Moving from ai-dev-workflow

Projects and machines set up before the rename keep working. Nothing is deleted without a yes.

| Old name | New name | What happens |
|---|---|---|
| `~/.ai-dev-workflow/` | `~/.onrails/` | While only the old folder exists, the CLI and the kit's scripts read and write it there. Each CLI command (not `doctor`) offers to move it, `[y/N]`; `--yes` moves it. `doctor` reports it, and `doctor --fix` offers the move. |
| `.ai-dev-workflow.json` | `.onrails.json` | Read when the new one is missing. `update` offers to rename it, `[y/N]`; `--yes` renames it. A no keeps writing the old name. |
| `AGENTS.kit.md`, `.codex/config.kit.toml` | `AGENTS.onrails.md`, `.codex/config.onrails.toml` | `update` deletes the old copy if you never changed it and adds the new one. One you edited is kept. `/join` merges either name. |
| `<file>.kit-new` | `<file>.onrails-new` | Left where it is. `update` lists the ones still waiting, and `/join` reads both. |
| `ADW_NOW`, `ADW_NOTIFY_PRINT`, `ADW_THREAD` | `ONRAILS_NOW`, `ONRAILS_NOTIFY_PRINT`, `ONRAILS_THREAD` | The scripts read both. |

### Develop and publish

The kit is copied from the repo into `cli/kit/` (not committed) by `npm run bundle`, which also runs before every `npm pack` and `npm publish`.

```bash
cd cli
npm run bundle && npm test
npm pack --dry-run      # see what would ship
```

Publishing runs in GitHub Actions on a `v*` tag, with no npm token. [RELEASING.md](https://github.com/jsmigendevelopment/onRails/blob/main/RELEASING.md) has the one-time setup and the steps for each release.
