# Pyramid: plan for the first pass

Plan only. Nothing is built, and no app is set up. The loop sets up slice 0 later. Planned on claude-haiku-5-5, per decision 5.

## From the top down

1. **Vision:** four flatmates share one grocery list. Whoever shops ticks items off, and the app splits what was spent. (`vision.md`)
2. **MVP core:** the shared list that updates live while someone shops. (`mvp.md`)
3. **Slices:** shared list (3 passes), sign-in (1), household (2), cost split (2).
4. **First pass:** slice 0 (the skeleton), then pass 1 of each slice. At the end, two flatmates in one household see the same list, a tick shows for the other, and a month's spends are split evenly. Those are the two "done when" tests in `mvp.md`.
5. **Issues:** one per step below. The order is at the bottom of this file.

## What the first pass covers

In:

- Sign-in with Google, through Clerk.
- Make a household, join it by invite link, list its members.
- Membership guard: only members can read or change a household's list and spends. (Floor item in `features.md`.)
- Shared list: add items (with who added each), tick and untick, delete, empty / loading / error states. Refresh every 5 seconds.
- Spends: add a spend, see this month's spends.
- Cost split: who owes whom, with an even split.
- Leaving a household removes that person's name and email. (Floor item, default in `features.md`.)

Out, for later passes:

- Shop mode (big tick boxes). The list works in pass 1 without it.
- Instant live updates. Pass 1 polls.
- Editing items or spends, and a month picker.
- Recipes, shop suggestions, receipts by photo (not in the MVP).

## Architecture rules this plan follows

From `architecture.md`: feature modules are `list`, `household`, `split`. Each goes route → service → repository, and modules don't import each other.

So:

- The route layer resolves the signed-in user's household and checks membership. It uses a small shared session helper outside the feature modules. (My choice.)
- The route passes the household id into the `list` and `split` services.
- The route also fetches the member list from `household` and passes it to `split`, which needs it for the even split. `split` never imports `household`.

## Data

From `design.md`: `households`, `members`, `items`, `spends`. Pass 1 adds:

- `users` (Clerk user id, name, email). Needed to show who added an item and to list members by name. Not in `design.md`. Its rows are the ones deleted on leave.
- An unguessable random invite token on `households`.
- Money as integer `amount_cents`. `currency` is stored, and pass 1 accepts one currency per household (see open questions).
- When a member leaves, their `members` row goes. Items they added keep their row, with `added_by` shown as "Former flatmate".

## Issues, in order

### 1. Skeleton and test harness

TanStack Start on Cloudflare Workers, D1 with Drizzle and a first migration, Clerk installed but no page gated yet, Vitest unit test, one Playwright smoke test, deployed to the test site.

Done when: the tests pass locally and the test site shows a placeholder page.

### 2. Sign-in

The Sign in screen: one button, Continue with Google, through Clerk. Signed-out visitors to any other page are sent here. After sign-in, the person lands on the Household screen.

Done when: a Google account signs in and out, and a signed-out request to a household page is redirected.

Depends on: 1.

### 3. Household and membership guard

Make a household (name it). Copy its invite link. Open the link while signed in and join. Members are listed by name. The Household screen follows `design.md`.

Membership guard: every household server function checks the caller is a member first. A non-member gets a not-found response, not the data.

Done when: two accounts can join one household, both see the member list, and a third account gets nothing from the household's address.

Depends on: 2.

### 4. Shared list: add, tick, delete

The List screen per `design.md`: an add box at the top, items with who added each, a tick box per item, a delete control. Ticking records `ticked_at`, unticking clears it. Empty, loading and error states are all shown.

Done when: a member adds, ticks, unticks and deletes items, and a non-member gets nothing from the list's server functions. Tests cover the three states.

Depends on: 3.

### 5. Shared list: live refresh

The List screen re-fetches every 5 seconds while it is open. A tick or add by one member shows for another within about 5 seconds, with no reload.

Done when: two browser sessions in one household show each other's changes within about 5 seconds. One Playwright test covers it.

Depends on: 4.

### 6. Cost split: add a spend, list this month's spends

The Split screen per `design.md`: this month's spends, and an add-a-spend form (amount, date, who paid). Amount is stored as `amount_cents`. Date defaults to today.

Done when: spends from two accounts both appear for the month, and a non-member gets nothing.

Depends on: 3.

### 7. Cost split: who owes whom

Even split across the household's members, computed in `split` and given the member list by the route.

Math, in cents: total the month's spends (S) and the member count (n). Each member's share is S divided by n. Shares are whole cents: the first (S mod n) members, in `user_id` order, carry one extra cent. Each person's balance is what they paid minus their share. The screen lists transfers that clear the balances, largest debtor to largest creditor.

Done when: a hand-worked example with three members and an uneven total gives the same transfers as the screen. Unit tests cover the rounding case.

Depends on: 6.

### 8. Leave household and delete personal data

A "Leave household" control. On leave: the `members` row goes, the `users` row's name and email are cleared (or the row is deleted if the person is in no household), and their items show "Former flatmate". Spends they paid stay, so the split still adds up; the payer shows as "Former flatmate".

Done when: leaving removes the name and email from every screen and from the database, and a test checks it.

Depends on: 7.

## Open questions (my defaults, to confirm)

1. **Currency.** Default: one currency per household, set by the first spend. Other currencies are rejected.
2. **Members who join mid-month.** Default: the split counts everyone who is a member when the screen is viewed. No pro-rating.
3. **Invite link.** Default: one link per household, no expiry. A regenerate button is a later pass.
4. **Who may change what.** Default: any member may add, tick, untick and delete any item or spend. The floor only says who may *see*.
5. **Month boundary.** Default: calendar month in UTC.
6. **Test site.** The repo docs don't define it. The try-on lines below use the name as written in the brief. Confirm it is the right place.

## Build order

- Skeleton: Workers app, D1 with Drizzle, Vitest and a Playwright smoke test, deployed :: nothing
- Sign-in: Continue with Google through Clerk, signed-out visitors redirected :: sign in with a Google account and land on the Household screen
- Household: make, copy the invite link, join by link, members listed, non-members get nothing :: make a household, copy its link, open it in a private window signed in as a second Google account, and see both names listed
- Shared list: add, tick, untick, delete, who added, empty and error states :: add three items, tick one and untick it, delete one, and check the empty state on a fresh household
- Shared list: refresh every 5 seconds :: open the same list in two windows of one household, tick an item in one, and see it appear in the other within about 5 seconds
- Cost split: add a spend, this month's spends listed :: add a spend from each of two accounts and see both on the Split screen
- Cost split: who owes whom, even split :: add spends so one person pays more, and check the owed amounts match a hand calculation
- Leave household and delete name and email :: leave from one account, then check the other flatmate's list and split no longer show that name or email
