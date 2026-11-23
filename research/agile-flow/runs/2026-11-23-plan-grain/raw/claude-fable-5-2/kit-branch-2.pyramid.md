# Tracer-bullet pyramid

Planned 2026-11-23 from `docs/mvp.md`, `docs/design.md` and the wireframes approved in decision 3. Nothing is built yet.

## Slice 0: the skeleton

Apply the `stack-tanstack-start` pack. Don't hand-build what it ships.

- [ ] The app runs locally, and every command in the check contract works
- [ ] CI runs every check on every pull request, plus the secret scan, the agent-file guard and the issue-link check
- [ ] Boundary check on, with the modules `list`, `household`, `split`
- [ ] The design tokens from `docs/design.md` applied to the shadcn/ui theme
- [ ] The example notes module removed once the generators are proven
- [ ] Keys wired through the `secrets` checklist (Clerk, Cloudflare)
- [ ] GitHub set up with the person's yes (`setup-github.mjs`, dry run first)
- [ ] Main deploys to test. Test URL: 
- [ ] A preview per pull request
- [ ] Production shows "Coming soon" and stays that way
- [ ] Test URL and working commands written into `AGENTS.md`

## Slices

Only slices the core can't work without. Each passed "does the core work without it?": the list needs to know who you are (Sign-in) and whose list it is (Household). Cost split is half of the MVP's "done when".

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items, tick and untick them, and see a flatmate's tick within 5 seconds without a reload |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Make a household, and bring a flatmate in with an invite link |
| Cost split | support | Type in what a shop cost and see who owes whom this month |

## Shared design

Builders follow this. It starts from `docs/design.md` and adds only what the approved screens need. The first step that touches a table updates `docs/design.md` to match.

**Schema.** Every table also gets the skeleton's standard columns (ID, created and updated times in UTC).

| Table | Columns | Added by step | Notes |
|---|---|---|---|
| `households` | name | 3 | The ID is random and unguessable. In pass 1 it is also the invite code |
| `members` | household_id, user_id, name, email | 3 | `user_id` is the Clerk user ID, unique: one household per person. Name and email are copied from Clerk when the person joins, so "who added each" needs no Clerk call. This is the personal data the floor names |
| `items` | household_id, name, added_by, ticked_at | 4 | `ticked_at` empty means unticked. Sorted newest first |
| `spends` | household_id, paid_by, amount_cents, currency, spent_on | 8 | `spent_on` is a calendar date, not an instant. One currency for the whole app in pass 1, set in config |

**Routes.** `/` (Sign in), `/household`, `/join/$householdId`, `/list`, `/split`. Shop mode (`/list/shop`) comes in pass 2.

**Server functions.** Each goes route → service → repository, inside its own module.

| Module | Function | Step |
|---|---|---|
| `household` | `createHousehold(name)`, `getMyHousehold()` (name, members, invite link) | 3 |
| `household` | `joinHousehold(householdId)` | 7 |
| `list` | `getItems()`, `addItem(name)` | 4 |
| `list` | `setTicked(itemId, ticked)` | 5 (tick), 10 (untick) |
| `split` | `addSpend(amount, spentOn)`, `getMonth()` (this month's spends) | 8 |
| `split` | `getMonth()` also gives each member's balance and who pays whom | 9 |

**Access.** No function takes a household ID from the browser, except `joinHousehold`. Each one asks `check()` for the signed-in person's household and reads only that. `check()` and the membership lookup live in shared code, so `list` and `split` never import `household`. A signed-in person with no household is sent to `/household`.

**Live updates.** The list asks the server again every 5 seconds, only while the tab is visible. Four flatmates with the list open an hour a day is about 3,000 requests, well inside the Workers free tier.

**Split rule.** This month's total, divided evenly among the current members, in whole cents. Leftover cents stay with whoever paid. "Who pays whom" pairs the person who owes most with the person owed most, and repeats.

**Seed.** Step 3 adds the seed script and two test users, each in their own household with a few items. `qa` uses them to check that one can't read the other's list or spends.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates share one live list and see who owes whom | slice 0, then every MVP slice | **Shared list:** add, tick, untick, a flatmate's tick shows in 5 seconds. **Sign-in:** Google in and out. **Household:** make one, join by link. **Cost split:** add a spend, see the even split | building |
| 2 Real | The list is good enough to shop with, and the floor is in | Shared list, Household, Cost split | **Shared list:** Shop mode, remove an item, clear the ticked ones, the designed loading and error states, name rules (blank, duplicate, too long). **Household:** leave a household and have your name and email removed, an invite link that can be reset, a clear message when you're already in a household. **Cost split:** fix or remove a spend, look at an earlier month, see who paid what | outline |
| 3 Ready | MVP complete on the test site | Shared list, then the whole app | **Shared list:** a tick shows at once on your own screen and faster than 5 seconds on the others' (how: `research` at the gate), and it copes with a weak signal in the shop. **Whole app:** speed, a11y, SEO, the launch checklist | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: steps

Pass 1. One step is one issue and one pull request.

The riskiest idea is two signed-in people seeing one household's list change live, so its path goes first: 1 → 2 → 3 → 4 → 5 → 6. Once step 3 is in, steps 4, 7 and 8 can be built side by side.

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | The skeleton | slice 0 | Open the test URL: the starter page loads | 5 · sets up the app, CI and the test deploy | |
| 2 | Sign in with Google | Sign-in | Open the test URL and press Continue with Google: you're signed in and see your name | 3 | 1 |
| 3 | Make a household | Household | Sign in, type "Flat 4" and press Make household: the Household screen shows "Flat 4" with you as its one member | 5 · the first tables, the seed script, the two test users and the shared access check ride with it | 2 |
| 4 | Add an item | Shared list | Open the list, type "milk" and press Enter: it shows at the top with your name beside it | 4 | 3 |
| 5 | Tick an item off | Shared list | Click the box next to "milk": it's struck through, and still is after a reload | 2 | 4 |
| 6 | See a flatmate's tick live | Shared list | Open the list in two browsers and tick "milk" in one: the other strikes it through within 5 seconds, with no reload | 3 | 5 |
| 7 | Join from an invite link | Household | Copy the invite link on the Household screen and open it in a second browser signed in as someone else: both of you are listed as members | 4 | 3 |
| 8 | Add a spend | Cost split | Open Split, type 40.00 with today's date and press Add: it shows under this month's spends with your name | 4 | 3 |
| 9 | See who owes whom | Cost split | With two members and one spend of 40.00, open Split: it says your flatmate owes you 20.00 | 3 | 7, 8 |
| 10 | Untick an item | Shared list | Click the box next to a ticked "milk": the strike-through goes away | 1 | 5 |
| 11 | See the empty list | Shared list | Make a new household and open the list: it says nothing is on the list yet and points you at the add box | 2 | 4 |
| 12 | Sign out | Sign-in | Press Sign out in the menu: you're back on the Sign in screen, and /list sends you there too | 1 | 2 |

Left for pass 2 on purpose: Shop mode, removing items, leaving a household, changing a spend, and the designed loading and error states. Until then a failure shows the skeleton's standard error state with its reference ID, never a bare "Error".

Checked 2026-11-23 with `check-plan.mjs`: 12 steps, 4 slices (2.8 per slice), median size 3, biggest 5, 0 errors, 0 warnings.

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

Planned one layer at a time, at the gate after pass 3.

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (an idea in `docs/features.md`, not decided) | core |  |

## Build order

- The skeleton :: Open the test URL: the starter page loads
- Sign in with Google :: Open the test URL and press Continue with Google: you're signed in and see your name
- Make a household :: Sign in, type "Flat 4" and press Make household: the Household screen shows "Flat 4" with you as its one member
- Add an item :: Open the list, type "milk" and press Enter: it shows at the top with your name beside it
- Tick an item off :: Click the box next to "milk": it's struck through, and still is after a reload
- See a flatmate's tick live :: Open the list in two browsers and tick "milk" in one: the other strikes it through within 5 seconds, with no reload
- Join from an invite link :: Copy the invite link on the Household screen and open it in a second browser signed in as someone else: both of you are listed as members
- Add a spend :: Open Split, type 40.00 with today's date and press Add: it shows under this month's spends with your name
- See who owes whom :: With two members and one spend of 40.00, open Split: it says your flatmate owes you 20.00
- Untick an item :: Click the box next to a ticked "milk": the strike-through goes away
- See the empty list :: Make a new household and open the list: it says nothing is on the list yet and points you at the add box
- Sign out :: Press Sign out in the menu: you're back on the Sign in screen, and /list sends you there too
