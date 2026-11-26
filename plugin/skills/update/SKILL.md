---
name: update
description: Use when the person wants onRails brought to its latest version ("/update", "update onRails", "get the latest onRails", "update the plugin", "is onRails up to date") - runs `npx onrails@latest update --all`, which updates the Claude Code and Codex plugins, the global entry skills and this project's kit, runs doctor and prints each part's version before and after, then tells the person to run `/reload-plugins`.
---

# /update: bring onRails to its latest

One command updates every part this machine and folder have. It only installs the latest release. Never bump a version, tag or publish.

## Steps

1. **Read the automation level** from "Automation level" in `docs/stack.md`. No section, or no project here? The default is `[defaults] automation` in the profile (`docs/profile.toml`, else `~/.onrails/profile.toml`), else Recommended.
2. **Show the plan.** From the project root, or the current folder outside a project, run `npx onrails@latest update --all --dry-run`. It runs nothing and writes nothing. It lists the four parts:
   1. the plugin commands it would run, for each tool whose plugin is installed;
   2. the global entry skills, when `init --global` was used;
   3. the project kit, when this folder is an onRails project;
   4. `doctor`.
   - npx fails (no network, or the registry is blocked)? Climb "Try before you block" in `ask` first. Still blocked? Run the plugin's own CLI instead: `node "${CLAUDE_PLUGIN_ROOT}/cli/bin/cli.mjs" update --all`. If that path still holds a `$` and braces (Codex doesn't fill it in), use the folder two levels above this `SKILL.md`. Say that it brings only the kit this plugin carries, not the newest release.
3. **Go ahead.** **On Full,** ask nothing: go to step 4 and put the plan in your report. **Below Full,** show the plan and ask once: "Run it?" A no ends it here.
4. **Run it:** `npx onrails@latest update --all` (the same fallback as step 2). Show the person what it printed: the summary of each part, before and after, and every "Left for you" line.
   - A plugin command failed? Show the command and its error, then run that one command again once. Still failing? Record it as a 🛑 blocker through `ask`, with the command as the "Setup step for you".
   - The project kit changed? Its files aren't committed. They reach main through a pull request, like any change (`AGENTS.md`, rule 12). A changed `AGENTS.md`, `.agents/` or `.claude/` gets the weakening review (`coordinate`, Rules).
   - Kept files (`.onrails-new`)? List them. `/join` merges the project's; the global ones are compared by hand.

**Done when** the summary is shown and you've told the person the last step.

Claude Code can't reload a running session's plugins itself, so end with this line, word for word: "Last step: run `/reload-plugins` (Claude Code) or start a new session (Codex)."
