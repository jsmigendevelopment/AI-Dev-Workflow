# Preflight: find every blocker in the first minute

Your sandbox and the person's terminal have different permissions. `doctor` checks theirs. Preflight checks yours, from inside your own session, so a blocked install, a read-only `.git` or a closed port shows up before any work, not one stall at a time.

## Run it

```bash
node .agents/skills/ask/scripts/preflight.mjs --model <your model> --effort <your effort>
```

- It takes about 10 seconds and prints **one table**: repo write, `.git` write, the package registry, GitHub, loopback, a browser (only when the project's tests need one), Node and the package manager, model and effort.
- Start it only this way, or with a globally installed `onrails preflight` by its absolute path. Before the repo is read, never through `npx`: npx changes `PATH` and which `onrails` runs, in ways the repo can steer. Wrong tool guessed in the heading? Add `--tool claude`, `claude-cloud`, `codex` or `other`.
- **When:** the first step of `/idea`, `/join`, `/back` and `build`.
- **Once `docs/state.md` exists,** add `--if-changed --record`. It writes the result to the `Environment:` line there. When that line says ok and the sandbox hasn't changed (same machine, tool, Node, install settings and read mark), it skips every probe.
- `–` rows are fine. GitHub at `–` means the loop runs in local mode (`../../coordinate/references/local-mode.md`).
- **Until the repo is marked read, preflight runs no code the repo chose.** The mark is a file inside `.git/` that `/join` or `/back` writes with `preflight.mjs --mark-read` once your session has read the repo. Run it in the repo's top folder: it marks only the `.git` there, never a parent's, and prints the folder it marked. `git clone` never copies the mark, and a copy that came with the repo doesn't count, nor does a `.git` symlink or a `.git` file that isn't a linked worktree git made, so a `docs/state.md` the repo ships doesn't make it read. A linked worktree counts only once it has been marked itself: run `--mark-read` in its top folder. Its mark sits in its own folder under `.git/worktrees/` and names that checkout folder, so a folder put where a deleted worktree used to be doesn't count. A worktree your session or the loop just made from a marked repo (`git worktree add`, or your tool's worktree isolation) may be marked at once: its files come from the repo's own commits. `--if-changed` says so too when it skips. Until then:
  - every command is found on, and given, a `PATH` without the folders whose real path is inside the repo. In a repo at your home folder, that skips the tools installed under it (nvm, volta, `~/.local/bin`): those rows read as not installed until the mark;
  - no `<pm> --version`: it finds the manager on PATH without running it, and reads a yarn version from a plain `yarnPath` file name where there is one;
  - no Playwright launch, which loads the project's own files;
  - npm, `gh` and `git ls-remote` run from a temp folder whose real path is outside the repo, against the remote's URL and the `.npmrc` registry only when they are plain;
  - git runs with the repo's hooks turned off.

  Those rows show `–` and say "after the repo is read", and one line under the table says the repo isn't marked yet. Run preflight again after `--mark-read`. Every command starts by the full path preflight found on `PATH` (relative entries skipped, and before the read, folders inside the repo), with `COREPACK_ENV_FILE=0`; on Windows, every command also has `NoDefaultCurrentDirectoryInExePath=1`, so the current folder is never searched for a program. A probe that runs past its time is stopped with everything it started.

**Done when** the table is printed and every `✗` row has been through the steps below.

## Fix everything in one batch

Asking the person is the last rung, not the first move. For each `✗` row, work down its ladder in the order printed:

1. **Fix it yourself, or work around it in the sandbox.** `git init`. Playwright's bundled browser. The package manager's own project-local cache, as rung 1 names it. Another port. `--webpack` in place of Turbopack. The server and its tests in the same process.
2. **One command outside the sandbox,** with your tool's own permission request. Codex: `approval_policy = "on-request"` lets you ask to run one command, such as the install. Claude Code: run it as one plain command, so the prompt covers only it.
3. **The environment tools you may use:** the cloud environment's settings, a connected browser, the setup docs. This is "Try before you block" in `ask`.
4. **Only then the person, in ONE message.** Never one message per problem, and never dripped out as you hit them.

Then:

- **Run preflight again** after rungs 1 to 3. A "Fix it yourself" that failed twice counts as blocked: add it to the message.
- **The one message.** Preflight prints its draft: a single "Setup step for you" with a numbered fix for every row still blocked, written for your tool. Fill in its `Tried:` line. It lists what you tried on each rung and why that didn't clear it, so the person can see you didn't give up early. Send it through `ask`'s steps: one `needs-human` record, one ping. The record holds the whole message, the `Tried:` line included: on the issue, or with issues as files, in the issue's file under `## Comments` with `needs-human` on its `Labels:` line. A line in chat or in "Waiting on you" alone is not the record.
- **Never scaffold a half-app.** Installs blocked (the registry, the repo or Node row)? Don't scaffold, and don't build. No app without its dependencies, and no "install them from your terminal" after the fact. Work that needs no install goes on: the grill, the wireframes, the plan, the issues.
- **Record it.** With `--record`, `docs/state.md` says `Environment: ok`, or names the open rows. `/back` reads it.

**On Full automation,** rung 4 doesn't wait. The one message is a parked item: "Waiting on you" plus the next ℹ️ FYI. Everything that needs no install goes on. It becomes a 🛑 blocker ping only when every remaining item needs a blocked row.

**Done when** every row is `✓` or `–`; or the one message is recorded and pinged, nothing was scaffolded on a blocked install, and the rest of the work is moving.

## The strongest tier, asked once

The tier question follows the same rule: once, then never again in that session. `routing`'s first rule has it. A session that can't switch models says so once, carries on with the model it has, and records it. It never tells the person to start a new session.
