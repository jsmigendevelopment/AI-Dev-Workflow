# Build pyramid

The build goes in passes. Each pass touches every slice it needs, end to end, and leaves the test site working. Pass 1 is the thinnest version of the whole main flow from `vision.md`; later passes add depth, mostly to the core (the live shared list).

Planned on the model that was open (decision 5). Nothing is built today; the loop sets up slice 0 later.

## Passes at a glance

| Slice | Role | Pass 1 | Pass 2 | Pass 3 |
|---|---|---|---|---|
| Setup (slice 0) | base | App skeleton, test site, CI | – | – |
| Sign-in | support | Google through Clerk, sign out | – | – |
| Household | support | Make one, invite link, join, member list | Leave a household (removes your data), rename, re-issue invite link | – |
| Shared list | core | Add, tick, untick, who added, 5-second polling, empty/loading/error states | Shop mode, delete and edit items, clear ticked, optimistic ticks | Real live updates (push instead of polling), offline-tolerant ticking in the shop |
| Cost split | support | Add a spend, this month's spends, each member's balance against an even share | "Who pays whom" transfers, edit/delete a spend, earlier months | – |

Pass counts match `mvp.md` (list 3, sign-in 1, household 2, split 2).

After pass 1, both "done when" lines in `mvp.md` hold in their plainest form: two flatmates see the same list and a tick shows up within 5 seconds without a reload, and a month's spends are split evenly.

## Pass 1 in detail

### Rules for the whole pass

- **Layering:** route, then server function, then service, then repository, inside `list`, `household`, `split`. Modules don't import each other (`architecture.md`). The one thing all three need, "who is signed in and which household are they in", lives in a small shared `auth` helper outside the modules, not in `household`.
- **Access floor, from the first issue that stores data:** every server function resolves the Clerk user, then checks membership of the household it is about to touch. No household id is ever trusted from the client alone. Each data issue ships a test that a non-member gets refused.
- **One household per person** in pass 1. A signed-in person with no household lands on Household; with one, on List.
- **Tests:** Vitest for services (the split maths especially), one Playwright happy path per issue against a local D1.
- **UI:** shadcn/ui components, laid out as in the approved wireframes (`docs/wireframes/index.html`, decision 3). Shop mode is the one approved screen that waits for pass 2.
- **Risk dial is "move fast":** no feature flags, no staging beyond the single test site, migrations go forward only.

### Slice 0: setup

- TanStack Start app on Cloudflare Workers, with D1 bound and Drizzle wired for migrations (an empty first migration).
- shadcn/ui installed, one shell layout with the app name and an empty nav.
- Vitest and Playwright running, each with one trivial test.
- CI on every pull request: typecheck, lint, tests. Merge to `main` deploys to the test site and applies D1 migrations.
- Folders for `list`, `household`, `split`, plus a lint rule that fails on cross-module imports.
- Needs from the person before it can finish: a Cloudflare account/API token and a D1 database for the test site.

### Sign-in

- Clerk with Google as the only provider. Sign-in screen: one button, "Continue with Google".
- Every route except Sign in requires a session; signed-out visitors are sent to Sign in and returned to where they were going (this matters for invite links).
- Sign out in the nav. The nav shows the person's name.
- We store only the Clerk user id, name and email, copied at the moment someone creates or joins a household (floor checklist: name and email only).
- Needs from the person: a Clerk application with Google enabled, and its keys as test-site secrets.

### Household

- Schema: `households (id, name, invite_token)`, `members (household_id, user_id, name, email, joined_at)`, unique on `user_id` for pass 1. `invite_token` and the member name/email columns are additions to `design.md`'s sketch: the token is what the invite link carries, and the name is needed to show "who added" and "who paid".
- **Make a household:** name field, create, you become its first member, land on List.
- **Invite link:** `/join/<token>`, a long random token. Household screen shows it with a copy button, and lists members.
- **Join:** opening the link signed-in shows "Join <household name>?" and a button. Signed-out goes through Sign in first, then back. Already in a household: a plain message saying so (switching is pass 2, alongside leaving).
- Not in pass 1: leaving, renaming, re-issuing the link, removing someone else.

### Shared list (core)

- Schema: `items (id, household_id, name, added_by, created_at, ticked_at, ticked_by)`. `ticked_by` is an addition, cheap now and wanted by Shop mode later.
- **Add:** add box at the top, Enter or button, trimmed, empty refused, 200 character cap. New items appear at the top.
- **Show:** name, who added it, tick box. Unticked first, then ticked (greyed and struck through).
- **Tick / untick:** one server function that sets or clears `ticked_at`. Last write wins.
- **Live:** the list query refetches every 5 seconds and on window focus (`design.md`). Polling pauses when the tab is hidden. Your own add or tick refetches at once, so only the other person waits up to 5 seconds.
- **States:** empty ("Nothing on the list yet"), loading skeleton, and an error banner with retry that keeps the last good list on screen.
- Not in pass 1: Shop mode, delete, edit, reorder, quantities, clear ticked, optimistic updates, push.

### Cost split

- Schema: `spends (id, household_id, paid_by, amount_cents, currency, spent_on, created_at)` as in `design.md`.
- **Add a spend:** amount and date (defaults to today); paid by defaults to you, and can be set to any member. Amount is typed as decimals and stored as integer cents.
- **Currency:** one fixed currency in pass 1, written to the `currency` column on every row so nothing has to migrate later. Which currency is an open question below.
- **This month:** the spends list for the current calendar month, newest first, with who paid and a month total.
- **Even split:** share = month total ÷ current member count. Each member shows as paid, share, and balance ("is owed 12.50" / "owes 4.17"). Leftover cents from the division go to members in join order so balances always sum to zero. This is a pure function with table-driven Vitest cases.
- Not in pass 1: the minimal "A pays B" transfer list, edit/delete, past months, uneven splits, members who joined mid-month being treated differently.

### What pass 1 leaves rough, on purpose

- Up to 5 seconds of lag between flatmates, and no offline handling in the shop.
- A mistyped item or spend can't be removed.
- Nobody can leave a household, so the "leaving removes your data" floor item is not met until Household pass 2. That pass should come before anyone outside the flat is invited.
- Balances say who is up and who is down, not who pays whom.

## Later passes, in outline

**Pass 2** (order within the pass: Household first, because of the data-deletion floor item):
- Household: leave (deletes your member row; your items and spends keep a "former member" label), rename, re-issue invite link.
- Shared list: Shop mode screen (big tick boxes, unticked first), delete and edit items, clear ticked, optimistic ticks.
- Cost split: "who pays whom" with the fewest transfers, edit/delete a spend, month picker.

**Pass 3** (core only):
- Shared list: replace polling with push (a Durable Object per household is the likely fit on Workers; decide at the time), and make ticking in Shop mode survive a dropped connection.

Recipes stay out (`features.md`: later, idea).

## Open questions

None block the plan; each has a default the build will use unless told otherwise.

1. **Currency for pass 1.** Default: EUR.
2. **Mid-month joiners.** Default: the split uses whoever is a member when you look, however late they joined.
3. **Test site address.** Default: the `workers.dev` URL Cloudflare hands out.

## Build order

- Set up the app skeleton, CI and test-site deploys :: open the test site and see the flatshare shell page
- Sign in with Google :: sign in with Google, see your name in the nav, sign out, and get bounced to Sign in when signed out
- Make a household :: create a household, see yourself listed as a member, and land there again after signing back in
- Join a household by invite link :: copy the invite link, open it as a second Google account, join, and see both members listed
- Add items to the shared list :: add items and see them with who added each; a flatmate's items appear too after a reload; see the empty state on a fresh household
- Tick items off, with live updates :: tick an item on one device and watch it move to the ticked group on the other within 5 seconds, no reload
- Add a spend and see this month's spends :: type in what a shop cost and see it in this month's list with who paid and the month total
- Split the month evenly :: with spends from two flatmates, see each person's share and who is owed or owes how much
