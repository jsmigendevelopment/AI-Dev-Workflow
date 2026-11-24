# Tracer-bullet pyramid

Planned on the model the person chose (decision 5). Nothing is built yet. The loop starts pass 1 after the pass 1 issues are written and the person says go.

Passes: **3** (Works, Real, Ready). Pass 1 is detailed. Passes 2 and 3 are outlines only.

## Slice 0: the skeleton

- [ ] Apply `stack-tanstack-start` to the repo. Rename or delete the example notes module.
- [ ] The app runs locally, and every check command works: `check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`. Write the exact commands in "Commands that work here" in `AGENTS.md`.
- [ ] Lint enforces the code rules a tool can check, including the module boundary check. Generators exist for module, route, section and component. Write the generator command in `AGENTS.md`.
- [ ] CI runs on every pull request: checks, secret scan, agent-file guard, issue-link check, and Dependabot auto-merge. Start from `templates/ci.yml` in the `idea` skill and the stack pack.
- [ ] The skeleton sets up the conventions from `guide/app-conventions.md` rule 9: error system with request IDs, structured logger, `/api/health`, the `/api/v1` shell with no features, UTC times, money in cents, the ID strategy and standard columns, `audit_events` table, feature-flag file (with `single_household` off), `track()` registry (empty), design tokens with breakpoints and type scale, `ErrorState`, `EmptyState` and the skeleton primitive, and per-module `copy.ts`.
- [ ] Main deploys to the test environment. Preview per pull request if the host offers one. Record the test URL in `AGENTS.md`: **blank until deployed.**
- [ ] Secrets for **local and test only** through the `secrets` skill. Production secrets wait for the person (always-stop list).
- [ ] GitHub setup through `name`'s `setup-github.mjs`. Show the person the `--dry-run` list and ask *"Set this up now?"* before the real run.

The person signs up for the Clerk and Cloudflare accounts. Before wiring them, confirm the free tiers cover the test site. Spending money is always-stop.

## Slices

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items, tick them off, see another account's ticks within 5 seconds |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Sign in on a second account and land in the same household. Thin: one shared household behind a flag. |
| Cost split | support | Nothing yet. Starts in pass 2. |

**Core test:** does the core work without it? Sign-in and household are needed for "who can see" (the floor), so they stay in. Cost split is needed for done-when 2, so it stays in, in pass 2.

Not in the MVP: recipes, shop suggestions, receipts by photo (`docs/mvp.md`).

## Outline: every pass

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates tick the same list | slice 0, sign-in, household (thin), shared list (add, tick, live) | Thin and working end to end. Designed empty, loading and error states on the list. | building |
| 2 Real | The household and the split are real | shared list, sign-in, household, cost split | List: shop mode, undo a tick, states tuned. Sign-in: failure messages. Household: make, invite link, members, leave (deletes personal data), remove the flag. Split: spends, month view, even split with remainder, who owes whom. | outline |
| 3 Ready | MVP complete on the test site | core, then the whole app | Core polished: WCAG 2.2 AA on every screen, speed budget, SEO basics, copy pass. Whole app: rate limit on invite links, dependency audit, launch checklist written. Coming soon page stays on. | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: detail (pass 1, Works)

Build in this order. Each slice must work before the next starts.

### 1. Skeleton (slice 0)

See the checklist above. Done when the test URL loads and every check passes on main.

Also needed before slice 2 (sign-in): **write `docs/security-policy.md`.** The stack step should have written it and the repo doesn't have it. It holds the access model (one household, members only), the sign-in rules and the logging rules. Risky lane.

### 2. Sign-in (support)

**Must do:**
- Sign in with Google through Clerk. Sign out. Signed-out visitors see the sign-in screen only.
- A `users` row is created on first sign-in. It holds name and email, as the floor says.
- Write a `sign_in` audit event (`audit_events`) with no personal data in it.
- Seed script: two test users in the test environment, so `qa` can always sign in. No real email addresses.
- Route guard: every page except sign-in requires a session.

**Risk:** auth. Risky lane. `pr-security` reviews it, and the person merges it.

### 3. Household, thin (support)

**Must do:**
- Tables: `households` and `members`. `members` is also the access store: each row is the tuple `household:<id> member user:<id>`. No second table in pass 1.
- Flag `single_household` (on in test only). When it's on, the first sign-in joins the one shared household. Later sign-ins join it too.
- `check(user, 'view' | 'edit', household)` in the shared access module. Every list read and write calls it. A non-member gets `not_found`, never "forbidden".
- The list module never imports the household module. The route passes the household ID in.

**Must not:** make households, invite links or a members screen. Those are pass 2.

**Risk:** who can see what. Risky lane.

### 4. Shared list: add (core)

**Must do:**
- Tables: `items` (`household_id`, `name`, `added_by`, `ticked_at` nullable, standard columns).
- Add box at the top of the List screen. Each item shows its name and who added it.
- Designed states: empty (icon, one sentence, "Add your first item"), loading (skeleton with the real row shape), error (icon, title, message for the error code, retry, reference ID).
- Server functions: `listItems`, `addItem`. Both call `check()`.

### 5. Shared list: tick and live (core)

**Must do:**
- `setTicked(itemId, ticked)` writes `ticked_at` in UTC, or clears it. Server-set time.
- The list refetches every **5 seconds** (TanStack Query `refetchInterval`), and pauses when the tab is hidden (`refetchIntervalInBackground` off).
- Ticked items sit below unticked ones. Ticked items show the tick, not just a strike-through.

**Done when:** done-when 1 in `docs/mvp.md` passes on the test site with two accounts.

### Pass 1 schema

| Table | Columns | Notes |
|---|---|---|
| `users` | `id`, `name`, `email`, `created_at`, `updated_at` | `id` is the Clerk user ID |
| `households` | `id`, `name`, `created_at`, `updated_at` | |
| `members` | `household_id`, `user_id`, `created_at`, `updated_at` | Primary key (`household_id`, `user_id`). Indexed on `user_id`. |
| `items` | `id`, `household_id`, `name`, `added_by`, `ticked_at`, `created_at`, `updated_at` | `ticked_at` is UTC or null. Index on `household_id`. |
| `audit_events` | from the skeleton | `sign_in` is the first event written |

Standard columns, snake_case, foreign keys named `<table>_id` with indexes, per `guide/app-conventions.md` rule 12. Not in pass 1: `spends` (pass 2).

### Pass 1 API

- Server functions only. Versioned `/api/v1` has no features in pass 1.
- Session: platform code, not a feature module.
- `list` module: `listItems(householdId)`, `addItem(householdId, name)`, `setTicked(itemId, ticked)`.
- `household` module: `getCurrentHousehold()`.
- The route composes the two modules. Modules never import each other.

### Pass 1 screens

- **Sign in:** one button, Continue with Google. From `docs/design.md`.
- **List:** from `docs/design.md`, with the add box, tick boxes and who-added line. Shop mode, Household and Split screens are pass 2.

## Decisions the person still owes (ask three at a time, recommended answers)

1. **Pass 1 household:** how does a second flatmate get in?
   - A) One shared household for anyone who signs in, behind `single_household`. **Recommended:** the friend can try it with their own Google account.
   - B) Only the two seeded test accounts. Simpler, but the person can't test with a real friend.
   - C) Build invite links now. Pulls pass 2's household slice forward and makes pass 1 bigger.
2. **Splitting in pass 2:** when a month's total doesn't divide evenly, who gets the leftover cents?
   - A) The member who joined first. **Recommended:** the same answer every time, no argument about who paid.
   - B) The person who paid the last spend.
   - C) Split to the nearest pound each, then check the total by hand.
3. **Live updates:** how fast should other flatmates' ticks show?
   - A) Every 5 seconds, as the design says. **Recommended:** no new service, and the cost is a few small reads per open tab.
   - B) Every 2 seconds. Feels faster, roughly 2.5 times the reads.
   - C) Push updates. Feels instant, but adds a real-time service and a cost to review.

## Technical defaults (recorded in `docs/decisions.md`; the person can change them)

- IDs: UUIDv7, made by the server.
- Instants: ISO 8601 with `Z`.
- Money: integer `amount_cents` with a `currency` column, as `docs/design.md` says. Rounding: half-even, with the remainder allocated (see question 2).
- Access: the kit's built-in engine, with `members` as the tuple store. Two relations are enough for the MVP, so no research is needed.
- Language: English only. Each module's text lives in `copy.ts`.

## Gaps found while planning

- `docs/security-policy.md` is missing. Written before the sign-in issue (see above).
- `docs/research/README.md` is missing. Not needed for pass 1.
- The wireframe hash in `docs/decisions.md` row 3 was not checked. The shell was denied during planning. Check it before the issues are written.
- `docs/design.md` has a short schema and API section. This plan has the full version. Replace that section with a pointer here when the issues are written.
- `docs/architecture.md` lists only the three feature modules. The shared access and session code is platform code, so add it there when slice 0 is built.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Re-plan |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Debt

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

## After the MVP: the hourglass

Not planned yet. Starts after the MVP is complete on the test site and the person says what's next.

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 |  | core |  |

## Build order

- Skeleton: app runs, every check command works, CI on every pull request, main deploys to test :: nothing
- Secrets: Clerk and database keys for local and test, names only in docs :: nothing
- GitHub setup: labels, Dependabot, secret scanning, main branch rules, production environment that waits for the person :: nothing
- Security policy: `docs/security-policy.md` with the access model and sign-in rules :: nothing
- Sign-in: Google sign-in, sign-out, two seeded test accounts :: Sign in with Google, sign out, and land back on the sign-in screen
- Household access: one shared household for signed-in users behind a flag, membership checks on every list call :: Sign in with a second account and see the same household, with no one else's data
- Add items to the shared list: add, see who added each item, empty, loading and error states :: Add an item and see your name on it
- Tick items off and see ticks from another account within 5 seconds :: Tick an item in one account and see it ticked in the other within 5 seconds, without reloading
