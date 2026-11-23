# Plan: the kit as a Claude Code plugin

Researched 2026-11-23. Option A is now built (issue #4): see `plugin/`, `.claude-plugin/marketplace.json` and the README's "Install as a plugin". One finding from the build: Codex refuses an entry whose name differs from the plugin's own `name`, so Codex gets its own marketplace file, `.agents/plugins/marketplace.json`, with the entry `or` (`codex plugin add or@onrails`). ✅ [Local] codex-cli 0.171.0.

**Marks:** ✅ verified (read in a primary source, or run here). 🔶 inferred (read the code or a nearby doc, not run). ❓ unknown.

**Sources:**

- [Docs] Claude Code docs at code.claude.com, read 2026-11-23: [skills](https://code.claude.com/docs/en/skills.md), [plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md), [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md), [how plugins load](https://code.claude.com/docs/en/plugins/loading.md), [install](https://code.claude.com/docs/en/plugins/install.md), [plugin CLI reference](https://code.claude.com/docs/en/plugins/cli-reference.md), [components](https://code.claude.com/docs/en/plugins/components.md), [interactive mode](https://code.claude.com/docs/en/interactive-mode.md), [commands](https://code.claude.com/docs/en/commands.md), [cloud environments](https://code.claude.com/docs/en/cloud-environments.md).
- [Local] Claude Code 2.1.330 and codex-cli 0.171.0, run in this repo's dev box, 2026-11-23.
- [CF] `cloudflare/skills`, commit `5108325e` (2026-11-17): a working plugin for both Claude Code and Codex.
- [Codex] `openai/codex` source, commit `e0a6d053` (2026-11-23). Codex's docs site was blocked from this box, so Codex facts come from its source code and CLI help.

## Decided (2026-11-23, by the owner)

- Kit name **onRails**; npm package `onrails`; repo `onRails`.
- Marketplace name `onrails`. Plugin entry `core`, so it installs with `/plugin install core@onrails`. Stack packs can follow later as their own entries (for example `tanstack@onrails`).
- Plugin manifest `name` is `or`, so commands read `/or:idea`, `/or:join`, `/or:back`, `/or:afk`. The entry name and the manifest name may differ (see the table below).

## 1. The name: `/or:idea`, or just `/idea`?

The owner picked `or` as the plugin's short name. What that means:

| Question | Answer | Mark |
|---|---|---|
| Where does the prefix come from? | The `name` in the plugin's own `.claude-plugin/plugin.json`. Not the marketplace name, and not `displayName`. "Every component is namespaced under it." | ✅ [Docs] manifest reference, `name` |
| Can the install name differ? | Yes. The entry name in `marketplace.json` is the install key (`<entry>@<marketplace>`). The manifest `name` is still the prefix. So the kit could install as `<kit-name>@<marketplace>` and still show `/or:idea`. | ✅ [Docs] loading, "Entry name and manifest name" |
| Is `or` allowed? | Yes. Rules: not empty; no spaces, `@`, `:`, path separators, control or text-direction characters; kebab-case. No minimum or maximum length is listed. Names that pass as Anthropic's (`claude-…`, `anthropic-…`) are refused; `or` isn't one. `claude plugin validate` passed on a plugin named `or` and listed its skill as `or:idea`. | ✅ [Docs] manifest reference; ✅ [Local] |
| Is `or` allowed in Codex? | Yes. A plugin name may use ASCII letters, digits, `-`, `_` and `.`. | 🔶 [Codex] `validate_plugin_segment` |
| Is the prefix required? | **No, not to type.** A plugin skill's full name is `/or:idea`, but "the bare `/idea` also invokes the skill unless another command already uses that name." | ✅ [Docs] skills, "How a skill gets its command name". 🔶 Not tried live: `-p` mode can't list skills here. |
| Who wins the bare name? | A project or personal skill called `idea` (or a built-in command) takes `/idea`. Then the plugin's copy runs only as `/or:idea`. Both load. | ✅ [Docs] skills, "Resolve skills that share a name" |
| What does the `/` menu show? | The full name. Typing `/idea` finds `or:idea`, and picking it writes `/or:idea` into the prompt. | ✅ [Docs] interactive mode, "Complete a command mid-prompt" |
| Does `/or` clash with anything? | No built-in command starts with `or` (the only `/o…` one is `/output-style`). Completion matches names that start with what you typed, so `/or` should list every `/or:…` skill at once. | ✅ [Docs] commands list. 🔶 the `/or` listing, not tried live |
| Codex? | Codex names plugin skills the same way, `plugin:skill`, so `or:idea`. Whether `$idea` reaches `or:idea` with no prefix is not known. | 🔶 [Codex] skill namespace resolver. ❓ the bare `$idea` |

**Bottom line:** the person can type `/idea`. The menu and the prompt will show `/or:idea`. If the project also has the kit's own `idea` skill (from `init`), `/idea` runs the project's copy, and `/or:idea` runs the plugin's.

## 2. What a plugin can hold

| Part | In a plugin? | Notes | Mark |
|---|---|---|---|
| Skills | Yes | `skills/<name>/SKILL.md` | ✅ [Docs] manifest reference, "Standard layout" |
| Commands | Yes | `commands/*.md`. Docs say prefer skills for new plugins | ✅ |
| Agents | Yes | `agents/*.md`. An agent file can't add hooks or MCP servers | ✅ [Docs] components |
| Hooks | Yes | `hooks/hooks.json`, same shape as `settings.json` hooks; scripts via `${CLAUDE_PLUGIN_ROOT}` | ✅ |
| MCP servers | Yes | `.mcp.json` or inline `mcpServers` | ✅ (and [CF] does it) |
| LSP servers, output styles, themes, monitors, `bin/` | Yes | Not needed for the kit | ✅ |
| User settings (`userConfig`) | Yes | Asks the person for values; secrets go to the OS keychain | ✅ |
| **Permission rules** (`allow`/`deny`) | **No** | The manifest has no permissions or settings key | ✅ [Docs] manifest field table |
| `CLAUDE.md` / `AGENTS.md` | **No** | Not a plugin part | ✅ same table |

Other facts that shape the plan:

- **Marketplace:** a repo with `.claude-plugin/marketplace.json`, listing plugins by `source` (a `./sub/folder` in the same repo works). Added with `/plugin marketplace add <owner>/<repo>`, installed with `/plugin install <entry>@<marketplace>`. ✅ [Docs], [CF]
- **Install scopes:** user (`~/.claude/settings.json`), project (committed `.claude/settings.json`; each teammate still installs it once per clone), local. ✅ [Docs] install
- **Reload without restart:** `/reload-plugins` applies installs, updates and edits to the running session. A reload that adds or removes a plugin MCP server waits for `/reload-plugins --force`, because it breaks the prompt cache. Over Remote Control it isn't available. ✅ [Docs] plugin CLI reference
- **Project skills hot-reload:** yes. Claude Code watches `~/.claude/skills/` and the project's `.claude/skills/` and picks up added, changed or removed skills mid-session. If a new one doesn't show, `/reload-skills`. ✅ [Docs] skills, "Edit a skill during a session"
- **Versions:** `version` in `plugin.json` pins what users get until it changes. Auto-update is **off** by default for third-party marketplaces, so people update by hand (`claude plugin update`). ✅ [Docs] manifest reference, install
- **Cloud sessions:** a fresh clone. They load the repo's `.claude/skills/`, `.claude/settings.json` hooks and permission rules. They do **not** load plugins enabled only in your user settings, and an Anthropic-hosted session doesn't add marketplaces the repo lists. ✅ [Docs] cloud environments
- **A plugin inside the repo:** a folder in the project's `.claude/skills/` that has `.claude-plugin/plugin.json` loads as `<name>@skills-dir`, after the workspace trust check. Your personal `~/.claude/skills/` copy of the same plugin wins over the project's. ✅ [Docs] loading. Whether that loads in a cloud session ❓.
- **Codex:** has plugins too (`codex plugin marketplace add`, `codex plugin add`). It reads `.codex-plugin/plugin.json`, and also `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. [CF] ships both manifests from one repo. ✅ [Local] CLI help; 🔶 [Codex] source for the file names
- **Codex user skills folder:** `~/.agents/skills`. `$CODEX_HOME/skills` (`~/.codex/skills`) still loads but the source calls it deprecated. 🔶 [Codex] `ext/skills/src/host_roots.rs`

## 3. What goes where

**In the plugin (`or`):** the four entry skills only: `idea`, `join`, `back`, `afk`. They are what you type in a folder that has nothing yet.

**Stays as project files, installed by `init`:**

- `AGENTS.md`, `CLAUDE.md`, `docs/`: a plugin can't ship them, and a new session must start from the repo alone (standing rule 4).
- `.claude/settings.json` deny rules: a plugin can't ship permission rules.
- Hooks (`notify`, `session-start`, the work log): they read and write this project's files and must run in cloud sessions, where user plugins don't load.
- The other 22 skills: the loop runs them in cloud sessions too, and their scripts live at project paths (`.agents/skills/<name>/scripts/...`). Each project also keeps the kit version it was built with.
- `.codex/`: Codex config and rules.

## 4. How it works with `init`

1. The person installs the plugin once: `/plugin marketplace add <owner>/<repo>`, then `/plugin install <entry>@<marketplace>`.
2. In an empty folder they type `/idea`. No project skill has that name yet, so the plugin's `or:idea` runs.
3. Its first step: is the kit here (`.ai-dev-workflow.json` or whatever the manifest is called after the rename)? No: ask, then run the CLI's `init --no-start` for the person. Then carry on with the project's own `idea` skill, which is now on disk (project skills hot-reload).
4. From then on, `/idea` in that project runs the project's copy. The plugin's copy only starts things.

## 5. Stopping two copies from fighting

| Pair | What happens | Rule |
|---|---|---|
| Plugin `or:idea` and project `idea` | Both load. Bare `/idea` runs the project's. ✅ | Make the plugin's entry skills thin: "if the project has the kit, read and follow `.agents/skills/<name>/SKILL.md` instead." One master copy, in the project. |
| Personal `~/.claude/skills/idea` (from `init --global`) and project `idea` | Personal wins over project. ✅ So an old personal copy beats a newer project copy. | Don't use `init --global` and the plugin together. Pick one. `doctor` already warns when the global copies fall behind. |
| Plugin skills and the kit's repo | The plugin folder would be a third copy. | Generate `plugin/skills/` from `.agents/skills/` with `scripts/sync-skills.mjs`, and check it in CI like `.claude/skills`. |
| Plugin version and project kit version | They can differ. | `doctor` reports both. The plugin's skills only bootstrap, so a mismatch is harmless. |

## 6. Three options

| | A. Bootstrap plugin (entry skills only) | B. Full plugin (all skills and hooks) | C. No plugin (`init` and `init --global`) |
|---|---|---|---|
| What it is | `or` ships `idea`, `join`, `back`, `afk`, which run `init` when the kit is missing | `or` ships all 28 skills and the hooks; `init` writes only `AGENTS.md`, `docs/` and settings | What we have today |
| Type `/idea` in an empty folder | Yes | Yes | Only after `init --global` |
| Works in cloud sessions | Yes: the loop uses project files | No: user plugins don't load there | Yes |
| Deny rules | Project files, as today | Still project files (a plugin can't ship them) | Project files |
| Updates | Plugin updates by hand; project via `update` | One update for everything, but every project jumps at once | `update` per project; global copies by hand |
| Copies that can fight | Plugin vs project: project wins the bare name, which is what we want | None in a project, but nothing pins a project to a kit version | Personal beats project: an old global copy wins |
| Codex | Ship `.codex-plugin/plugin.json` too, as Cloudflare does | Same, plus the hooks would need porting | Works today |
| Work | Small: a `plugin/` folder, a marketplace file, a sync step, a doctor line | Large: move every script path to `${CLAUDE_PLUGIN_ROOT}`, change `init` and `update` | None |

**Recommendation: A.** It gives the person `/idea` anywhere, and the project stays the one source of truth the loop and cloud sessions need. Keep `init --global` for people who don't use plugins, but say plainly: use one or the other, never both.

**Next steps, once the rename lands:** add `plugin/` with a generated `skills/` (the four entry skills, each with a "hand off to the project copy" first step), `.claude-plugin/marketplace.json` at the repo root pointing at `./plugin`, a `.codex-plugin/plugin.json`, a CI check, a `doctor` line, and a README section. Pick the marketplace name: letters, digits, `.`, `_`, `-`, starting with a letter or digit, and not `inline`, `skills-dir` or `synced`. ✅ [Docs] marketplace reference, loading

## 7. Not verified

- Bare `/idea` running `or:idea` in a live session. Docs say yes; `-p` mode here couldn't list skills to prove it.
- How the `/` menu looks after typing `/or`. Inferred from the completion rules.
- Codex: whether `$idea` (no prefix) reaches a plugin's `or:idea`, and how a plugin skill and a project skill with the same name resolve.
- Whether a plugin inside a repo's `.claude/skills/` (`@skills-dir`) loads in a cloud session.
- The desktop app and IDE extensions: not tested.
