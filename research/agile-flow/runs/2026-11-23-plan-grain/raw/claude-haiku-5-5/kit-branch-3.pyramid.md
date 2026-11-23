# Tracer-bullet pyramid

Planned on Haiku 5.5, as decided on 2026-11-22 (decision 5). Status: **planning**. Nothing is built yet.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL:
- [ ] A preview per pull request (if the host offers one)

Set up in slice 0, from the stack pack (`stack-tanstack-start`): error system with request IDs and structured logs, health endpoint, `/api/v1`, UTC times, money in integer minor units, ID strategy and standard columns, audit log, feature flags, `object_action` event names, breakpoints and type scale in the tokens, per-module `copy.ts`, and generators for module, route, section and component.

Needs the person, before any deploy (see Questions below): a Cloudflare account and a Clerk app. Both are signups, so they stop for the person. Production stays on "Coming soon" until the person decides to launch.

## Slices

The MVP's core, and the supporting slices the core can't work without. Test: the core works without a slice? Then it isn't here.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items to the household's list and tick them off; a flatmate's tick shows within 5 seconds |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Make a household and invite a flatmate with a link |
| Cost split | support | Add a spend and see who owes whom for the month |

Reading the MVP table: the "Passes planned" number is the last pass in which a slice gets new work. Pass 1 still touches every slice, as the method requires.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | The shared list works end to end for two flatmates | slice 0, then every MVP slice | Shared list: add, tick and a 5-second refresh. Sign-in: Google in and out. Household: make and join. Cost split: add a spend and the even split. | building |
| 2 Real | The list and split work the way a flat uses them | core + supports | Shared list: shop mode (big tick boxes, unticked first), and empty, error and loading states. Household: leave the household, which removes personal data (floor). Cost split: edit and delete a spend, and the month's view. | outline |
| 3 Ready | MVP complete on the test site | core, then the whole app | Shared list: live push instead of polling, and speed. Whole app: accessibility, SEO, performance budgets and the launch checklist. Launch stays the person's call. | outline |

Pass 3 done = **MVP complete on the test site.** Not launch.

## Current pass: steps

Pass 1, in build order. One step is one issue and one pull request.

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | Skeleton: the test site is live | slice 0 | Open the test URL: a page says the app is running | 6 · stack pack, CI, test deploy and secrets come as one set-up | |
| 2 | Sign in with Google | Sign-in | Click Continue with Google: you land on the Household page with your name shown | 4 | 1 |
| 3 | Sign out | Sign-in | Click Sign out: you go back to the Sign in page, and opening the Household page sends you there | 2 | 2 |
| 4 | Make a household | Household | Type "Flat 4" on the Household page and press Make: it shows "Flat 4" with you as the only member | 3 | 2 |
| 5 | Join by invite link | Household | Copy the invite link and open it signed in as a second person: both names show under "Flat 4" | 3 | 4 |
| 6 | See the shared list | Shared list | Open the List page: the three starter items show, each with who added it | 4 | 4 |
| 7 | Add an item | Shared list | Type "milk" and press Enter: it shows at the top with your name | 2 | 6 |
| 8 | Tick an item off | Shared list | Click the box next to "milk": it's struck through and shows the time | 2 | 7 |
| 9 | See a flatmate's tick | Shared list | Tick an item in a second window signed in as a flatmate: your window shows it within 5 seconds | 3 | 5, 8 |
| 10 | Add a spend | Cost split | Enter an amount and press Add on the Split page: it shows in this month's spends with your name | 3 | 4 |
| 11 | See who owes whom | Cost split | With one spend of 12 by you and one of 6 by a flatmate, the page says the flatmate owes you 3 | 4 | 5, 10 |

Checks on this cut: 11 steps for 4 feature slices (2 to 4 each). One step, the skeleton, is above 4, with its reason written. Median size 3. Build order is set by the After column.

Only the skeleton can start first, and sign-in gates almost everything after it. That is the honest shape of a tracer-bullet first pass: the longest chain is 8 steps. Once sign-in (step 2) is in, steps 3 and 4 can be built side by side.

## Pass 1: what rides in each step

These aren't separate steps. They are part of the step named.

- **Step 1:** stack pack applied, every check command works, CI on pull requests, test deploy. GitHub set-up through `name`'s `setup-github` script after the person says yes. Secrets through the `secrets` checklist; values never in chat.
- **Steps 2 and 3:** Clerk wiring, a route guard for the Household and List and Split pages. Sign-in lives in the shared `core` area, not in a feature module (see Shared pieces).
- **Step 4:** schema for `households` and `members` (below). The seed script and two test users land here, the first step that adds a table, so `qa` can always sign in as two people.
- **Step 5:** the invite link, and joining it. Joining creates a `members` row only.
- **Step 6:** schema for `items`. Seeds three starter items. The access rule is in this step: only members of the household see its list. A stranger opening the list link sees "Not in your household", never the items. This is the floor rule, so it can't wait.
- **Steps 7 and 8:** the add and tick services check membership through `check()`.
- **Step 9:** polling every 5 seconds (design decision). No push in pass 1.
- **Step 10:** schema for `spends`. Amounts are integer minor units with a currency column. The currency choice is open (Question 1); until then the step uses the currency stored on the household.
- **Step 11:** the even split, one rule only. Rounding of an odd penny is open (Question 3). Until answered, the split rounds to the nearest minor unit and the remainder goes to the payer.

## Schema

Standard columns (ID strategy, UTC timestamps) come from the skeleton's conventions. Checked against them in step 1.

| Table | Added in step | Columns |
|---|---|---|
| `households` | 4 | id, name |
| `members` | 4 | household_id, user_id (Clerk user ID). Key: household_id + user_id |
| `items` | 6 | id, household_id, name, added_by, ticked_at (UTC, empty until ticked) |
| `spends` | 10 | id, household_id, paid_by, amount_cents, currency, spent_on (a calendar date) |

Each slice's first step adds its whole table. Later steps in that slice use it without changing it.

## API

Server functions per module, each going route → service → repository. Services call `check()` for household membership before they read or write.

- **household:** make, join by invite, list members. Leave comes in pass 2.
- **list:** list items, add, tick.
- **split:** list this month's spends, add a spend, balance (who owes whom).
- **sign-in:** no endpoint of its own; Clerk's session is read in `core`.

## Shared pieces

Feature modules can't import each other, and both the list and split need "who is this person, and which household are they in". So that goes in a shared `core` area: the session, `check()` and the error shape. Recommended default, not yet written to `docs/decisions.md`. It goes there once the person agrees.

## Done means

A step is done when all of this is true, and not before:

- every `auto` acceptance check has a passing test that carries its ID;
- CI is green on the merged commit, and the lane's reviews passed on that same commit;
- it's merged to main, live on the test site, and the smoke test passed;
- its try line is on the "To try" list in `docs/state.md`.

A pass is done when every one of its steps is done.

## Pass gate

Between passes: a fresh audit, then cleanup, then the person tries it, then a re-plan here. Pass 2 doesn't start until pass 1's core works. Pass 2 is outlined above and cut into steps only at pass 1's gate.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Flow | Re-plan |
|---|---|---|---|---|---|---|
|  |  |  |  |  | <!-- steps merged · median hours from pull request to merge · longest gap between merges --> |  |

## Debt

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

## After the MVP: the hourglass

Not planned yet. "Recipes" in `docs/features.md` is the first candidate for layer 1, after the person has tried pass 3.

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 |  | core |  |

## Questions for you

Three now. Each has my recommendation. Question 1 changes step 10 (spends), question 2 changes step 4 (households and members), and question 3 changes step 11 (the split). Each answer is needed before its step is built; the other steps can go ahead.

1. **Currency.** Should one household use one currency for every spend?
   - (a) One currency per household, chosen when it's made. **Recommended:** simplest, and it matches a flat that shops in one country.
   - (b) Each spend picks its own currency. More flexible, but the split needs exchange rates. Not for the MVP.
   - (c) Fixed to one currency for the whole app. Simplest of all, but it rules out a flat abroad.
2. **Personal data.** Should we keep each flatmate's email, or only their name?
   - (a) Name only, from Google, and the Clerk ID. **Recommended:** less to delete when someone leaves.
   - (b) Name and email. Lets us send invites by email later, but more personal data to remove on leave.
   - (c) Clerk ID only, and read the name from Clerk each time. Least stored, but a Clerk outage shows blanks.
3. **The odd penny.** When a spend doesn't split evenly, who gets the extra penny?
   - (a) The person who paid. **Recommended:** simple to explain and stable across months.
   - (b) The flatmate who owes the least, to balance out over time. Fairer, harder to explain.
   - (c) Round every share to the nearest pound or euro. Not the minor unit, so it loses money.

## Build order

- Skeleton: the test site is live :: Open the test URL: a page says the app is running
- Sign in with Google :: Click Continue with Google: you land on the Household page with your name shown
- Sign out :: Click Sign out: you go back to the Sign in page, and opening the Household page sends you there
- Make a household :: Type "Flat 4" on the Household page and press Make: it shows "Flat 4" with you as the only member
- Join by invite link :: Copy the invite link and open it signed in as a second person: both names show under "Flat 4"
- See the shared list :: Open the List page: the three starter items show, each with who added it
- Add an item :: Type "milk" and press Enter: it shows at the top with your name
- Tick an item off :: Click the box next to "milk": it's struck through and shows the time
- See a flatmate's tick :: Tick an item in a second window signed in as a flatmate: your window shows it within 5 seconds
- Add a spend :: Enter an amount and press Add on the Split page: it shows in this month's spends with your name
- See who owes whom :: With one spend of 12 by you and one of 6 by a flatmate, the page says the flatmate owes you 3
