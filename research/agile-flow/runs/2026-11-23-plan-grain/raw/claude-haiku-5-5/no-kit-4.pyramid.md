# Pyramid: build plan

Planned on claude-haiku-5-5 (decision 5). Nothing is built yet. This file is the plan for the first pass.

## What "pass 1" means

The MVP table gives each slice a number of passes: sign-in 1, household 2, cost split 2, shared list 3. Pass 1 is the thinnest cut that touches every slice. Each slice gets only its first pass, and no later-pass work sneaks in.

**Pass 1 is done when:** a signed-in flatmate can make a household, add items and tick them, and add a spend. A second member of the same household sees the list change within about 5 seconds, from polling.

## Slice 0: set-up

The loop sets this up (state.md). It is not a pass of any slice.

- TanStack Start on Cloudflare Workers, D1 with Drizzle, Clerk, shadcn/ui.
- Vitest for unit tests, Playwright for end-to-end.
- A placeholder home page, so the test site has something to load.

## Pass 1, slice by slice

**Sign-in (pass 1 of 1, complete in this pass).** One button, Continue with Google, on the Sign in screen. Sign-out. Server functions read the signed-in user from the Clerk session. Auth is a risky-lane change, so it waits for the person's merge.

**Household (pass 1 of 2).** Make a household with a name. The Household screen lists its members. Invite link is pass 2. Leaving a household and deleting the personal data that goes with it is also pass 2, and it must land before the MVP is done (features.md floor checklist).

**Shared list (pass 1 of 3).** The List screen shows items with who added each one, a tick box, and an add box at the top. Empty, loading and error states are all present. Live updates are polling every 5 seconds (design.md). Only members of the household see or change the list. Shop mode and the tick-by-tick live feel are later passes.

**Cost split (pass 1 of 2).** The Split screen has an add-a-spend form (who paid, amount in cents, currency, date) and this month's spends. Who-owes-whom and the even split are pass 2.

## Shared pieces

- **Membership guard.** One function that takes the signed-in user and a household, and returns the household or rejects. Every list and split server function calls it. It sits in a shared core location, not inside a feature module, because the architecture rule says modules don't import each other. Risky lane.
- **Schema.** `households`, `members`, `items`, `spends`, as in design.md. Money is an integer in `amount_cents`, never a float.
- **Route, then service, then repository** in each module (architecture.md).

## Order and why

1. Slice 0 first, because nothing runs without it.
2. Schema next. Every later issue reads or writes these tables.
3. Sign-in before the guard, because the guard needs a user.
4. Guard before any route that reads household data, so no route ships without a membership check.
5. Household before list and split, because both need a household to belong to.
6. List and split are independent. List goes first because it is the core of the MVP.
7. A two-member end-to-end test last, once the list and household pieces are both on the test site.

## Automation and merges

Automation is Recommended, loop on, and merges to the risky lane go to the person (stack.md). Sign-in, the membership guard and the schema are risky-lane merges and wait for the person. The rest go through the loop.

## Choices I made that you can change

- Shop mode is put in the list's later passes, not pass 1. The MVP table doesn't say which pass it's in.
- The invite link is household pass 2, matching the table's count.
- Pass 1 has no "who owes whom". The table puts the even split in cost split pass 2.
- "Test site" is not defined in the docs. I've assumed it is the site a merged change deploys to.

## Build order

- Slice 0: scaffold the app and test tools :: the placeholder home page loads on the test site
- Schema and first migration :: nothing
- Sign in with Google :: sign in with a Google account, then sign out
- Membership guard :: nothing
- Household: make one and list members :: make a household with a name and see yourself listed as its member
- Shared list: add and tick items :: add an item and tick it; a second browser shows the tick within about 5 seconds
- Cost split: add a spend :: add a spend and see it in this month's list
- Two-member end-to-end test :: nothing
