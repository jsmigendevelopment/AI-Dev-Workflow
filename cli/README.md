# ai-dev-workflow

Installs and updates the [AI-Dev-Workflow](https://github.com/jsmigendevelopment/AI-Dev-Workflow) kit in your project: the agent rules, the skills for Claude Code and Codex, the safety settings and the stack packs.

Needs Node 22 or newer. No dependencies, and works offline: each CLI version carries one kit version.

## Use it

In your project folder:

```bash
npx ai-dev-workflow init
```

Then open Claude Code or Codex in the folder and type `/idea` (Codex: `$idea`) for a new app, or `/join` (`$join`) for an existing repo. In Codex, mark the project as trusted when it asks.

| Command | What it does |
|---|---|
| `npx ai-dev-workflow init [dir]` | Installs the kit: `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/`, `.codex/` and `.github/ISSUE_TEMPLATE/`. Writes `.ai-dev-workflow.json`, a record of what it installed. |
| `npx ai-dev-workflow@latest update [--dry-run]` | Updates to the newest kit. Files you haven't touched are replaced, files you changed are kept, new kit files are added, and files dropped from the kit are deleted if you never changed them. `--dry-run` shows the plan and writes nothing. |
| `npx ai-dev-workflow doctor` | Checks Node, git, `gh` and its sign-in, pnpm, Claude Code or Codex, the kit and its version, `AGENTS.md`, that `.agents/skills` and `.claude/skills` match, `docs/state.md`, that `.env.example` names every variable in `.env.local`, the Playwright Chromium (when the project uses `@playwright/test`) and wrangler and its sign-in (when there's a `wrangler.jsonc`). Each problem gets a one-line fix. |
| `npx ai-dev-workflow doctor --fix [--yes] [--dry-run]` | Offers a fix for each problem and runs it only after you type `y` (`--yes` says yes to all, `--dry-run` only prints the plan). See [What `doctor --fix` does](#what-doctor---fix-does). |
| `npx ai-dev-workflow profile init [--yes]` | Makes your personal profile, `~/.ai-dev-workflow/profile.toml`, from the kit's template: asks for your GitHub owner, plan (free, team or enterprise), naming style and models per tier, with defaults. Asks before replacing one you have (`--yes` takes the defaults and never replaces). |
| `npx ai-dev-workflow profile show` | Prints your profile. |
| `npx ai-dev-workflow profile copy [dir]` | Copies your profile into `<dir>/docs/profile.toml`, asking before replacing a different one. `init` does this too when the project has none. |
| `npx ai-dev-workflow add <pack> [--force]` | Copies a stack pack (a working starter app) into the project root and prints its next steps. Files you already have are skipped unless you pass `--force`. |
| `npx ai-dev-workflow add --list` | Lists the stack packs. |
| `npx ai-dev-workflow add <pack> --list-addons` | Lists a pack's optional add-ons (for `tanstack-start`: analytics, sentry, email-resend, jobs, stripe, r2-uploads, database-supabase). |
| `npx ai-dev-workflow add <pack>/<addon> [--force]` | Copies an add-on's new files into the project (files you already have are skipped unless you pass `--force`), then prints the rest of its `ADDON.md` apply steps: installs with pinned versions, and small edits to `composition.ts`, `wrangler.jsonc` and friends. |

`adw` is a short alias for `ai-dev-workflow` once it's installed.

## What `doctor --fix` does

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

## Your own files are safe

- **`AGENTS.md`** already there: the kit's goes in `AGENTS.kit.md`. Type `/join` and it merges the two.
- **`CLAUDE.md`** already there: kept, with `@AGENTS.md` added on its own line if it's missing.
- **`.claude/settings.json`** already there: kept, with the kit's `permissions.deny` rules added.
- **`.codex/config.toml`** already there: kept. The kit's goes in `.codex/config.kit.toml`.
- **Any other file** you already have or have changed: kept. The kit's copy goes next to it as `<file>.kit-new`. Compare the two, keep what you want, and delete the `.kit-new`.

Commit `.ai-dev-workflow.json`: `update` uses it to tell your changes from the kit's.

## Develop and publish

The kit is copied from the repo into `cli/kit/` (not committed) by `npm run bundle`, which also runs before every `npm pack` and `npm publish`.

```bash
cd cli
npm run bundle && npm test
npm pack --dry-run      # see what would ship
```

To publish (the owner does this, after bumping `version` in `package.json` to match the kit):

```bash
cd cli && npm publish
```
