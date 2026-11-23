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
| `npx ai-dev-workflow doctor` | Checks Node, git, `gh` and its sign-in, Claude Code or Codex, the kit and its version, `AGENTS.md`, that `.agents/skills` and `.claude/skills` match, and `docs/state.md`. Each problem gets a one-line fix. |
| `npx ai-dev-workflow add <pack> [--force]` | Copies a stack pack (a working starter app) into the project root and prints its next steps. Files you already have are skipped unless you pass `--force`. |
| `npx ai-dev-workflow add --list` | Lists the stack packs. |

`adw` is a short alias for `ai-dev-workflow` once it's installed.

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
