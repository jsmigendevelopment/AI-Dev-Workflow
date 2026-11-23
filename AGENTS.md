# AGENTS.md

Rules for every agent in this repo: planner, builder, reviewer or coordinator.

## Who you're working with

- A person who owns the product. Build what they want, not what you guess they want.
- They may not know the technical words. Ask in plain words, then name the term.

## Always stop and ask the person before

- deleting or migrating real data;
- touching production settings, secrets or `.env` files;
- deploying to production, or making the app public (turning off its "Coming soon" page);
- spending money or signing up for a paid service.

## Standing rules

1. **Don't assume. Ask.** When something is unclear, ask **three questions at a time**, each with your recommended answer. On taste, scope and money, ask the open question first.
2. **Your first idea is *a* solution, not *the* solution.** For any real decision, give **three options with trade-offs and a recommendation.** Crucial unknowns go to the `research` skill.
3. **The code wins over the docs.** If they disagree, trust the code, then fix the doc or flag it.
4. **Decisions live in files, not in chat.** Write each one to `docs/decisions.md` when it's made. A new session must be able to pick up from the repo alone.
5. **One issue, one fresh session.** Reviews start from the diff, not from the author's description.
6. **Stay inside the fence.** Build exactly what the issue says. Found something else? Open a new issue.
7. **Never weaken a test to make it pass.** If a test looks wrong, stop and say why.
8. **Follow `docs/architecture.md` and `docs/design.md`.** Feature modules don't import each other. The API goes controller → service → repository/client. Use the chosen UI kit's components and design tokens, and keep files small and readable.
9. **Secrets stay secret.** Never read, print or commit `.env` files, tokens or keys. Refer to them by name.
10. **Reuse before you build:** an open-source library first, then a free-tier SaaS, then build it yourself.
11. **Never sit idle without telling the person.** If GitHub or any service says you're rate-limited or blocked, say what's blocked and when it resets (`gh api rate_limit` shows it, and checking it doesn't count against the limit). Send it the "Needs you" way below: an FYI, or a blocker if nothing else can move. Then keep doing everything that doesn't need that service, and pick the blocked work back up after the reset.
12. **Never force-push, and never push straight to `main`.** Changes reach main through a pull request.
13. **Ask before using the strongest model tier,** unless `docs/profile.toml` says not to (see the `routing` skill).

## Code

The owner's rules. Lint catches some. `build` follows them all and `pr-review` checks them.
- Search before you write, and copy the nearest example. Use the generator if one exists.
- Write the simplest thing that passes the checks. No new abstraction until a second real use.
- No leftovers: unused code or dependencies, `console.log`, commented-out code, TODOs without an issue number.
- No `any`, `@ts-ignore`, `as unknown as` or `eslint-disable` unless a comment gives the reason and an issue number.
- Files warn at 300 lines and stop at 500. Functions stay under about 60. No empty catch. Comments say why.
- Install only packages you checked on the registry. Never install a name you guessed.
- No barrel `index.ts` files. Import from the file itself. Lint guards module boundaries.
- Every change has an issue: branch `feat/<n>-...` or `fix/<n>-...`, and a pull request that says `Closes #<n>`. Only the `no-issue` label skips it.
- App shape (state, errors, loading, UI layers, API versions, money, time, the database, logs, events, env, access) is in `docs/architecture.md`. Reasons: `guide/app-conventions.md` in the kit.
- Money in integer minor units with its currency, instants in UTC, logs only through the logger, events only through `track()`, access only through `check()`.
- Error and empty states are designed: icon, title, specific message, next action, reference ID. A bare "Error" or a grey-box skeleton fails review.
- Need the person to do something outside the repo? Use the `ask` skill's "Setup step for you" format. Secret values only through the `secrets` checklist, never chat.

## Needs you

How and when to get the person's attention. The `ask` skill has the full convention and the message template.

- 🛑 **Blocker:** the always-stop list, an unclear MVP core, a critical security finding, production down, or nothing else can move. Stop that one thing, ping now, keep doing other safe work.
- ⏳ **Decision:** a gate the risk dial asks for, taste, scope or money, the review cap, an unclear issue, a stale claim. Label it `needs-human`, keep going. Pings are batched.
- ℹ️ **FYI:** ready to try, usage, a rate limit and its reset. Never interrupts. It shows on the board and at `/back`.
- **Never interrupt** for what the repo, the docs or the profile can answer, or to ask permission for what the issue already says.
- **Ping** with `node .claude/hooks/notify.mjs --level <level> --title "<what>" ...`. It honours presence, quiet hours and the batch window. While the person is away, only critical blockers ping.
- **Record it** with the `needs-human` label, a comment on the issue or pull request, and the "Waiting on you" list in `docs/state.md`.

## Skills

When a step names a skill, open it. If it doesn't load by name, read `.agents/skills/<name>/SKILL.md`.

| The person types | When |
|---|---|
| `/idea` | Starting a new app from an idea |
| `/join` | New to an existing repo that isn't set up yet |
| `/back` | Starting or returning to work |
| `/afk` | Stepping away while the loop keeps going |
| `/automation` | Changing how much agents do on their own |

Called by those, by issues and by the loop:
- `grill`, `name`, `stack`, `secrets`, `research`, `pyramid`, `issues`, `routing`;
- `coordinate`, `build`, `pr-review`, `pr-security`, `qa`, `ask`, `automation`;
- `web-performance`, `web-security`, `seo`, `a11y`, `dependencies`;
- stack packs: `stack-<name>` (for example `stack-tanstack-start`).

An issue's `Skills:` line names at most three. Load them.

## Project facts

Fill these in once `/idea` or `/join` has run.

- **What it is:** `docs/vision.md` · **MVP:** `docs/mvp.md`
- **Stack, architecture, design:** `docs/stack.md`, `docs/architecture.md`, `docs/design.md`
- **Where things stand:** `docs/state.md`
- **Risk dial and automation level:** see `docs/stack.md`. The risk dial is how careful each merge is. The automation level is how much agents do without the person. The more careful one wins.
- **Test URL:** 
- **Commands that work here:** fill in the exact commands once known.

## The check contract

Every project provides these commands, whatever the stack. Skills, CI and the loop only call these names.

| Command | Runs |
|---|---|
| `check` | lint, typecheck, test and build, in order |
| `lint` | the linter, including the boundary check |
| `typecheck` | the type checker |
| `test` | unit tests for every slice so far |
| `test:e2e` | the `auto` acceptance checks, run end to end the way a user would: a real browser for web, a simulator or device for mobile, the built app for desktop |
| `build` | the production build |

<sub>AI-Dev-Workflow kit · v0.4 · 2026-11</sub>
