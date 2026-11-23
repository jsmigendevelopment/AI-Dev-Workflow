# Tracer-bullet pyramid

Planned on: the model the person has open (decision 5). Wireframes approved (decision 3, hash matches `docs/wireframes/index.html`).

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: 
- [ ] A preview per pull request (if the host offers one)

Nothing reaches the test site until the Cloudflare and Clerk accounts and keys exist. See "Accounts and keys" below.

## Slices

Only slices the core can't work without. Role: core, support, or insisted (a non-core must the person kept; pass 1 or 2 only). A slice is a column of the pyramid. Each pass cuts it into steps, below.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items to a household's list and tick them off; a flatmate sees a tick within 6 seconds |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Make a household, invite a flatmate by link, and keep other households out |
| Cost split | support | Add a spend and see who owes whom, split evenly |

Test each slice: does the core work without it? The core needs a signed-in person in a household (sign-in and household), so both stay. The cost split is in the MVP, so it stays too.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. More than 3 passes needs a `decisions.md` row; never more than 4.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates share a live list and split a month | slice 0, then all four slices | Shared list: add, tick, see ticks live, empty and error and loading states. Sign-in: sign in and out. Household: make, invite, join, keep others out. Cost split: add a spend, see who owes whom, split evenly | building |
| 2 Real | The core works properly while shopping; the floor is complete | Shared list (core), Household, Cost split | Shared list: shop mode (big tick boxes, unticked first). Household: leave a household, which removes the person's stored name. Cost split: exact cents, currency rules, and the Split screen's empty and error states | outline |
| 3 Ready | MVP complete on the test site (not launch) | core, then the whole app | Shared list: live push instead of polling. Speed, accessibility, SEO and the launch checklist for every screen | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

The MVP table's "Passes planned" column is read as the passes in which a slice has work: Sign-in 1, Household 1 and 2, Cost split 1 and 2, Shared list 1 to 3. Sign-in has no pass 2 work, so the "leave a household" floor item sits with Household in pass 2. Confirm this reading (see Open questions).

## Current pass: steps

<!-- Only the pass marked building. One row per step, in build order. One step is one issue and one pull request.
     Try it: what the person does on the test site, and what they see. No try line, no step.
     Size: the issue's complexity, 1 to 10. 4 or under is thin. A 5 to 7 says why it can't be cut: "5 · <reason>". At most one step in three.
     After: the numbers of the steps that must merge first. Empty when none.
     Check it: node .agents/skills/pyramid/scripts/check-plan.mjs docs/pyramid.md -->

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | The skeleton | slice 0 | Open the test URL: the starter page loads | 5 · sets up the app, CI, the error system and the test deploy | |
| 2 | Sign in with Google | Sign-in | Click Continue with Google and sign in: the Household page opens with a box to make a household | 4 | 1 |
| 3 | Make a household | Household | Type a name and press Make: the household shows with you as its only member | 4 | 2 |
| 4 | Show the invite link | Household | Press Copy invite link: it says Copied, and the link is on your clipboard | 2 | 3 |
| 5 | Join from an invite link | Household | Open the invite link in a second browser, signed in as someone else: both names show under Members | 4 | 4, 2 |
| 6 | See the empty list | Shared list | Open the List page of a new household: it says the list is empty and shows the add box at the top | 5 · first table (items), its seed script and two test users | 3 |
| 7 | Add an item | Shared list | Type milk in the add box and press Enter: it shows at the top with your name beside it | 3 | 6 |
| 8 | Tick an item off | Shared list | Click the box next to milk: it turns into a struck-through line | 2 | 7 |
| 9 | See a flatmate's tick | Shared list | Tick milk in one browser: in a second browser, signed in as a flatmate, it shows struck through within 6 seconds, with no reload | 3 | 8, 5 |
| 10 | Show the list's error state | Shared list | Turn off the network and wait: the list says it can't load, with a Try again button and a reference ID | 2 | 6 |
| 11 | Show the list's loading state | Shared list | Open the List page on a slow connection: a Loading message with a spinner shows until the items arrive | 2 | 6 |
| 12 | Keep other households out | Household | Sign in as someone outside the household and open its List page address: you see a Not found page, not its items | 3 | 6 |
| 13 | Add a spend | Cost split | Type 12.50, pick a date and press Add: the spend shows in this month's list with its date | 4 | 3 |
| 14 | Split the month evenly | Cost split | With spends from two flatmates, the Split page shows how much each one owes the other | 4 | 13, 5 |
| 15 | Sign out | Sign-in | Click Sign out: you return to the Sign in page with its one button | 2 | 2 |

Notes on the cut:

- **Sizes:** median 3, two steps above 4 (steps 1 and 6, each with a reason). Fifteen rows, so the one-in-three limit allows five.
- **Starting out:** after the skeleton, only sign-in can start. Everything else needs a signed-in person in a household. Once step 3 is in, steps 4, 6 and 13 can be built side by side.
- **Longest chain:** 7 steps (1, 2, 3, 6, 7, 8, 9).
- **Risky lane (automation: recommended, so you approve these merges):** steps 2, 3, 5, 6, 12 and 13. They touch sign-in, the first table of a slice, invite access or money. Six of fifteen merges will wait for you.
- **Step 6 seeds data:** the first slice that adds a table also adds the seed script and two test users (see "Test users").

## Pass 1 in detail

### Schema

Per `docs/design.md`, with the standard columns from the stack pack on every table. Two columns are added beyond the design, flagged as design changes to approve:

| Table | Columns | Added by step |
|---|---|---|
| households | id, name, currency, invite_token **(currency and invite_token are added; see Open questions)** | 3 |
| members | household_id, user_id, display_name **(display_name is added)** | 3 |
| items | id, household_id, name, added_by, ticked_at (UTC instant, empty until ticked) | 6 |
| spends | id, household_id, paid_by, amount_cents (whole cents), currency, spent_on (a calendar date the person picks) | 13 |

- `members` has a unique key on `user_id`: one household per person. Confirm (see Open questions).
- `amount_cents` is an integer. Money is never a decimal.
- `spent_on` is a plain date, so the month is the calendar month of that date. No time zone is needed for it.

### API

Server functions per module, as `docs/design.md` says. Each one runs `check()` first. The household comes from the URL, and the server confirms the signed-in person is a member. A household the person isn't in gets the same Not found page as one that doesn't exist.

| Function | Module | Step |
|---|---|---|
| createHousehold, getHousehold | household | 3, 4 |
| joinHousehold (by invite token) | household | 5 |
| getItems, addItem, setTicked | list | 6, 7, 8 |
| getSpends, addSpend | split | 13 |
| getBalances (each person's share and who owes whom) | split | 14 |

- The List page is `/households/:householdId/list`. The Split page is `/households/:householdId/split`.
- Feature modules don't import each other. The list and split modules check membership through the kit's shared `check()`, not by importing the household module.
- Every function returns the one error envelope from the stack pack. The error and empty states use the designed parts: icon, title, specific message, next action, reference ID.

### Live updates

- Pass 1 polls: the List page asks for items every 5 seconds while it's open. A tick reaches a flatmate within about 5 seconds plus the request time. The try line allows 6 seconds.
- Pass 3 replaces polling with live push. That's the "nice" version, after the plain one works.

### Money and time

- Each person's share of a month: total spent divided by members, rounded to whole cents. Pass 1 may be a cent off in total. Pass 2 spreads the leftover cents exactly (the rounding rule).
- Stored instants (`created_at`, `ticked_at`) are UTC.

### Designed states

- **List:** empty (step 6), error (step 10), loading (step 11). Its wireframe is approved.
- **Household and Split:** their empty and error states are not in the approved wireframes. Before step 13 is built, run `wireframes` for the Split empty and error states, and get approval. Builders don't invent them.

### Test users

- Three test accounts in the Clerk test environment: two flatmates in one household, and one outsider for step 12. Seeded by the step 6 seed script. The person makes the Clerk accounts (the `secrets` checklist), and nothing here touches production.

### Accounts and keys (the person's job)

- Needed before step 1's test deploy and step 2's sign-in: a Cloudflare account and a Clerk app. Both have free tiers. Signing up is the person's call, so the plan doesn't start it.
- Until they're set, the test URL can't go live. Building continues; nothing is visible on the test site.

### Personal data (floor)

- Pass 1 stores the person's display name only, in `members`. The email stays with Clerk. This narrows the default "name and email" in `docs/features.md`. Confirm it.
- Leaving a household (pass 2) removes the stored name.

### Choices made in this plan (confirm any you don't want)

1. Shop mode waits for pass 2. Pass 1 uses the normal list with tick boxes, and that's a tracer through the list.
2. Leaving a household waits for pass 2 (the floor item, with Household).
3. Polling every 5 seconds in pass 1; live push in pass 3.
4. Household and invite details are in the schema as above.

## Done means

A step is done when all of this is true, and not before:

- every `auto` acceptance check has a passing test that carries its ID;
- CI is green on the merged commit, and the lane's reviews passed on that same commit;
- it's merged to main, live on the test site, and the smoke test passed;
- its try line is on the "To try" list in `docs/state.md`.

A pass is done when every one of its steps is done.

## Open questions

Each has a recommended answer. Settle the money and taste ones first. Nothing is built on them until settled.

1. **Money (currency).** Which currency do the spends use? Options: (a) one currency per household, chosen when it's made; (b) a currency picked on each spend; (c) one fixed currency for the whole app. **Recommended: (a).** It's the simplest for four flatmates, and it lets the split work without conversion.
2. **Scope (mid-month joins).** When someone joins or leaves in the middle of a month, which spends do they share? Options: (a) all spends in the month, split among whoever is a member at month end; (b) only spends added after they joined; (c) they're not counted until the next month. **Recommended: (b).** It matches "who lives here now" and keeps the rule to one line.
3. **Keys and accounts.** Set up the Cloudflare and Clerk accounts now, or later? Options: (a) now, about 10 minutes, with the `secrets` checklist; (b) later, and the test site stays empty until then; (c) you do it yourself with `pnpm connect`. **Recommended: (a).** Nothing shows on the test site until they exist.

## After the MVP: the hourglass

<!-- One row per layer. Each layer: new features (each in thin) plus a pass on what's already there (the core every layer). Plan one layer at a time; the gate runs between layers. -->

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | not planned yet | core | |

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Flow | Re-plan |
|---|---|---|---|---|---|---|
|  |  |  |  |  | <!-- steps merged · median hours from pull request to merge · longest gap between merges --> |  |

## Debt

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

## Build order

- Skeleton: the app, checks, CI and test deploy :: Open the test URL: the starter page loads
- Sign in with Google :: Click Continue with Google and sign in: the Household page opens with a box to make a household
- Make a household :: Type a name and press Make: the household shows with you as its only member
- Show the invite link :: Press Copy invite link: it says Copied, and the link is on your clipboard
- Join from an invite link :: Open the invite link in a second browser, signed in as someone else: both names show under Members
- See the empty list :: Open the List page of a new household: it says the list is empty and shows the add box at the top
- Add an item :: Type milk in the add box and press Enter: it shows at the top with your name beside it
- Tick an item off :: Click the box next to milk: it turns into a struck-through line
- See a flatmate's tick :: Tick milk in one browser: in a second browser, signed in as a flatmate, it shows struck through within 6 seconds, with no reload
- Show the list's error state :: Turn off the network and wait: the list says it can't load, with a Try again button and a reference ID
- Show the list's loading state :: Open the List page on a slow connection: a Loading message with a spinner shows until the items arrive
- Keep other households out :: Sign in as someone outside the household and open its List page address: you see a Not found page, not its items
- Add a spend :: Type 12.50, pick a date and press Add: the spend shows in this month's list with its date
- Split the month evenly :: With spends from two flatmates, the Split page shows how much each one owes the other
- Sign out :: Click Sign out: you return to the Sign in page with its one button
