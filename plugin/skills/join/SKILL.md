---
name: join
description: Use when the person is new to a repository that already exists and hasn't been set up with this workflow yet - no docs/state.md ("help me get set up in this repo", "I just joined this project", "adopt this repo", "onboard me") - maps and runs the code first, grills the person on what the code can't say, then writes a short AGENTS.md and the docs folder so every later session starts informed.
---

<!-- Made by scripts/sync-skills.mjs from .agents/skills/join/SKILL.md and scripts/plugin-handoff.md. Edit those, then run it. -->

# /join: start here, then hand off

This is the onRails plugin's starter copy of `join`. The project's own copy is the real one.

## Step 0: hand off

1. **Is the kit in this project?** Look in the project root for `.agents/skills/join/SKILL.md`, or `.claude/skills/join/SKILL.md`.
2. **Yes:** read that file and follow it from the top. Ignore the rest of this one. The project copy wins, even when this plugin is newer.
3. **No:** say: *"This folder doesn't have the onRails kit yet. Want me to install it here? It adds `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/` and an issue template. It never overwrites a file you have. Yours stay, and the kit's copy goes next to them."* Wait for a yes. A no ends it here: say they can install it later with this same command.
4. **After a yes, install it.** No npm needed. The kit ships inside this plugin:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/cli/bin/cli.mjs" init . --no-start
   ```
   - If that path still holds a `$` and braces (Codex doesn't fill it in), use the folder two levels above this `SKILL.md`: `node "<that folder>/cli/bin/cli.mjs" init . --no-start`.
   - No `cli/` folder there either? Ask before you run `npx onrails init . --no-start`. It downloads from npm.
   - Show the person what `init` printed: what it added, and each file it kept.
5. **Then carry on.** Read `.agents/skills/join/SKILL.md`, now on disk, and follow it from the top. Tell the person, once: *"The kit is in. Its skills should load on their own. If `/join` still runs the plugin's copy, run `/reload-plugins` or start a new session. A new session also loads `AGENTS.md` and the kit's hooks."*
