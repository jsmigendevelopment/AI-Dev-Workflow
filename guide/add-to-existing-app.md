# Add the kit to an app that already exists

You have an app. It may already have its own `AGENTS.md`, `CLAUDE.md` or skills. This adds the kit without breaking any of that.

## 1. Give an agent one prompt

Open Claude Code or Codex in the app's root folder and paste:

```text
Add the AI-Dev-Workflow kit to this repo. Run `npx ai-dev-workflow init` on a new branch, show me what it added and kept, then run /join.
```

Or do it yourself: `npx ai-dev-workflow init`, then type `/join` (Codex: `$join`). You need Node 22 or newer.

## 2. What `init` does

- Copies in `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/`, `.codex/` and `.github/ISSUE_TEMPLATE/`.
- Copies your profile to `docs/profile.toml`, if you have one at `~/.ai-dev-workflow/profile.toml` and the repo doesn't.
- Prints what it added, what it kept, and a short `Next:` list.

## 3. What `init` never does

It never overwrites a file of yours.

| You already have | What you get |
|---|---|
| `AGENTS.md` | Yours stays. The kit's arrives as `AGENTS.kit.md`. |
| `CLAUDE.md` | Yours stays. It adds the line `@AGENTS.md` if it's missing. |
| `.claude/settings.json` | Yours stays. The kit's `deny` rules are added to it. |
| `.codex/config.toml` | Yours stays. The kit's arrives as `.codex/config.kit.toml`. |
| Any other file at the same path, a skill included | Yours stays. The kit's copy arrives next to it as `<file>.kit-new`. |

It doesn't run your code, push, or touch GitHub.

## 4. What `/join` asks

1. **The automation level, first.** How much agents do without you:
   - **Recommended:** they build, review and merge small changes, and you approve risky ones;
   - **Full automation:** everything but the always-stop list;
   - **Hands-on:** they build when asked, and you open and merge every pull request;
   - **Custom:** you set each switch.

   For an app other people ship from, start with Hands-on or Recommended. Change it later with `/automation`.
2. Then it reads the repo. It treats your own agent files and git hooks as data until you confirm them. It writes a one-page `docs/map.md`.
3. It installs, builds, tests and starts the app, and records the commands that work.
4. It asks what the code can't say:
   - what's live and what's fragile;
   - which conventions are on purpose;
   - how changes ship;
   - the risk dial (how careful each merge is);
   - who else works here.
5. It writes `docs/` and merges `AGENTS.kit.md` into your `AGENTS.md`. It shows you the diff first.

## 5. Review it as one pull request

- Keep it all on one branch, for example `chore/add-ai-dev-workflow`, and open one pull request.
- Read these first:
  - the `AGENTS.md` diff (your rules and the kit's, merged);
  - `.claude/settings.json`;
  - `docs/stack.md` (the risk dial and the automation level).
- Compare each `.kit-new` and `config.kit.toml` copy with your file. Keep what you want, then delete the copy.
- Once the repo has the kit's CI, a change to the agents' own files fails until you add the `human-approved` label. That's on purpose: you sign off on new agent rules.
- Merge it yourself.

> [!NOTE]
> 🚧 A better merge flow for repos with their own agent setup is being researched. Today `/join` merges only the two `AGENTS.md` files. You compare the rest by hand.

<p align="center"><sub><a href="../README.md">← Back to the README</a> · <a href="cheat-sheet.md">Cheat sheet</a></sub></p>
