# Tracer-bullet pyramid

Planned on Haiku 5.5, as decided in `docs/decisions.md` row 5. The `pyramid` skill normally asks for the strongest tier, so the plan is worth a second read before pass 1 starts.

Status: planned, not started. Nothing is built, and no issues are open yet.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: (not yet set; the person gives it)
- [ ] A preview per pull request (if the host offers one)
- [ ] GitHub set up for the person (labels, Dependabot, secret scanning, rules on main), after a yes

## Slices

Only slices the core can't work without. Each one passes the test "does the core work without it?" The floor (sign-in, who sees what, deleting personal data) sits inside them.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items, tick them off, and see a flatmate's tick within 5 seconds |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Make a household and join it from an invite link |
| Cost split | support | Add a spend and see who owes whom, split evenly |

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. Three passes, so no `decisions.md` row is needed for more.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Works: the list, end to end | slice 0, then every MVP slice | Shared list: plainest path for add, tick, see a tick, empty and error states. Sign-in: Google and sign out. Household: make and join by link. Cost split: add a spend, split evenly. | building |
| 2 Real | Real: the household you can rely on | core + supports | Shared list: shop mode (big tick boxes, unticked first) and a loading state. Household: members list, leave (removes personal data), reset invite link. Cost split: edit and delete a spend, earlier months, the cent rule for uneven remainders. | outline |
| 3 Ready | Ready: MVP complete on the test site | core, then the whole app | Shared list: shop mode polished. Speed to the budgets in `web-performance`. Every screen to WCAG 2.2 AA (`a11y`). "Coming soon" page and launch checklist, ready for the person. Rate limit on the invite link (`web-security`). | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: pass 1, Works

### Why this cut

- Pass 1 runs one thin step through every slice, and the core gets the most steps.
- The steps are ordered so the first thing a person tries is the sign-in and the household, then the list, then the spend. The live-tick step (9) is the riskiest idea, so it comes early and right after the list works.
- Two steps are big (1 and 2). Each has a reason, and that is under one step in three.
- Every step's try line is something a person does on the test site. Set-up with nothing to see rides in step 1 (the skeleton), which is the slice 0 exception.

### Access rule (the floor), applied from step 6 on

Every list and spend request checks that the caller is a member of that household on the server. A non-member gets "Not found", not a list. Each step's acceptance checks carry this, so pass 1 doesn't ship a leak that pass 2 has to fix.

### Schema added in pass 1 (from `docs/design.md`)

Each slice adds its whole table in its first step, and later steps only use it:

- Step 4 adds `households` (id, name, invite token) and `members` (household_id, user_id). It also adds the seed script and the **two test users** (`qa` signs in as them).
- Step 6 adds `items` (household_id, name, added_by, ticked_at). It seeds the three items.
- Step 12 adds `spends` (household_id, paid_by, amount_cents, currency, spent_on). Money is in integer cents with its currency. Times are in UTC.

### Steps

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | Skeleton: app, checks, CI, test deploy and GitHub set-up | slice 0 | Open the test URL: the starter page loads | 5 · one set-up issue: app, checks, CI, deploy and the shared foundations (errors, logs, health, generators) belong together | |
| 2 | Sign in with Google | Sign-in | Click Continue with Google and sign in: the top bar shows your name | 5 · the first auth wiring: Clerk keys, sign-in and the session | 1 |
| 3 | Sign out | Sign-in | Click Sign out: you land on the sign-in page | 2 | 2 |
| 4 | Make a household | Household | Type "Flat 4" under Make a household and press Create: the page shows Flat 4 with you as its member | 4 | 2 |
| 5 | Join a household with an invite link | Household | Copy the invite link, open it in a private window, sign in: you see Flat 4 with both names | 3 | 4 |
| 6 | See the shared list | Shared list | Open the list: the three seeded items show, each with who added it | 4 | 5 |
| 7 | Add an item | Shared list | Type "milk" in the box at the top and press Enter: it shows at the top, with your name | 3 | 6 |
| 8 | Tick an item off | Shared list | Click the box next to "milk": it's struck through | 2 | 7 |
| 9 | See a flatmate's tick | Shared list | Tick milk in the second test user's window: this window shows it within 5 seconds | 3 | 8 |
| 10 | Empty list says what to do | Shared list | Open a new household's empty list: it says "No items yet. Type your first item above." | 2 | 6 |
| 11 | Show a designed error on the list | Shared list | Turn off the network and reload the list: it says "Couldn't load the list", with a reference ID and a Try again button | 3 | 6 |
| 12 | Add a spend | Cost split | Type 12.40 as the amount and press Add: it shows in this month's spends | 4 | 4 |
| 13 | See who owes whom, evenly | Cost split | With two members, Split shows the other one owes you 6.20 for the 12.40 shop | 3 | 12 |

Checked by hand: 13 steps across 4 slices (about 3 per slice). Median size 3. Two steps above 4, both with reasons, under one in three. Every "After" points to an earlier step. Slice 0 is excluded from the slice count, as the checker does. I could not run `check-plan.mjs` in this session because shell access was denied. Run `node .agents/skills/pyramid/scripts/check-plan.mjs docs/pyramid.md` before the issues are written.

### Decisions I made (recorded in `docs/decisions.md`)

- Live updates are a 5-second check through pass 2. Options are in the questions below.
- Invite links are a token on the household row, not a separate table. This keeps step 5 inside the one schema change its slice gets in pass 1.
- Step 13's split is even, to the cent. Any remainder cent goes in pass 2 with its rule.

## Questions for you

Each one has my recommended answer. Question 1 blocks step 12 only, and steps 1 to 11 can go ahead without it.

1. **Which currency do the flatmates spend in?** Recommended: store the currency on each spend, and you name it once (for example GBP). I need your answer before step 12.
2. **Which time zone should "this month" use?** Recommended: the household's time zone, set when it's made. Otherwise a shop at 23:30 on the 31st lands in the wrong month. I need your answer before step 12.
3. **How fast should a flatmate's tick show?** Options, with trade-offs:
   - **A. Check every 5 seconds (recommended for passes 1 and 2).** Simple, cheap, and it already meets "without a reload". The cost is up to a 5-second delay.
   - **B. Push it live now** with a real-time connection on Cloudflare (Durable Objects). Instant, but more code, and it may need a paid Cloudflare plan. Spending money is your call.
   - **C. Use a hosted real-time service** (for example Ably or Pusher). Fast to add, a free tier to start, but a second company holds your data and needs a sign-up. A sign-up is your call.

   I recommend A, and revisiting B at pass 3 only if the 5-second delay feels slow when you try it.

Question for the gate before pass 2 (not needed now): **who may edit or delete a spend?** Options: the payer only (recommended), any member, or nobody after it's entered.

## Set up for you before step 2

These need your account, so I won't do them. Each is a sign-up, which is your call:

- A Clerk account, for Google sign-in. Keys go through the `secrets` checklist, never into chat.
- A Cloudflare account, for hosting and D1.
- `gh auth login` for the GitHub set-up in step 1.

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

Nothing yet.

## After the MVP: the hourglass

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (from `docs/features.md`, later) | core | Not planned yet. Plan it after MVP complete. |

## Build order

- Skeleton: app, checks, CI, test deploy and GitHub set-up :: Open the test URL: the starter page loads
- Sign in with Google :: Click Continue with Google and sign in: the top bar shows your name
- Sign out :: Click Sign out: you land on the sign-in page
- Make a household :: Type "Flat 4" under Make a household and press Create: the page shows Flat 4 with you as its member
- Join a household with an invite link :: Copy the invite link, open it in a private window, sign in: you see Flat 4 with both names
- See the shared list :: Open the list: the three seeded items show, each with who added it
- Add an item :: Type "milk" in the box at the top and press Enter: it shows at the top, with your name
- Tick an item off :: Click the box next to "milk": it's struck through
- See a flatmate's tick :: Tick milk in the second test user's window: this window shows it within 5 seconds
- Empty list says what to do :: Open a new household's empty list: it says "No items yet. Type your first item above."
- Show a designed error on the list :: Turn off the network and reload the list: it says "Couldn't load the list", with a reference ID and a Try again button
- Add a spend :: Type 12.40 as the amount and press Add: it shows in this month's spends
- See who owes whom, evenly :: With two members, Split shows the other one owes you 6.20 for the 12.40 shop
