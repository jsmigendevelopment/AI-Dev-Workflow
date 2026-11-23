# AGENTS.md

Rules for every agent in this repo: planner, builder, reviewer or coordinator.

## Who you're working with

- A person who owns the product. Build what they want, not what you guess they want.
- They may not know the technical words. Ask in plain words, then name the term.

## Always stop and ask the person before

- deleting or migrating real data;
- touching production settings, secrets or `.env` files;
- deploying to production;
- spending money or signing up for a paid service.

## Standing rules

1. **Don't assume. Ask.** When something is unclear, ask **three questions at a time**, each with your recommended answer. On taste, scope and money, ask the open question first.
2. **Your first idea is *a* solution, not *the* solution.** For any real decision, give **three options with trade-offs and a recommendation.** Crucial unknowns go to the `research` skill.
3. **The code wins over the docs.** If they disagree, trust the code, then fix the doc or flag it.
4. **Decisions live in files, not in chat.** Write each one to `docs/decisions.md` when it's made. A new session must be able to pick up from the repo alone.
5. **One issue, one fresh session.** Reviews start from the diff, not from the author's description.
6. **Stay inside the fence.** Build exactly what the issue says. Found something else? Open a new issue.
7. **Never weaken a test to make it pass.** If a test looks wrong, stop and say why.
8. **Follow `docs/architecture.md` and `docs/design.md`.** Feature modules don't import each other. The API goes controller → service → repository/client. Use the chosen UI kit's components, and keep files small and readable.
9. **Secrets stay secret.** Never read, print or commit `.env` files, tokens or keys. Refer to them by name.
10. **Reuse before you build:** an open-source library first, then a free-tier SaaS, then build it yourself.
11. **Never sit idle without telling the person.** If GitHub or any service says you're rate-limited or blocked, tell the person right away: what's blocked, and when it resets (`gh api rate_limit` shows it, and checking it doesn't count against the limit). Use a push notification if your tool has one. Then keep doing everything that doesn't need that service, and pick the blocked work back up after the reset.
12. **Never force-push, and never push straight to `main`.** Changes reach main through a pull request.

## Skills

When a step names a skill, open it. If it doesn't load by name, read `.agents/skills/<name>/SKILL.md`.

| The person types | When |
|---|---|
| `/idea` | Starting a new app from an idea |
| `/join` | New to an existing repo that isn't set up yet |
| `/back` | Starting or returning to work |
| `/afk` | Stepping away while the loop keeps going |

Called by those, by issues and by the loop:
- `grill`, `name`, `stack`, `research`, `pyramid`, `issues`, `routing`;
- `coordinate`, `build`, `pr-review`, `pr-security`, `qa`;
- `web-performance`, `web-security`, `seo`, `a11y`, `dependencies`;
- stack packs: `stack-<name>` (for example `stack-tanstack-start`).

An issue's `Skills:` line names at most three. Load them.

## Project facts

Fill these in once `/idea` or `/join` has run.

- **What it is:** `docs/vision.md` · **MVP:** `docs/mvp.md`
- **Stack, architecture, design:** `docs/stack.md`, `docs/architecture.md`, `docs/design.md`
- **Where things stand:** `docs/state.md`
- **Risk dial:** see `docs/stack.md`
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
| `test:e2e` | the `auto` acceptance checks in a real browser |
| `build` | the production build |

<sub>AI-Dev-Workflow kit · v0.3 · 2026-11</sub>
