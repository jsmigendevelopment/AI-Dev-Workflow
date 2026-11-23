# Tracer-bullet pyramid

Planned 2026-11-23 on Haiku 5.5 (decision 5 in `docs/decisions.md`). **Nothing is built yet.** Pass 1 is cut into steps below. Passes 2 and 3 are outlines until their gate. Open questions are at the end of the steps section; answer them before the build starts.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request (checks, secret scan, agent-file guard, issue-link check)
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: *(not yet set)*
- [ ] A preview per pull request (if the host offers one)

Set up in the skeleton, from the `stack-tanstack-start` pack: the error system with request IDs and structured logs, `/api/v1` with a health endpoint, UTC times, money in integer cents, the ID strategy and standard columns, the audit log, feature flags, `object_action` event names, the breakpoints and type scale in the tokens, a `copy.ts` per module, and generators for module, route, section and component.

Before slice 0 can finish, the person needs: a GitHub login (`gh auth login`), the `setup-github` script run after a yes, and free accounts for Cloudflare and Clerk. See the open questions.

## Slices

Only the slices the core can't work without.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add, tick and see a flatmate's tick within 5 seconds, on a list they share |
| Sign-in | support | Sign in with Google, sign out |
| Household | support | See the household and its two members, rename it |
| Cost split | support | Add a spend and see who owes whom |

Test: does the core work without each one? Sign-in is needed because every list belongs to a signed-in person, so it stays. Household and Cost split are kept as thin pass 1 steps. That's a change from `docs/mvp.md`, which first plans them for pass 2. See open question 1.

## Shared design: schema and API

This is the schema and API for the whole MVP. Each table is added by the first pass 1 step that needs it, so one slice adds one table per pass. Tables marked "pass 2" come later.

**Tables**

- `users` (id, clerk_user_id unique, name, email, created_at). Added in step 2. Not yet in `docs/design.md`; add it there when this plan is approved.
- `households` (id, name, created_at). Added in step 3.
- `members` (household_id, user_id, joined_at; primary key on both ids). Added in step 3.
- `items` (id, household_id, name, added_by, ticked_at nullable, created_at). Added in step 4.
- `spends` (id, household_id, paid_by, amount_cents integer above 0, currency ISO 4217, spent_on date, created_at). Added in step 10.
- `invites` (household_id, token hash, created_by, expires_at). Pass 2.

Money is integer cents with its currency. Times are UTC instants. `spent_on` is a calendar date.

**Seed** (added in step 3): one household, two member rows matched to the two Clerk test users by email on their first sign-in, and three items. The seed is what lets two browsers test one list in pass 1.

**Server functions**, one set per module. Each reads or writes only its own tables:

- `list`: `listItems`, `addItem`, `setTicked`
- `household`: `getHousehold`, `renameHousehold`
- `split`: `listSpends`, `addSpend`, `getBalances`
- platform (not a feature module): `currentUser`, `ensureUser`, and `check()`

**Rules that every step follows**

- **Access goes through `check()`.** Every read and write asks `check()` whether the signed-in user is a member of the household. The list module never imports the household module. This keeps the module rule and the "only members see the list and spends" floor item in one place.
- **Sign-in lives in the platform layer,** not as a fourth feature module. `docs/architecture.md` names three modules. Adding one changes that doc. See open question 3.
- **Live updates are polling every 5 seconds in pass 1,** from `docs/design.md`. Live push waits for pass 3, and only if polling is too slow.
- **Each step adds its tests with it,** including the access test: a user who isn't a member gets a uniform 401 or 404, never the data.

## Outline: every pass

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Works | slice 0, then Sign-in, Household, Shared list, Cost split | Thin and working end to end, with one step per verb and the plainest path | building |
| 2 Real | Real | core + supports | Shared list: shop mode with big tick boxes (unticked first), empty, error and loading states, a no-duplicate-names rule. Household: join by invite link (adds `invites`), leave (deletes your name and email). Cost split: odd-cent rounding, month switch. Access checks tested across two users | outline |
| 3 Ready | Ready | core, then the whole app | Live push only if polling is too slow. Accessibility, search basics, speed budget, the "Coming soon" page ready and tested (not switched off), launch checklist | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: steps

Pass 1 is cut into 11 steps. One step is one issue and one pull request. Build order is the table order.

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | The skeleton | slice 0 | Open the test URL: the starter page loads | 5 · sets up the app, the checks, CI and the test deploy | |
| 2 | Sign in with Google | Sign-in | Click Continue with Google and pick your account: the page says Signed in as your name | 5 · the first sign-in wires the provider, its keys and the users table | 1 |
| 3 | See your household | Household | Open /household: the household's name and its two members show | 3 | 2 |
| 4 | See the list | Shared list | Open /list: the three seeded items show, each with who added it | 4 | 3 |
| 5 | Add an item | Shared list | Type "milk" in the box at the top and press Enter: it shows at the top of the list | 3 | 4 |
| 6 | Tick an item off | Shared list | Click the box next to "milk": it's struck through | 2 | 5 |
| 7 | See a flatmate's tick | Shared list | Tick "milk" in a second browser: the first browser shows it struck through within 5 seconds | 3 | 6 |
| 8 | Sign out | Sign-in | Click Sign out: you land on the sign-in page, and signing in again brings you back | 2 | 2 |
| 9 | Rename the household | Household | Type a new name on /household and press Save: the new name shows at once | 2 | 3 |
| 10 | Add a spend | Cost split | Type 12.50 under This month and press Add: the spend shows with you as the payer | 3 | 3 |
| 11 | See who owes whom | Cost split | After a spend of 12.50 by you this month, the Split page says your flatmate owes you 6.25 | 3 | 10 |

**Steps by pass 1 rule.** Steps 4 to 7 are the core's plainest path, in the order that proves the riskiest idea (two browsers, one list) by step 7. Steps 8 and 9 are the other two verbs' plainest paths for Sign-in and Household. Steps 10 and 11 are Cost split's first two steps, with an even split between two members. Odd-cent rounding and more than two members wait for pass 2.

**What each step adds, in short**

1. Skeleton: the app, checks, CI, test deploy, `/api/v1` health endpoint, module generator. No tables.
2. Sign-in: the `users` table, the Clerk sign-in, `ensureUser`, a signed-in page that shows the name.
3. Household: `households`, `members`, the seed, the `/household` read screen.
4. List: `items`, the seeded three items, the `/list` screen with its data.
5. Add item: the add box, the server function, a test that a non-member can't add.
6. Tick: `ticked_at` set and cleared; the struck-through state.
7. Flatmate's tick: polling every 5 seconds on the list.
8. Sign out: clears the session; tested by a second user signing in.
9. Rename: a single text field, one server function.
10. Add spend: `spends`, the add form on /split, integer cents.
11. Owes: the even split across members for the month; one screen, one rule.

**Lanes.** Steps 2, 3, 4 and 10 each add a table, so they're migrations and sit in the risky lane. `docs/stack.md` says the person merges the risky lane. Expect four merges to wait for them.

**Numbers against the checker's pre-build targets.** Median size 3. Two steps at 5, both with a reason. Longest chain 7 of 11 steps. Two steps per slice on each slice. One gap: only one step (2) can start straight after slice 0. Steps 3 and 8 follow it. From step 3, two steps (4 and 10) can run side by side. The pre-build target asks for more than one step to start once slice 0 is in. I kept sign-in first rather than fake parallel work, so the target is missed by one.

### Open questions

Answer these before the build starts. Each one has my recommended answer.

1. **Pass 1 scope.** `docs/mvp.md` plans Household and Cost split for pass 2. This plan adds a thin pass 1 step for each, because the skill rule is that pass 1 runs through every slice. Options: (a) keep the thin steps and update the Passes column in `docs/mvp.md` **(recommended)**; (b) move Household and Cost split to pass 2 and change the rule, so pass 1 is Sign-in and the list only; (c) make household creation the first step, so the seed isn't needed.
2. **Currency.** Which currency does a household use? Options: (a) one currency per household, chosen once when it's made **(recommended)**; (b) one currency per spend, as the current design allows; (c) a single fixed currency for the MVP. Tell me the currency for the test site. I haven't assumed one.
3. **Accounts.** Sign-in uses Clerk and hosting uses Cloudflare. Both need an account, and signing up for a paid service is a stop for you. Options: (a) free plans only, you sign up, and I wire the keys through the secrets checklist **(recommended)**; (b) a paid plan now; (c) another sign-in provider. Do you already have either account?

## Done means

A step is done when all of this is true, and not before:

- every `auto` acceptance check has a passing test that carries its ID;
- CI is green on the merged commit, and the lane's reviews passed on that same commit;
- it's merged to main, live on the test site, and the smoke test passed;
- its try line is on the "To try" list in `docs/state.md`.

A pass is done when every one of its steps is done.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Flow | Re-plan |
|---|---|---|---|---|---|---|
|  |  |  |  |  | <!-- steps merged · median hours from pull request to merge · longest gap between merges --> |  |

## Debt

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

## After the MVP: the hourglass

<!-- One row per layer. Each layer: new features (each in thin) plus a pass on what's already there (the core every layer). Plan one layer at a time; the gate runs between layers. -->

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | To plan when the MVP is complete on the test site | core | |

## Build order

- The skeleton :: Open the test URL: the starter page loads
- Sign in with Google :: Click Continue with Google and pick your account: the page says Signed in as your name
- See your household :: Open /household: the household's name and its two members show
- See the list :: Open /list: the three seeded items show, each with who added it
- Add an item :: Type "milk" in the box at the top and press Enter: it shows at the top of the list
- Tick an item off :: Click the box next to "milk": it's struck through
- See a flatmate's tick :: Tick "milk" in a second browser: the first browser shows it struck through within 5 seconds
- Sign out :: Click Sign out: you land on the sign-in page, and signing in again brings you back
- Rename the household :: Type a new name on /household and press Save: the new name shows at once
- Add a spend :: Type 12.50 under This month and press Add: the spend shows with you as the payer
- See who owes whom :: After a spend of 12.50 by you this month, the Split page says your flatmate owes you 6.25
