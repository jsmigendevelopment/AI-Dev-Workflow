---
name: afk
description: Use when the person is stepping away and wants the build loop to keep going ("afk", "brb", "taking a break", "going to lunch", "signing off", "good night", "keep building while I sleep") - asks how long, checks usage and asks what to do at a limit, sets safe unattended rules, writes the state note first, sets a watchdog and a hard stop, and keeps the loop running until the person is /back.
---

<!-- Made by scripts/sync-skills.mjs from .agents/skills/afk/SKILL.md and scripts/plugin-handoff.md. Edit those, then run it. -->

# /afk: start here, then hand off

This is the onRails plugin's starter copy of `afk`. The project's own copy is the real one.

## Step 0: hand off

1. **Is the kit in this project?** Look in the project root for `.agents/skills/afk/SKILL.md`, or `.claude/skills/afk/SKILL.md`.
2. **Yes:** read that file and follow it from the top. Ignore the rest of this one. The project copy wins, even when this plugin is newer.
3. **No:** say: *"This folder doesn't have the onRails kit yet. Want me to install it here? It adds `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/` and an issue template. It never overwrites a file you have. Yours stay, and the kit's copy goes next to them."* There's no build loop to keep going yet, so suggest `/idea` for a new app or `/join` for a repo that already has code. Wait for a yes. A no ends it here: say they can install it later with this same command.
4. **After a yes, install it.** No npm needed. The kit ships inside this plugin:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/cli/bin/cli.mjs" init . --no-start
   ```
   - If that path still holds a `$` and braces (Codex doesn't fill it in), use the folder two levels above this `SKILL.md`: `node "<that folder>/cli/bin/cli.mjs" init . --no-start`.
   - No `cli/` folder there either? Ask before you run `npx onrails init . --no-start`. It downloads from npm.
   - Show the person what `init` printed: what it added, and each file it kept.
5. **Then carry on.** Read `.agents/skills/idea/SKILL.md` for a new app, or `.agents/skills/join/SKILL.md` for a repo that already has code, now on disk, and follow it from the top. Tell the person, once: *"The kit is in. Its skills should load on their own. If `/afk` still runs the plugin's copy, run `/reload-plugins` or start a new session. A new session also loads `AGENTS.md` and the kit's hooks."*
