# Contributing

Thanks for helping. This kit is small on purpose, so the bar for adding things is high. Fixes and clearer words are always welcome.

## Before you start

- **A bug or a small fix:** open an issue with the bug template, or send a pull request.
- **A new skill, pack or add-on:** open an issue with the idea template first. Wait for a yes before you build it.

## Propose a skill

A skill is one job, with steps an agent follows. Say in the issue:

- the job, and the words a person says when they need it;
- why an existing skill can't do it;
- which skill calls it, and which skill it names next;
- what it costs in tokens. Skills load only when named, but `AGENTS.md` loads every session, so keep that file lean.

## Propose a pack or add-on

A stack pack is a working starter app. An add-on is an optional piece for a pack. Say in the issue:

- the stack, and who needs it;
- that every library is popular, maintained and under a licence that's fine in a closed-source product (MIT, Apache-2.0, BSD or similar);
- that it has a free tier, or runs with no account at all;
- how it meets the check contract: `check`, `lint`, `typecheck`, `test`, `test:e2e` and `build`.

A ready pack must run, test and build on a clean install with no accounts and no keys. With no keys set, an add-on must still build, and its feature stays off. Pin exact versions.

## Edit a skill

Skills have two copies. `.agents/skills/` is the master. `.claude/skills/` is a mirror.

1. Edit the skill in `.agents/skills/<name>/`.
2. Run `node scripts/sync-skills.mjs` to copy it to `.claude/skills/`.
3. Commit both copies.

Never edit `.claude/skills/` by hand. CI fails if the copies differ.

## Run the checks

From the repo root:

```bash
node scripts/sync-skills.mjs --check
cd cli && npm run bundle && npm test
```

If you changed a script, run `node --check <file>` and its `--dry-run`. If you changed a pack, run its `pnpm check` and `pnpm test:e2e` on a clean install.

Never weaken a test to make it pass. If a test looks wrong, say why in the pull request.

## Write like the kit

Every file a person or an agent reads follows the same voice:

- **Blunt.** Say what to do. Skip "you might want to consider".
- **Short sentences.** One idea each.
- **Plain words,** at about an 8th-grade level. If you need a technical term, explain it in plain words first.
- **No hype.** No "powerful", "seamless", "blazing fast" or "revolutionary". Show a number or say nothing.
- **Facts get a source and a date.** A version or a price you checked says when.

## What the kit doesn't do

- **TanStack Start is the default; Next.js is a supported alternative.** Keep TanStack Start and Cloudflare as the recommended picks, and list Next.js as an option where it fits. Don't add links that push one host.
- No paid service as a default where a free tier or open source does the job.
- No secrets, tokens or `.env` files in commits, issues or logs.

## Pull requests

- One change per pull request. Say what changed and how you checked it.
- Fill in the pull request template.
- Add a line to `CHANGELOG.md` under **Unreleased**.

By contributing, you agree your work is released under the [MIT licence](LICENSE). Everyone here follows the [code of conduct](CODE_OF_CONDUCT.md).
