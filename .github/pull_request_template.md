## What changed

<!-- One or two sentences. One change per pull request. -->

Closes #

## How I checked it

- [ ] `node scripts/sync-skills.mjs --check`
- [ ] `cd cli && npm run bundle && npm test`
- [ ] Changed a script: `node --check` and its `--dry-run`
- [ ] Changed a pack or add-on: `pnpm check` and `pnpm test:e2e` on a clean install

## Before you ask for a review

- [ ] Branch is `feat/<n>-...` or `fix/<n>-...`, and `Closes #` above names that issue. No issue? Label it `no-issue`.
- [ ] Skills edited in `.agents/skills/`, then synced. Nothing edited by hand in `.claude/skills/`.
- [ ] No test weakened or skipped to make it pass.
- [ ] No secrets, tokens or `.env` files.
- [ ] Follows the voice in `CONTRIBUTING.md`: blunt, short sentences, plain words, no hype.
- [ ] A line in `CHANGELOG.md` under **Unreleased**.
