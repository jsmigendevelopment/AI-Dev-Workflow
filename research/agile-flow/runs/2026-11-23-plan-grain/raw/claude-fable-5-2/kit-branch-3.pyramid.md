# Tracer-bullet pyramid

Planned 2026-11-23. Nothing is built yet. The loop sets up slice 0 later.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: 
- [ ] A preview per pull request (if the host offers one)

Slice 0 applies the `stack-tanstack-start` pack. It also wires the Clerk and Cloudflare keys through the `secrets` checklist and sets up GitHub. Both need the person, so step 1 opens with a "Setup step for you".

## Slices

Only slices the core can't work without. Role: core, support, or insisted (a non-core must the person kept; pass 1 or 2 only). A slice is a column of the pyramid. Each pass cuts it into steps, below.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | See their household's list, add an item, tick one off, and see a flatmate's tick within 5 seconds |
| Sign-in | support | Sign in with Google, sign out, and get sent to sign-in when signed out |
| Household | support | Make a household, copy its invite link, and join one from a link |
| Cost split | support | See this month's spends, add one, and see who owes whom on an even split |

All four pass "does the core work without it?" for this MVP: the list is per household, a household needs sign-in, and the even split is "Done when" number 2 in `docs/mvp.md`.

## What the slices share

Builders follow `docs/design.md`. This adds only what pass 1 needs on top of it.

**Routes.** `/sign-in`, `/household`, `/list` (the home page once signed in), `/split`. `/join/<household id>` is the invite link.

**Schema.** Every table also gets the skeleton's standard columns (ID, created and updated times in UTC).

- `items` (household_id, name, added_by, ticked_at). `added_by` may be empty in pass 1, because seeded items have no author. `ticked_at` empty means unticked.
- `households` (id, name) and `members` (household_id, user_id). One row per person per household. `user_id` is the Clerk user ID. Names shown on screen come from Clerk; no user table in pass 1.
- `spends` (household_id, paid_by, amount_cents, currency, spent_on). `spent_on` is a calendar date. "This month" is the month of today's date in UTC in pass 1.
- **One migration per slice:** `items` in step 2, `households` with `members` in step 9, `spends` in step 14. Each is a risky-lane merge that waits for the person.
- `items.household_id` has no database-level link to `households` in pass 1, because `items` lands first. Step 2 seeds its items under a fixed seed household ID, and step 9 seeds the household row with that ID. Access goes through `check()`.
- **Seed and test users:** step 2 adds the seed script and two Clerk test users. From step 9 the seed puts user A in "Seed flat" and user B in "Other flat", so `qa` can check that one can't see the other's data.

**Server functions.** Each module goes route → service → repository. Modules don't import each other.

- `list`: `getItems()`, `addItem(name)`, `setTicked(itemId, ticked)`. The list screen asks `getItems()` again every 5 seconds while the tab is visible.
- `household`: `getMyHousehold()`, `createHousehold(name)`, `joinHousehold(householdId)`.
- `split`: `getMonth()` returns the spends and who owes whom; `addSpend(amountCents, spentOn)`.
- Who the caller is and which household they're in comes from the session and `check()`, never from the request. The `list` and `split` modules get the household through `check()`, not by importing `household`.

**The split rule, pass 1.** Add up the month. Each member's share is the total divided by the number of members, in whole cents. Leftover cents stay with whoever paid most. Each person who paid less than their share owes the difference; show it as "A owes B 20.00".

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. More than 3 passes needs a `decisions.md` row; never more than 4.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates share one list and see the month's split | slice 0, then every MVP slice | **Shared list:** see, add, tick, see a flatmate's tick by asking every 5 seconds. **Sign-in:** Google in and out, pages closed to signed-out visitors (its only pass). **Household:** make, invite, join. **Cost split:** see spends, add one, who owes whom | building |
| 2 Real | The list holds up in a real shop, for a real flat | core + supports | **Shared list:** shop mode, the loading and error states, rules (no blank or repeated names), removing items. **Household:** leave a household and take your data with you, an invite link that can be reset, one household per person. **Cost split:** other months, fix or remove a spend, the fewest payments to settle up | outline |
| 3 Ready | MVP complete on the test site | core, then the whole app | **Shared list:** ticks show at once (live push instead of asking every 5 seconds), holds up on a weak signal in the shop. **Whole app:** speed, a11y, SEO, launch checklist | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: steps

<!-- Only the pass marked building. One row per step, in build order. One step is one issue and one pull request.
     Try it: what the person does on the test site, and what they see. No try line, no step.
     Size: the issue's complexity, 1 to 10. 4 or under is thin. A 5 to 7 says why it can't be cut: "5 · <reason>". At most one step in three.
     After: the numbers of the steps that must merge first. Empty when none.
     Check it: node .agents/skills/pyramid/scripts/check-plan.mjs docs/pyramid.md -->

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | The skeleton | slice 0 | Open the test URL: the starter page loads | 5 · sets up the app, CI and the test deploy | |
| 2 | See the list | Shared list | Open /list: three seeded items show, newest at the top | 4 | 1 |
| 3 | Tick an item off | Shared list | Click the box next to "milk": it's struck through, and still is after a reload. Click again: it's back | 2 | 2 |
| 4 | See a flatmate's tick | Shared list | Open /list in two browsers and tick "milk" in one: the other shows it struck through within 5 seconds, with no reload | 3 | 3 |
| 5 | Sign in with Google | Sign-in | Open /sign-in and press Continue with Google: you land on the list with your name in the corner | 3 | 1 |
| 6 | Add an item | Shared list | Type "eggs" in the box at the top and press Enter: it shows at the top of the list with your name on it | 3 | 2, 5 |
| 7 | Sign out | Sign-in | Press your name, then Sign out: you're back on the sign-in page | 1 | 5 |
| 8 | Get sent to sign in | Sign-in | Open /list in a private window: you land on the sign-in page, and after signing in you're on the list | 2 | 2, 5 |
| 9 | Make a household | Household | Open /household, type "Flat 4" and press Create: the page shows "Flat 4" with you as its only member | 4 | 5 |
| 10 | Copy the invite link | Household | On /household press Copy invite link and paste it somewhere: it's a link to the test site | 2 | 9 |
| 11 | Join from an invite link | Household | Open the invite link in a second browser, signed in as someone else: the household page lists you both | 3 | 10 |
| 12 | See only your household's list | Shared list | Add "bread", then sign in as someone from another household: their list doesn't show "bread" | 3 | 6, 9 |
| 13 | See the empty list | Shared list | Make a new household and open /list: it says the list is empty and points you at the add box | 2 | 12 |
| 14 | See this month's spends | Cost split | Open /split in the seeded household: two spends show, each with who paid, the date and the amount | 4 | 9 |
| 15 | Add a spend | Cost split | On /split type 42.50, pick today and press Add: it shows at the top of this month with your name | 3 | 14 |
| 16 | See who owes whom | Cost split | With two members and one spend of 40.00 paid by you, open /split: it says the other member owes you 20.00 | 4 | 11, 15 |

**Why this order.** Step 4 is the riskiest idea, the live tick, so it comes right after the skeleton and needs only steps 2 and 3. Sign-in (5) starts at the same time as the list (2). After step 9 the household steps, the list steps and the split steps run side by side. The longest chain is six steps.

**Notes for the `issues` skill.**

- Step 2 also brings the `items` migration, the seed script and the two test users. Until step 8, /list is open to anyone who can reach the test site. Until step 12 everyone sees the seed household's list.
- Step 6: `added_by` is the signed-in person. Before step 12 the item goes to the seed household.
- Step 9 brings the `households` and `members` migration. A person in a household sees it on /household instead of the form.
- Step 10: the link is `/join/<household id>`. IDs are long and random, but the link can't be reset until pass 2.
- Step 11: someone who opens the link signed out goes through sign-in and comes back to it.
- Step 12: the list reads and writes only the caller's household. Someone signed in with no household is sent to /household.
- Step 14 brings the `spends` migration and two seeded spends. It's scoped to the caller's household from the start.
- Step 15: the amount is typed as a decimal and stored as whole cents with the currency.
- Every step ships its screen's states to the `AGENTS.md` standard. Pass 2 reworks the list's loading and error states against the wireframes.

## Open questions

None blocks slice 0. Each has a recommended answer that the plan assumes until the person says otherwise.

1. **Which currency are spends in?** Recommended: one currency for the whole app in the MVP. Tell us which before step 15.
2. **Is shop mode fine in pass 2?** Recommended: yes. In pass 1 you tick in the normal list; the big-tick-box screen is the first step of pass 2.
3. **Is a fixed invite link fine for pass 1?** Recommended: yes. Anyone who has the link can join until pass 2 adds a reset. Only test data is at stake before launch.

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

- `items.household_id` has no database-level link to `households`. Decide at the pass 1 gate whether pass 2's list migration adds it.
- Removing an item isn't on the approved List screen. It needs a `wireframes` change and the person's approval before pass 2 cuts it.

## After the MVP: the hourglass

<!-- One row per layer. Each layer: new features (each in thin) plus a pass on what's already there (the core every layer). Plan one layer at a time; the gate runs between layers. -->

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (from `docs/features.md`), if still wanted | core |  |

## Build order

- The skeleton :: Open the test URL: the starter page loads
- See the list :: Open /list: three seeded items show, newest at the top
- Tick an item off :: Click the box next to "milk": it's struck through, and still is after a reload. Click again: it's back
- See a flatmate's tick :: Open /list in two browsers and tick "milk" in one: the other shows it struck through within 5 seconds, with no reload
- Sign in with Google :: Open /sign-in and press Continue with Google: you land on the list with your name in the corner
- Add an item :: Type "eggs" in the box at the top and press Enter: it shows at the top of the list with your name on it
- Sign out :: Press your name, then Sign out: you're back on the sign-in page
- Get sent to sign in :: Open /list in a private window: you land on the sign-in page, and after signing in you're on the list
- Make a household :: Open /household, type "Flat 4" and press Create: the page shows "Flat 4" with you as its only member
- Copy the invite link :: On /household press Copy invite link and paste it somewhere: it's a link to the test site
- Join from an invite link :: Open the invite link in a second browser, signed in as someone else: the household page lists you both
- See only your household's list :: Add "bread", then sign in as someone from another household: their list doesn't show "bread"
- See the empty list :: Make a new household and open /list: it says the list is empty and points you at the add box
- See this month's spends :: Open /split in the seeded household: two spends show, each with who paid, the date and the amount
- Add a spend :: On /split type 42.50, pick today and press Add: it shows at the top of this month with your name
- See who owes whom :: With two members and one spend of 40.00 paid by you, open /split: it says the other member owes you 20.00
