# Tracer-bullet pyramid

Planned 2026-11-23 from `docs/mvp.md`, `docs/design.md` and the wireframes approved in decision 3. Nothing is built yet. The loop sets up slice 0.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: 
- [ ] A preview per pull request (if the host offers one)

## Slices

Only slices the core can't work without. Role: core, support, or insisted (a non-core must the person kept; pass 1 or 2 only).

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items, tick them off in the list or in Shop mode, and see a flatmate's changes within 5 seconds without a reload |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Make a household, copy its invite link, join from the link, see the members |
| Cost split | support | Enter what a shop cost and see who owes whom for this month |

Each passes "does the core work without it?": no sign-in means no "who added this"; no household means nothing is shared; the cost split is the second line of "Done when" in `docs/mvp.md`.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. More than 3 passes needs a `decisions.md` row; never more than 4.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates share a live list and split a month | slice 0, then Sign-in, Household, Shared list, Cost split | Thin and working end to end. Details below | building |
| 2 Real | A flat can rely on it for a real month | Shared list, Household, Cost split | **Shared list:** edit and delete items, clear ticked items, faster live updates than the 5-second poll, safe when two people change the same item. **Household:** leave a household (removes the person's name and email), remove a member, renew the invite link. **Cost split:** edit and delete a spend, look at earlier months | outline |
| 3 Ready | MVP complete on the test site | Shared list, then the whole app | **Shared list:** polished for one-handed use in a shop, holds up on a bad signal. **Whole app:** speed, a11y, SEO, launch checklist | outline |

Sign-in ends after pass 1. Household and Cost split end after pass 2. Shared list runs all three.

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: detail

Pass 1, Works. Nine issues, in the order in "Build order" at the end.

### Order, and why

1. Slice 0.
2. Sign-in, then Household. The risky idea is the live list between two people, and it can't be shown without two signed-in people in one household. Both are kept as thin as they can be so the core comes third.
3. Shared list, three issues: items, then live ticks, then Shop mode. After the second one, line 1 of "Done when" is met.
4. Cost split, two issues: spends, then the split. After the second one, line 2 is met.

Issues 5 to 7 (`list`) and 8 to 9 (`split`) touch different modules. Once issue 3 is merged, the two tracks can be built side by side.

### Shared design for pass 1

Builders follow this. A screen that needs to change goes back through `wireframes`.

**Schema.** `docs/design.md` plus what the screens need. Every table also gets the stack pack's standard columns (ID, created and updated times in UTC).

| Table | Columns | Notes |
|---|---|---|
| `households` | name, invite_token | invite_token is a long random value, unique. It is the invite link |
| `members` | household_id, user_id, display_name | user_id is the Clerk user ID, unique: one household per person in pass 1. display_name is copied from Google when the person joins |
| `items` | household_id, name, added_by, ticked_at | added_by is a member. ticked_at empty means unticked |
| `spends` | household_id, paid_by, amount_cents, currency, spent_on | amount_cents is a whole number above zero. spent_on is a calendar date, not an instant |

- Each table arrives with the first issue that uses it. No issue adds a table it doesn't show on a screen.
- Email stays in Clerk. Only the name is copied into the database.
- Seed script: two test users in one household, and a third test user in a second household, so `qa` can check that one household can't read another's list or spends. It arrives with issue 3 and grows with each new table.

**API.** Server functions per module. Route, then service, then repository. Modules don't import each other.

| Module | Server functions | Arrives in |
|---|---|---|
| `household` | getMyHousehold, createHousehold | issue 3 |
| `household` | joinHousehold (by invite token) | issue 4 |
| `list` | getItems, addItem | issue 5 |
| `list` | setItemTicked | issue 6 |
| `split` | getMonthSpends, addSpend | issue 8 |
| `split` | getMonthSplit | issue 9 |

- **Access.** Every function goes through `check()`: the caller must be a member of the household the data belongs to. The household comes from the caller's membership, never from an ID the browser sends. This is in pass 1, not later, because it is the floor.
- **Membership across modules.** `list` and `split` need to know the caller's household but can't import `household`. The membership lookup lives in shared code beside `check()`. Issue 3 puts it there.
- **Live updates.** The list refetches every 5 seconds, and only while the tab is visible. A tick shows at once for the person who ticked (optimistic update) and within 5 seconds for everyone else. Anything faster is pass 2.
- **The split.** Month = spends whose spent_on falls in the current calendar month. Each member's share is the total divided evenly; leftover cents go one each to members in joining order, so shares always add up to the total. Balance = paid minus share. "Who owes whom" pairs the person who owes most with the person owed most, and repeats until all balances are zero. Whole cents only. This is a pure function with unit tests.
- **Currency.** One currency for the whole app in pass 1, a single constant, stored on every spend. The form doesn't ask for it. See "Open questions".

**Screens.** The five approved screens, built from shadcn/ui components and the design tokens. Every screen that loads data has designed empty, loading and error states (icon, title, specific message, next action, reference ID).

### The issues

**1. Set up the skeleton and the test site** · slice 0
- Apply the `stack-tanstack-start` pack. Rename the example module's pieces as the pack says. Every command in the check contract works.
- CI on every pull request: checks, secret scan, agent-file guard, issue-link check.
- Main deploys to the test site. A preview per pull request. The test URL goes in `AGENTS.md`, with the commands that work here.
- GitHub set up with `setup-github.mjs` after the person's yes.
- Needs the person: see "Needs you in slice 0".
- Out: any feature. Clerk keys (issue 2).

**2. Sign in with Google** · Sign-in · needs 1
- The Sign in screen: one button, Continue with Google, through Clerk.
- Every other page sends a signed-out visitor to Sign in. A sign-out control in the app header.
- Two Clerk test users for `qa` and the end-to-end tests.
- Needs the person: a free Clerk account and its keys, through the `secrets` checklist.
- Out: email and password, other logins, a profile page.

**3. Make a household** · Household · needs 2
- The Household screen. A signed-in person with no household sees a form: name it, make it. They become its first member.
- After that the screen shows the household name, the invite link with a copy button, and the members list.
- A signed-in person with no household is always sent here.
- Adds `households` and `members`, the shared membership lookup, and the seed script.
- Out: joining (issue 4), renaming, leaving, removing members.

**4. Join a household from an invite link** · Household · needs 3
- Opening the link signed out goes through Sign in and comes back to the link.
- Opening it signed in, with no household, joins and lands on the List.
- Opening it when already in a household: a designed message that says so. No switch in pass 1.
- A wrong or unknown link: a designed error state.
- Out: expiring or renewing links, more than one household per person.

**5. Add items to the shared list** · Shared list (core) · needs 3
- The List screen: an add box at the top, then the household's items, newest first, each with who added it.
- Designed empty, loading and error states.
- Only members of the household can read or add. A test proves a member of another household can't.
- Adds `items`.
- Out: ticking (issue 6), editing, deleting, reordering, quantities.

**6. Tick items off and see it live** · Shared list (core) · needs 5
- A tick box on each item. Ticking and unticking both work. A ticked item looks done and stays in the list.
- The list refetches every 5 seconds while the tab is visible, so adds and ticks by others show without a reload.
- An end-to-end test with two signed-in browsers: one ticks, the other sees it without reloading.
- Out: push or sockets, offline, clearing ticked items, who ticked it.

**7. Shop mode** · Shared list (core) · needs 6
- The Shop mode screen: the same list with big tick boxes, unticked items first, ticked ones below.
- A way in from the List and a way back.
- Uses the same server functions and the same 5-second refetch as the List. No new API.
- Out: keeping the screen awake, sorting by aisle, adding items from Shop mode.

**8. Add a spend** · Cost split · needs 3
- The Split screen: an add-a-spend form (amount, date, defaulting to today; paid by the person signed in) and this month's spends, newest first, with who paid.
- Amounts are typed as money and stored as whole cents with the currency.
- Designed empty, loading and error states. Only members of the household can read or add.
- Adds `spends`.
- Out: who owes whom (issue 9), editing or deleting a spend, earlier months, paying on someone else's behalf.

**9. See who owes whom this month** · Cost split · needs 8 and 4
- On the Split screen, under the spends: the month's total, each member's share, and the list of "A owes B so much".
- The maths as written in "The split" above, with unit tests for uneven cents, one member, and a member who paid nothing.
- Out: marking a debt as paid, uneven splits, earlier months, members who joined part-way through the month (they share the whole month in pass 1).

### Needs you in slice 0

All free tier. None of it is done today.

- **GitHub:** be signed in with `gh auth login`, then say yes to the setup list.
- **Cloudflare:** an account, and a choice of how the test site is protected. The login option (Cloudflare Access) is free but can ask for a payment method, so that choice is yours.
- **Clerk:** an account with Google sign-in on, and its keys through the `secrets` checklist. Needed for issue 2, not issue 1.

### Open questions

Each has a recommended answer. The plan uses the recommendation until you say otherwise.

1. **Which currency?** Nothing in the docs says. Recommended: tell me the one currency your flat uses, and it's fixed for the whole app in pass 1. Needed before issue 8.
2. **One household per person?** Recommended: yes for the MVP. It keeps every screen free of a household switcher.
3. **Someone joins mid-month?** Recommended: they share the whole month in pass 1; revisit at the gate if it annoys anyone.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Re-plan |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Debt

Nothing yet.

## After the MVP: the hourglass

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (from `docs/features.md`); the rest is chosen at the MVP gate | core |  |

## Build order

- Set up the skeleton and the test site :: nothing
- Sign in with Google :: Sign in with your Google account, land on a signed-in page, and sign out again
- Make a household :: Name a household, then see it with yourself as the only member and an invite link you can copy
- Join a household from an invite link :: Open the invite link in a second Google account and see both people in the members list
- Add items to the shared list :: Add items and see them listed with who added each; the other account sees them after a reload
- Tick items off and see it live :: Tick an item on one device and watch it show as ticked on the other within about 5 seconds, no reload
- Shop mode :: Open Shop mode on a phone, tick with the big boxes, and see unticked items stay at the top
- Add a spend :: Type in what a shop cost and see it in this month's spends with who paid
- See who owes whom this month :: Enter spends from both accounts and see the month's total, each share, and who owes whom
