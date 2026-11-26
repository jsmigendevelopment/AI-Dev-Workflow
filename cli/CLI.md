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
| `npx onrails init --global` | Copies only the four entry skills (`idea`, `join`, `back`, `afk`) to `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex), so `/idea` works in any folder before the kit is there. Never overwrites: a file you changed keeps yours, and the kit's copy goes next to it as `.onrails-new`. In Claude Code your personal copy runs instead of a project's copy with the same name, so keep them in step. The [plugin](../README.md#install-as-a-plugin) is the recommended way now; use one or the other. |
| `npx onrails@latest update [--dry-run] [--yes]` | Updates to the newest kit. Files you haven't touched are replaced, files you changed are kept, new kit files are added, and files dropped from the kit are deleted if you never changed them. `--dry-run` shows the plan and writes nothing. `--yes` renames a kit record that still has its old name (see [Moving from ai-dev-workflow](#moving-from-ai-dev-workflow)). |
| `npx onrails doctor` | Checks Node, git, `gh` and its sign-in, pnpm, Claude Code or Codex, the kit and its version, `AGENTS.md`, that `.agents/skills` and `.claude/skills` match, `docs/state.md`, that `.env.example` names every variable in `.env.local`, the Playwright Chromium (when the project uses `@playwright/test`) and wrangler and its sign-in (when there's a `wrangler.jsonc`), that your global entry skills (from `init --global`) match this CLI's kit, and whether the onRails plugin is installed (Claude Code or Codex) and matches the project's kit version, and that each account's config folder in the profile's `[accounts]` exists. It reads local install records only, and never looks inside an account's folder. Each problem gets a one-line fix. |
| `npx onrails preflight [dir] [--record] [--if-changed] [--json] [--model <id>] [--effort <level>] [--tool <name>]` | For agents. `doctor` checks your terminal; this checks the agent's own sandbox, which has other permissions. It probes repo write, `.git` write, the package registry, GitHub, loopback, a browser (when the tests use Playwright), Node and the package manager, and prints one table. Each failure gets a ladder: a workaround in the sandbox, one command outside it, the environment tools, and you last, in one message. `--record` writes the result to `docs/state.md`; `--if-changed` skips the probes when nothing changed. It changes nothing but temp files. The kit ships the same script: `node .agents/skills/ask/scripts/preflight.mjs`. |
| `npx onrails ps [dir] [--json]` | Lists every background process an agent started through the process registry: its id, age, owner session and whether that session is still alive, CPU, memory, why it runs and when it should stop. Stale ones (their session is gone, or they're past their time or their pause) are marked. It reads the project's `.onrails/procs.json` (shared by its worktrees and ignored by git), `~/.onrails/procs.json` and every project registry listed in `~/.onrails/procs-index.json`. The kit ships the same script for agents and the session hooks: `node .agents/skills/ask/scripts/procs.mjs`. |
| `npx onrails ps [dir] --stop <id\|all\|stale\|pid> [--yes]` | Stops them: TERM to the process group (on Windows, `taskkill /T`), then KILL (`/F`) after 5 seconds. It checks each one's start time first, so a PID the system gave to another program is left alone. A PID the registry didn't record gets a `[y/N]` question first; `--yes` answers it. |
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

Publishing runs in GitHub Actions on a `v*` tag, with no npm token. [RELEASING.md](../RELEASING.md) has the one-time setup and the steps for each release.
