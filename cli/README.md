<!-- Made by scripts/npm-readme.mjs from README.md and cli/CLI.md. Edit those, then run it. -->

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/banner-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/banner.svg" alt="onRails: put your AI on rails. A train passes Pitch, Grill, Slice and Ship at golden hour. By Jay Smigen, JS Dev." width="960">
</picture>

[![Status: beta](https://img.shields.io/badge/status-beta-b45309?style=flat-square)](https://github.com/jsmigendevelopment/onRails/blob/main/CHANGELOG.md) Early and actively changing. Expect rough edges, especially on first setup.

**onRails** turns an idea into small changes that fresh agents test and review. Claude Code and Codex read the same rules in your repo. You choose when the app goes public.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/figures/onrails-checks-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/figures/onrails-checks-light.svg" alt="The owner’s project rules guide a plan. A builder takes one issue. An independent reviewer sends it back for a fix or passes the commit to the test site. The owner decides when to release." width="460">
</picture>

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
| [`/idea`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/idea/SKILL.md) · `$idea` | Start a new app | Turn a pitch into decisions, screens, a plan and issues. |
| [`/join`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/join/SKILL.md) · `$join` | Set up an existing repo | Map and run the repo, learn its conventions and write them down. |
| [`/back`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/back/SKILL.md) · `$back` | Start or resume work | See what changed, what is blocked and what to do next. |
| [`/afk`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/afk/SKILL.md) · `$afk` | Step away | Check usage and safety, then work eligible issues up to the agreed stops. |

Type `/update` (`$update`) to refresh onRails. To run one of the other 26 skills yourself, see the [cheat sheet](https://github.com/jsmigendevelopment/onRails/blob/main/guide/cheat-sheet.md#-advanced-run-one-step-yourself).

[![npm package version](https://img.shields.io/npm/v/onrails?style=flat-square&color=a63407)](https://www.npmjs.com/package/onrails)
[![Works with Claude Code](https://img.shields.io/badge/works%20with-Claude%20Code-7c3aed?style=flat-square)](#-install)
[![Works with Codex](https://img.shields.io/badge/works%20with-Codex-2563eb?style=flat-square)](#codex)
[![MIT licence](https://img.shields.io/badge/licence-MIT-55566b?style=flat-square)](https://github.com/jsmigendevelopment/onRails/blob/main/LICENSE)

[Install](#-install) · [Commands](#-the-four-commands) · [Defaults](#-opinionated-defaults) · [A run](#-what-a-run-looks-like) · [Guardrails](#-guardrails) · [Stacks](#-stacks-and-add-ons) · [Existing repo](#-add-it-to-a-repo-you-already-have) · [Cheat sheet](https://github.com/jsmigendevelopment/onRails/blob/main/guide/cheat-sheet.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/figures/onrails-build-loop-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/figures/onrails-build-loop-light.svg" alt="A pitch leads to product questions, screens and tech choices. The plan has Works, Real and Ready passes. Each issue in the current pass goes through build and review. Fixes repeat review. Passing changes reach test. The owner controls release." width="460">
</picture>

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

An agent can add items to a shared list and miss what a guest can see. onRails puts that decision on the issue, gives a builder a check to run and sends the change to a fresh reviewer.

| In the repo | What it does |
|---|---|
| [`AGENTS.md`](https://github.com/jsmigendevelopment/onRails/blob/main/AGENTS.md) | Sets standing rules, code rules and when to ask the owner. |
| Skills | Give agents steps for jobs like planning, building and reviewing. |
| Guardrails | Run local checks, enforce code rules and block unsafe git commands. |

The 0.7.1 release shipped 16 standing rules, 31 skills, 26 eval scenarios and 5 always-stop actions. Read about the kit's [principles](https://github.com/jsmigendevelopment/onRails/blob/main/guide/principles.md) and [evidence](https://github.com/jsmigendevelopment/onRails/blob/main/guide/evidence.md).

Jay Smigen uses onRails to build [Build Log](https://jsmigen.dev/blog/) and [Tranquiliti](https://tranquiliti.app).

## 🧰 Opinionated defaults

- **Stack.** TanStack Start on Cloudflare, Clerk for sign-in, shadcn/ui, Drizzle and pnpm. See [Stacks](#-stacks-and-add-ons).
- **Writing.** Plain words and short sentences at about an eighth-grade reading level.
- **Routing.** A model and effort for each job. See [Model routing](#-model-routing).
- **Review.** A fresh agent reads the diff. A new commit needs a fresh verdict.

Run `npx onrails profile init` to set your defaults in `~/.onrails/profile.toml`. New projects get a copy as `docs/profile.toml`.

| Section | What it sets |
|---|---|
| `[me]` | Name, naming style and text or voice input. Your voice glossary stays in `~/.onrails/`. |
| `[web]` | Framework, UI kit, database, sign-in, hosting and tools to skip. |
| `[defaults]` | Package manager, risk, automation, grill mode, visibility and licence. |
| `[design]` | Theme, spacing and voice. |
| `[routing]` | Models by tier and role, and when to ask for the strongest one. |

On every level below Full, the grill shows each pick for you to confirm. On Full, nothing waits. The agent records each pick and sends an FYI. What you say in a session takes priority.

Edit project rules and skills in place. `npx onrails update` keeps your edits and puts the kit's new copy beside yours. Layered settings are planned in [#124](https://github.com/jsmigendevelopment/onRails/issues/124).

## 🔁 What a run looks like

Plan around one thing someone can try end to end. For a shared list, add an item, reload and check that it is still there. Each step saves to files so `/back` can pick it up.

| Step | What happens | Saved to `docs/` |
|---|---|---|
| Pitch and product grill | Describe the idea. Pick what the first release must do well and record the choices that shape it. | `vision.md`, `features.md`, `decisions.md` |
| Screens | Try rough layouts, then a clickable design in both themes. Below Full, approve the screens before tech. On Full, the agent records its pick and sends the prototype. | `wireframes/index.html`, `design.md` |
| Tech | Choose the stack, data, access, test setup and risk dial. | `stack.md`, `architecture.md`, `security-policy.md` |
| Plan and issues | Outline three passes. Plan the current pass in detail. Give each step a ticket with something to try, acceptance checks, scope, dependencies and a review lane. | `pyramid.md`, `design.md` and tickets in GitHub |
| Build and review | Say "start the loop". A fresh agent takes one issue and writes a failing test before the fix. The local gate and fresh reviewers check the exact commit. A failed check sends it back. | `state.md` |
| Test and release | Merge the checked commit to the test site and smoke-test the main flow. File feedback as issues. You decide when to go live. | `state.md` |

On the default stack, you choose how to protect the test site. Production starts on a “Coming soon” page.

### How the build is sliced: the tracer-bullet pyramid

A tracer bullet is a thin step through the screen, logic and data. Slice 0 gets the app running with local checks and a test site.

- **Works** makes every slice tryable.
- **Real** deepens the core.
- **Ready** polishes the core and checks readiness for release.

One issue delivers one tryable step. A fresh audit and a chance to try the app inform the next pass. The owner decides when to launch. After the MVP, each new layer adds thin slices and revisits the core.

A step is a vertically sliced user story. A pass or layer is an iteration. The pass gate is the review, retro and backlog refinement in one. [The research behind it](https://github.com/jsmigendevelopment/onRails/blob/main/research/agile-flow.md)

[The `pyramid` skill](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/pyramid/SKILL.md)

## 🔒 Guardrails

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/figures/onrails-review-lanes-dark.svg">
  <img src="https://raw.githubusercontent.com/jsmigendevelopment/onRails/main/assets/figures/onrails-review-lanes-light.svg" alt="Every lane starts with local checks and fresh code review. Normal adds a preview test. Risky also adds a security reviewer. A failed sign-in check sends a fix through local checks again. An always-stop action needs the owner in every lane." width="460">
</picture>

### Checks before merge

An issue's **lane** sets the checks before merge.

| Lane | Checks before merge | When |
|---|---|---|
| **tiny** | local gate · code review | Copy, styling, config. No logic. |
| **normal** | local gate · code review · QA on the preview | Most issues |
| **risky** | Normal · security review · you, unless you chose Full automation | Auth, secrets, personal data, money, migrations, new dependencies |

The reviewer reads the diff, looks for weaker tests and names the commit to merge. A new commit needs a fresh review.

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
- stopping or restarting a running strongest-tier job on its own call. “Not yet” applies to new work. A direct stop order takes effect at once

### Security reviews

| Check | When | What it does |
|---|---|---|
| [`pr-security`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/pr-security/SKILL.md) | Risky lane | A fresh agent reads the diff against `docs/security-policy.md`: access, input, injection, secrets, data exposure, dependencies, abuse and money. |
| [`qa`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/qa/SKILL.md) | Normal and risky lanes | A fresh agent opens the preview in a real browser. It tries to read and delete another user's data. |
| Secret scan | Every pull request | gitleaks in the local gate (`pnpm check:merge`). |
| Agent-file guard | Every pull request | It covers the agents' own rules and the check files (lint, type, test and budget config, check scripts): the list is in [`full.md`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/automation/references/full.md#the-weakening-review). Below Full, such a change can't merge until you add the `human-approved` label. On Full there's no label: a fresh weakening review decides. |
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
| Every pull request closes an issue and stays under 1,000 changed lines, not counting lockfiles, generated files and test fixtures. Over that, it needs the `size-exception` label and a `Size exception: <reason>` line. | A pull request check |
| Pages don't change by accident. | Screenshot tests, every route, both themes |

→ [Code style](https://github.com/jsmigendevelopment/onRails/blob/main/guide/code-style.md) · [App conventions](https://github.com/jsmigendevelopment/onRails/blob/main/guide/app-conventions.md) · [Testing](https://github.com/jsmigendevelopment/onRails/blob/main/guide/testing.md)

### Keys never go through chat

The [`secrets`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/secrets/SKILL.md) skill lists each variable and gives steps for 14 providers. Enter values in an ignored file or a masked prompt. The setup script reports names only. Rotate any key pasted into chat. [Environments](https://github.com/jsmigendevelopment/onRails/blob/main/guide/environments.md)

### Tests that the skills change behaviour

[`evals/`](https://github.com/jsmigendevelopment/onRails/blob/main/evals/README.md) contains 26 scenarios in 0.7.1. The runner schedules 20 by default and lists 6 opt-in scenarios. It runs the same task in Claude Code with and without onRails. A pass means every check succeeds with the kit and at least one fails without it.

The paid run, `npm run evals`, is your call. The build loop runs `npm run test:evals` with a fake `claude` and `node evals/run.mjs --dry-run`. See cost controls and model results in [the evals README](https://github.com/jsmigendevelopment/onRails/blob/main/evals/README.md#cost-controls).

### And the rest

| Guardrail | How it works |
|---|---|
| **No force pushes, no pushes to main** | Blocked in the tool: `.claude/settings.json` for Claude Code, `.codex/rules/git-safety.rules` for Codex. Codex rules match only the start of a command, so a `--force` typed after the branch name is left to rule 12 in `AGENTS.md`. |
| **No silent waiting** | A rate-limited or blocked agent tells you what's blocked and when it resets, then keeps doing other work. |
| **A few things at a time** | The loop keeps three issues in flight (one on Hands-on), and finishes one before it starts another. Below Full, claimed work that waits on you counts. On Full it doesn't, so the loop keeps building; if everything left waits on you, you get one list of what each item unblocks. `flow.mjs` prints how many merged, how long one took and the longest gap with no merge. |
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

A **stack pack** is that stack already working: configs, the folder skeleton, an example module through every layer, and the checks, previews and deploys as scripts the session runs. At slice 0 the agent pulls it into your project. There are 5 packs: 2 ready, 3 stubs.

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

**The check contract:** every project has the same six commands, whatever the stack: `check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`. The skills, the local gate and the loop call only those.

## 🧠 Model routing

onRails picks a **model tier** and **effort level** for each job. Your profile sets the defaults.

| Role | Default | Does |
|---|---|---|
| **CTO** | Fable 5.2 · high | Research, architecture, the pyramid, writing the issues |
| **Coordinator** | Opus 5.5 · medium | Runs the loop, gates, reviews, security reviews and merges |
| **Builder** | Sonnet 5.5 · medium | Builds most issues. Risky changes and big slices start on Opus. Codex (ChatGPT) is an option outside security work. |

A role's effort is the base. A job's own rule can raise it: a code review never runs below the builder, and a security review runs one step above code review.

Set `cto`, `coordinator` or `builder` in `[routing]`. For example, `cto = "Claude Opus 5.5"` puts CTO work on Opus.

| Job | Tier · effort | Example model |
|---|---|---|
| The live thread: the one you talk to all day | Everyday · low | Claude Opus 5.5 |
| The loop: the coordinator the live thread starts in the background | Everyday · medium | Claude Opus 5.5 |
| Grill and planning chat | Everyday · medium | Claude Opus 5.5 |
| Wireframes, stage 1: grey-box layout | Everyday · medium | Claude Opus 5.5 |
| **CTO work:** research, the pyramid, schema, API design, wireframes stage 2 (the detailed design) | **Strongest · high** | Claude Fable 5.2 |
| Writing issues from the plan (CTO work) | **Strongest · high** | Claude Fable 5.2 |
| Building an issue | Fast · medium; Everyday · medium for risky changes or complexity 5–7 | Claude Sonnet 5.5, or Claude Opus 5.5 |
| Code review | Everyday · never below the builder | Claude Opus 5.5 |
| Security review (risky changes only) | Everyday · one step above review | Claude Opus 5.5, plus a second vendor's model when it touches personal data or money |
| Browser checks | Everyday · low | Claude Opus 5.5 |
| Art, visuals, names | Creative | ChatGPT |

<sub>The example models were checked in 2026-11. Pick your own models for each tier.</sub>

- **It asks before it uses the strongest tier.** You can turn the question off in your profile.
- **Start on the default.** Go up one step only after a failed check or a rejected review, two steps at most: Sonnet to Opus, then more effort. Infrastructure errors don't count against the model.
- **A reviewer never runs below the builder's effort.**

**Accounts.** `/idea` and `/join` can set up Claude or Codex accounts with separate config folders (`CLAUDE_CONFIG_DIR` or `CODEX_HOME`). The fixed split by job or project lives in `[accounts]`. Each app stays on its assigned account. At a usage limit, work waits and the session reports the reset time. A job assigned to another account gets a prompt for that account's session. Unattended work prefers a cloud session (`[sessions] prefer = "cloud"`). `npx onrails accounts` lists the accounts.

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

3. It reads the repo and writes `docs/map.md`. Below Full, it treats the repo's agent instructions, hooks and scripts as data until you approve them. On Full, it reads and runs only the hooks and scripts used by install, checks or app startup, then lists them in an FYI.
4. It installs, builds, tests and starts the app, and records the commands that work.
5. It compares your conventions with the kit's. You choose which to keep, adopt or merge.
6. It asks what is live, what is fragile, how changes ship and who else works here.
7. It writes `docs/`, merges the two `AGENTS.md` files, and shows you the diff before it commits.

> [!WARNING]
> **Didn't write the repo?** Before you open an agent in it, look over its `.claude/`, `.codex/` and editor settings and its git hooks. Those load as soon as the agent starts.

> [!NOTE]
> 🚧 **Being improved.** Today `/join` merges the two `AGENTS.md` files. Compare each `.onrails-new` or `config.onrails.toml` copy by hand, keep what you want, then delete the copy.

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

At the end it asks: **Start Claude Code here now with /idea? (Y/n)**. Say yes and your terminal becomes that session, with `/idea` already typed. It's `/join` when the folder already has files other than a README, licence, `.gitignore` or `.git`. With both Claude Code and Codex installed, it asks which; Codex gets `$idea` or `$join`. It asks only in a real terminal, never in CI or when piped. `--start` starts with no question (Claude Code if you have both), `--no-start` never starts. It finds `claude` and `codex` with the same `PATH` search as `update --all` (below) and starts the full path it found, with no shell (on Windows a `.cmd` shim through `cmd.exe`), so a copy in the project, its `node_modules/.bin` or a relative `PATH` entry never starts. Found only there, or in a place it would refuse to start from (a Windows `.cmd` in a folder whose name holds `%`), it counts as not installed. Using the desktop app or an IDE instead? Open the folder there, start a new session and type the command. In Codex, mark the project as trusted when it asks.

| Command | What it does |
|---|---|
| `npx onrails init [dir]` | Installs the kit: `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/`, `.codex/` and `.github/ISSUE_TEMPLATE/`. Writes `.onrails.json`, a record of what it installed. Then offers to start a session (`--start`, `--no-start`). |
| `npx onrails init --global` | Copies only the four entry skills (`idea`, `join`, `back`, `afk`) to `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex), so `/idea` works in any folder before the kit is there. Never overwrites: a file you changed keeps yours, and the kit's copy goes next to it as `.onrails-new`. In Claude Code your personal copy runs instead of a project's copy with the same name, so keep them in step. The [plugin](https://github.com/jsmigendevelopment/onRails#install-as-a-plugin) is the recommended way now; use one or the other. |
| `npx onrails@latest update [--dry-run] [--yes]` | Updates to the newest kit. Files you haven't touched are replaced, files you changed are kept, new kit files are added, and files dropped from the kit are deleted if you never changed them. `--dry-run` shows the plan and writes nothing. A repo on Full automation coming from a kit before 0.7.0 is told so. A repo on `ci = "local"` that still has files in `.github/workflows/` then gets `npx onrails ci local`, as below (with `--dry-run`, its plan only). `--yes` also answers `ci local`'s question below Full, so it turns Actions off and opens that pull request. `--yes` renames a kit record that still has its old name (see [Moving from ai-dev-workflow](#moving-from-ai-dev-workflow)). |
| `npx onrails@latest update [dir] --all [--dry-run] [--yes]` | Brings everything to the latest, in order: (1) the onRails plugin, with `claude plugin marketplace update onrails` then `claude plugin update core@onrails` for Claude Code and `codex plugin marketplace upgrade onrails` for Codex, only for a tool whose plugin is installed, each run by the full path found on `PATH` with no shell (on Windows a `.cmd` shim, such as an npm-installed `claude`, runs through `cmd.exe` by its full path). The `PATH` search skips relative entries, entries whose real path is inside the project or the current folder, and every `node_modules/.bin` (npx puts the project's first), so a `claude` the project ships never runs. The project is the nearest folder at or above `dir` that has `.onrails.json`, so a run from a subfolder works the same: the project kit step and `doctor` use it. The nearest such folder at or above the current folder only has its tools skipped; its kit is not updated. A filesystem root never counts as the project or the current folder, and neither do the home folder and a folder that holds it (`/home`) unless it has `.onrails.json`, so `~/.local/bin` is searched when you run it from `~`. A project that holds `HOME` is still a project, so its tools are skipped; when `~` itself is an onRails project, every tool folder under it is skipped. A tool found only in a skipped entry is named as that (`claude found only inside this project, not run`). When `~` is the project, the message adds its path and the commands to run by hand if it is yours; anywhere else it says a project can ship its own, with no command. On Windows a `.cmd` path that holds `%` is refused, since `cmd.exe` expands it even inside quotes. On Windows `NoDefaultCurrentDirectoryInExePath=1` is set for every command `update --all`, `doctor --fix` and `init --start` start, so the agent session `init --start` opens, and what it runs, inherit it; (2) the global entry skills, when `init --global` was used, the same way `init --global` copies them; (3) this project's kit, as `update` does, when the folder is in an onRails project (else it says it skipped it); (4) `doctor`. Then a summary of each part's version before and after, and what's left, such as `/reload-plugins` in Claude Code. A failed plugin command is shown and ends that tool's steps; the rest still run, and the exit code is 1. `--dry-run` prints the plan and runs nothing. It never bumps, tags or publishes a version. In Claude Code or Codex, the [`/update`](https://github.com/jsmigendevelopment/onRails/blob/main/.agents/skills/update/SKILL.md) command (`$update`) runs `npx onrails@latest update --all` for you, from a temp folder outside the project, with the project's path. A part that fails is shown as FAILED; `doctor` and the summary still run, and the exit code is 1. Plain `update` still updates only the project. |
| `npx onrails doctor` | Checks Node, git, `gh` and its sign-in, pnpm, Claude Code or Codex, the kit and its version (a repo on Full automation with a kit before 0.7.0 gets an ✗: those kits still stop for gates that Full and your decisions lift), `AGENTS.md`, that `.agents/skills` and `.claude/skills` match, `docs/state.md`, that `.env.example` names every variable in `.env.local`, the Playwright Chromium (when the project uses `@playwright/test`) and wrangler and its sign-in (when there's a `wrangler.jsonc`), that your global entry skills (from `init --global`) match this CLI's kit, and whether the onRails plugin is installed (Claude Code or Codex) and matches the project's kit version, that each account's config folder in the profile's `[accounts]` exists, and, on `ci = "local"`, that the repo has no files in `.github/workflows/` and, for a github.com remote, that Actions is off (`gh api repos/<owner>/<repo>/actions/permissions`); either one gets the fix `npx onrails ci local`. It reads local install records only, and never looks inside an account's folder. Each problem gets a one-line fix. Every tool `doctor` and `doctor --fix` run, including the background-process check's `git` and `ps` (`powershell.exe` on Windows), is found with the `PATH` search `update --all` uses (no relative entries, nothing inside the project or the current folder, no `node_modules/.bin`; on Windows only `PATHEXT` names, such as `claude.cmd`) and run by its full path with no shell (on Windows a `.cmd` shim through `cmd.exe` by its full path), so a tool the project ships never runs. A tool found only there counts as not installed, and its row says where it was found. So the wrangler sign-in is checked only with a wrangler installed outside the project; otherwise `doctor` says to run `pnpm exec wrangler whoami` yourself. |
| `npx onrails ci local [dir] [--dry-run] [--yes]` | Moves the repo off GitHub Actions (no Actions, #98). First it turns Actions off for the repo (`PUT /repos/<owner>/<repo>/actions/permissions` with `enabled=false`), so the issue and pull request it opens next can't start a workflow, and nothing queues or bills. Then it opens an issue and a pull request on `fix/<n>-no-actions` from the default branch that removes `.github/workflows/` and writes `ci = "local"` to `docs/stack.md`. The commit is made in a temp worktree, so your checkout isn't touched. A Ctrl-C, or a SIGINT or SIGTERM sent to the command alone, stops it before its next step and removes that worktree too; it exits with 128 plus the signal's number, with no failure line for the step it skipped. `update` and `update --all` end with that same code and run nothing after it (no `doctor`); any other `ci local` result leaves `update`'s exit code alone. If `.github`, `.github/workflows`, `docs` or `docs/stack.md` is a symlink on the default branch, or can't be read (say `.github` is a file), or `docs/stack.md` is a folder, it stops before it deletes or writes anything, and opens nothing. Once the branch is pushed, the local copy of it is deleted; if the push fails, it is kept and the command says so. If GitHub refuses to turn Actions off (it needs admin rights), it stops there and opens nothing. On Full automation it asks nothing; on other levels it asks once, and `--yes` answers. `--dry-run` lists the default branch's workflow files it would remove (from git's copy, `origin/HEAD`, as last fetched) and the API call it would make, and changes nothing. Needs `gh` signed in and a github.com `origin`. |
| `onrails preflight [dir] [--record] [--if-changed] [--json] [--mark-read] [--model <id>] [--effort <level>] [--tool <name>]` | For agents. `doctor` checks your terminal; this checks the agent's own sandbox, which has other permissions. It probes repo write, `.git` write, the package registry, GitHub, loopback, a browser (when the tests use Playwright), Node and the package manager, and prints one table. Under the table it warns, without failing, when a repo on `ci = "local"` has files in `.github/workflows/` or, once the repo is read, Actions on, with the fix `npx onrails ci local`. Each failure gets a ladder: a workaround in the sandbox, one command outside it, the environment tools, and you last, in one message. `--record` writes the result to `docs/state.md`; `--if-changed` skips the probes when nothing changed. It changes nothing but temp files. The kit ships the same script: `node .agents/skills/ask/scripts/preflight.mjs`. Run that, or a globally installed `onrails` by its absolute path, never through `npx` before the repo has been read (`--mark-read`): npx changes `PATH` and which `onrails` runs, in ways the repo can steer. |
| `npx onrails ps [dir] [--json]` | Lists every background process an agent started through the process registry: its id, age, owner session and whether that session is still alive, CPU, memory, why it runs and when it should stop. Stale ones (their session is gone, or they're past their time or their pause) are marked. It reads the project's `.onrails/procs.json` (shared by its worktrees and ignored by git), `~/.onrails/procs.json` and every project registry listed in `~/.onrails/procs-index.json`. The kit ships the same script for agents and the session hooks: `node .agents/skills/ask/scripts/procs.mjs`. |
| `npx onrails ps [dir] --stop <id\|all\|stale\|pid> [--yes]` | Stops them: TERM to the process group (on Windows, `taskkill /T`), then KILL (`/F`) after 5 seconds, to the group's other members too if its leader has gone. Before any signal it checks each record: a PID above 1 that isn't itself, its parent or the agent, a start time that matches the live process (a record with none is never used), and, for a group signal, a process that leads its own group, in a group that holds none of those three. A PID the system gave to another program is left alone. A PID the registry didn't record, or one another session started that is live or has no agent recorded, gets a `[y/N]` question first; `--yes` answers it. A registry that git tracks (or that git can't answer for), that another user owns or can write, whose folder or logs folder another user owns or can write (only `~/.onrails` may be group-writable, never world-writable), or that is a symlink or not a plain file is never read or written. The file is checked and read through one open file, and so is the index. An index entry must be the registry of a git repo the user owns, whose root others can't write: the group only when the root has the sticky bit or the group is the user's own, with no one else in it, and the root has no ACL (on Linux, asked of `getfacl` or GNU `ls`; anything unclear counts as one). Every folder on the way to the repo root (or to the home folder, for `~/.onrails` and the index), from the filesystem root down, and each symlink on the way, must be yours or root's, and no one else may write a folder there (a sticky folder, such as `/tmp`, aside; the group under the repo root's rule). On Linux each of those folders must be on a file system whose ACLs `getfacl` shows (ext4, xfs, btrfs and the like), so a repo on NFS or on WSL's `/mnt/c` is never read, and `ps` and `doctor` say where to keep it. A registry of yours that others can write (one written at `0664` before this check) is refused with the `chmod 600` that fixes it, its records are kept, and `ps` and `doctor` name it with that line. An index written at `0664` before this check is named the same way, and the next write keeps its entries. `ps` without `--stop` only reads. |
| `npx onrails doctor --fix [--yes] [--dry-run]` | Offers a fix for each problem and runs it only after you type `y` (`--yes` says yes to all, `--dry-run` only prints the plan). See [What `doctor --fix` does](#what-doctor---fix-does). |
| `npx onrails accounts [dir]` | Lists the accounts in the profile's `[accounts]` (the project's `docs/profile.toml`, else yours): label, tool, config folder and whether it exists, projects and jobs. Accounts are a fixed split by job or project, never by usage. |
| `npx onrails map [dir]` | Writes `docs/map.generated.md` (#709, the first step of #114): one row per module with its file count and lines of code (the non-blank lines of its `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` and `.cjs` files), who imports whom, every import cycle, and every sideways import between feature modules. A module is a folder in `src/modules/`; with no `src/modules/`, each folder in `src/` is one. Code in `src/` outside any module is `(root)`, which is never part of a cycle. It follows a relative path, an `@/` path (`src/`), `export ... from`, `require()` and `import()` with a plain string, by a built-in scan with no dependency: a path set in `tsconfig`, an import built from a variable and a re-export through another package are not followed. It skips `node_modules`, `dist`, `build`, `coverage`, hidden folders, `.gen.` files and links: a link is never followed, so nothing outside `dir` is read, and a `src/` that is itself a link stops the run with exit 1 and writes nothing (a linked `src/modules/` is just not a module folder). The file is sorted, with no dates and no absolute paths, so a second run with no change writes the same bytes. `dir` defaults to this folder; with no `src/` it writes a map that says so. It reads source files and writes only that one file, and exits 1 without writing when `docs/` or `docs/map.generated.md` is a link. |
| `npx onrails config get <section.key> [dir]` | Prints the value a setting resolves to and which layer it came from (#708, the first step of #124): `private (personal)`. The layers, first match wins: `project` (`<dir>/docs/profile.toml`), `personal` (`~/.onrails/profile.toml`) and `kit default` (the kit's profile template). A layer whose file is missing is skipped, and so is a blank value (`name = ""`), which means not set. Name the setting as `section.key`, e.g. `defaults.risk_dial`. It reads `key = "text"`, `true`/`false` and whole numbers inside a `[section]`; an array, an inline table, a multi-line string or a table inside a table (`[me.signature]`) is not read, and a setting the project writes in such a form is reported, not answered from a lower layer. Lines inside a multi-line string or a multi-line array are skipped, so a `[section]` or `key = ...` there is never taken for a real one. A quoted key or header and a dotted key are not read yet, and `+5` prints as `+5`. A name with a token, key, password, secret, credential, bearer, pat, dsn, webhook, private, sk, cred, pwd, pass, passcode, jwt, cookie, otp, hmac, salt, cert or pem in it, or one of the pairs auth header, database url and connection string (`ntfy_token`, `api_key`, `[secrets]`, `webhook_url`, `smtp_pass`, `database_url`) prints nothing, even when it is set: read the file yourself. The plural counts too (`tokens`, `keys`), and so does a word glued to a longer one (`authtoken`, `secretkey`, `clientsecret`); `key` and the short words count only as whole words, so `auth`, `monkey` and `path` stay readable. As a second layer, a value that starts like a credential (`sk-`, `sk_live`, `sk_test_`, `pk_live_`, `rk_live_`, `whsec_`, `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`, `glpat-`, `npm_`, `xox`, `xapp-`, `AKIA`, `ASIA`, `AIza`, `-----BEGIN`), holds a JWT (`eyJ...`.`...`.`...`) or a Slack hook URL (`hooks.slack.com/services/`), or is a URL with a password (`scheme://user:pw@host`; it is refused, not masked) is refused the same way under any name, and never printed. A `\"""` inside a multi-line string does not end it (#733). When no layer has a value it exits 1 with one line on stderr that names the setting, and prints nothing on stdout; a name that isn't `section.key` exits 2. `dir` defaults to this folder. It only reads, and never changes a profile. |
| `npx onrails signature [--theme professional\|personal] [--style full\|compact] [--markdown] [--write <file>]` | Prints your README signature from `[me.signature]` in the profile (the project's `docs/profile.toml`, else yours). `--theme personal` puts `[me.signature.personal]` on top. `--style compact` makes it one line. `--markdown` prints plain Markdown instead of HTML. `--write README.md` keeps the signature as the file's ending. It writes the block between `<!-- onrails:signature start -->` and `<!-- onrails:signature end sha256=<hex> -->`, the sha256 of the block, or adds `---` and the block at the end, so running it again changes nothing. A later run replaces the block when the end marker is the last non-blank line (markers count only as whole lines at column 0, outside fenced code) and the block's sha256 matches, or, for an end marker with no sha256, when the block equals a render of the current profile in any theme, style or mode. Anything else between the markers is refused. It keeps the file's line endings. A lone marker, two pairs, a reversed pair, text after the end marker or a code fence left open at the end is refused. Every key must have its type: strings, sizes from 1 to 512, `links` as `{ label, url }` strings. Unknown, dotted and duplicate keys, `[[me.signature.links]]` and `me = { signature = .. }` are refused. Values are allowlisted in every mode: URLs are plain `https://` with a lowercase host and a path (no port, query, fragment, `%`, `&` or `@`); text is normalized to NFC and holds only letters, numbers, emoji (skin tones, joined emoji, keycaps and flags too), single spaces and `. , ! ? ' ’ - – : ; ( ) & +`, with no combining mark left over, no invisible filler, and no email, `mailto:`, bare `scheme:` or `www.`. A colon before a space or at the end ("Builder: web apps", "Note:") is fine. A full stop needs a space after it or must end the value, so `example.com`, `Node.js` and `2.0` are refused, except in a link label. Escaping (HTML, and Markdown with `--markdown`) stays as a second layer. `mark_dark` is checked but not used yet. Exit codes: 1 a refused value or markers (nothing is written), 2 bad flags, 3 no `[me.signature]` (it says how to add one). |
| `npx onrails profile init [--yes]` | Makes your personal profile, `~/.onrails/profile.toml`, from the kit's template: asks for your GitHub owner, plan (free, team or enterprise), naming style, models per tier and whether you type or use voice to text (kept as `[me] input`, and not copied into projects), with defaults. Asks before replacing one you have (`--yes` takes the defaults and never replaces). |
| `npx onrails profile show` | Prints your profile. |
| `npx onrails profile copy [dir]` | Copies your profile into `<dir>/docs/profile.toml`, asking before replacing a different one. `init` does this too when the project has none. |
| `npx onrails lesson check <file> [--project <dir>]` | Checks a kit lesson record (JSON) against a closed allowlist (#321): exactly the keys `kit_version`, `component`, `category`, `tool`, `model_family`, `automation`, `cost` (`extra_runs`, `hours_stuck`), `lesson`, `suggested_fix` and `repo_key`, each from a fixed list. `component` is a skill, script, hook or template name from this CLI's own kit manifest, or `unknown`. `repo_key` is 64 lowercase hex characters. `lesson` and `suggested_fix` are one sentence of at most 200 characters, each word from the kit glossary or a list of common English words (`cli/src/lesson-words.mjs`, decision 321-1) or the literal `[detail]`, with no path, URL, email, `@name`, `#number`, run of three digits, backtick, quote mark or code-like token. Exit 0 accepted, 1 refused (one line per error, the field and the rule, never the refused text), 2 bad usage. It also refuses a `lesson`, `suggested_fix` or already refused field that holds a term from the project itself (#322), whole-word, case-blind and in either number (`note` for `notes`, `grants` for `Grant`, `parties` for `party`, `memory` for `Memories`), as `field: contains a project term (<kind>)`, naming the source kind and never the term: the git remote's owner and repo, each `package.json` name, capitalised names and title words (a title's lower-case camelCase name such as `iPhoneSync` too) in `docs/vision.md`, `docs/mvp.md`, `docs/decisions.md` and `docs/decisions/*.md`, `[me]` name and `github_owner` from `docs/profile.toml` (else `~/.onrails/profile.toml`), `git log` author names and emails, domains in tracked files (never a reserved host such as any `example` name, nor a file the kit ships unchanged, nor a host that a stack pack in this CLI's own kit ships in its files, even in a file the project has edited), and variable names in `.env.example` (never one that a stack pack in this CLI's own kit ships in its own `.env.example`, such as `SECURITY_CONTACT`; decision 410-1). A name also gives its parts, split at `-`, `.`, `_`, a camelCase step or a digit, and the parts joined by a hyphen and by a space (`GardenParty` gives `garden`, `party`, `garden-party` and `garden party`). A `.env.example` name or a full host stays whole but gives the spaced and hyphenated forms too (`RIVER_SIGNAL_TOKEN` gives `river signal token`), and any name also matches its letters with spaces or hyphens in other places (`bright paper` for `brightpaper`, `river-signal token`). `issue <n>`, `issue: <n>`, `PR <n>`, `pull <n>` and `pull request <n>` are refused for any number, as `field: contains a project term (issue number)`, without printing the number; a count such as `the issue 3 times` or `3 times out of five` passes (a number, a number word or `the last` after `out of`), but `issue 41 times out` and `issue 41 times out of memory` are refused. A lesson file, or a pipe, over 1 MB is refused after reading at most 1 MB and one byte, as `record: too-large`, and a named pipe with no writer waits for one, as `cat` does (decisions 385-1 and 392-2). Kit glossary words and skill names, and a term whose singular or plural is one, leave that set; a field whose value passed its closed list, such as `tool: claude-code`, is not checked against it (decision 322-1). Any path with a part named `.env` or `.envrc`, or either followed by `.`, `_` or `-` and more (`.env.local`, `.env_local`, `.envrc.private`, `.env.d/`), or ending in `.env` or `.envrc` (`prod.env`), in any case, is never opened, but for `.env.example`, and not even through a link: a link is followed only to a regular file inside the project, a device or anything else that isn't a regular file is skipped, and each read stops after 1 MB and one byte (decisions 322-1, 392-2 and 410-1). `--project` defaults to the current git repo. It only reads local files and local `git`, sends nothing and never changes the record. |
| `npx onrails insights --week [<yyyy-Www>] [dir]` | Prints a week's report from the insights records in `<dir>/docs/insights/` (#381): runs per role and model, send-backs by reason per builder model, pull request size against send-backs, escalations and whether they fixed it, and usage per merged pull request. The week is an ISO week in UTC, last full week by default. A number no record holds prints as `unknown`, never an estimate (decision 381-2). `dir` defaults to the current git repo. It only reads local files: it writes nothing and calls no API. Exit 2 on a bad week. |
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
