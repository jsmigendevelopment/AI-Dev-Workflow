# Pyramid

The build plan for flatshare. Each pass goes across every slice once, thin and working end to end, and each later pass goes deeper. The core (the shared list) gets the most passes.

| Slice | Role | Pass 1 | Pass 2 | Pass 3 |
|---|---|---|---|---|
| Sign-in | support | Google sign-in, sign out, signed-out visitors sent to Sign in | | |
| Household | support | Make one, invite link, join, members listed | Leave a household, reset the invite link | |
| Shared list | core | Add, tick, who added, updates within 5 seconds | Shop mode, untick, remove, instant ticks | Push updates instead of polling, bad-signal handling |
| Cost split | support | Add a spend, this month's spends, who owes whom | Edit and delete spends, earlier months | |

Pass 1 alone meets both "done when" lines in `mvp.md`. The MVP is not finished until pass 2, because Shop mode is an approved screen and "leaving a household removes your name and email" is a floor item, and both land there.

## Pass 1 in detail

Nine issues, each a vertical cut (schema, server function, screen, tests) so that every merge changes something visible on the test site. There is no separate "set up the database" issue: each table arrives with the first issue that needs it.

### Rules that hold across pass 1

- **Layout:** `src/modules/{household,list,split}/` each with `routes`, `service`, `repository`. Modules don't import each other.
- **Membership guard:** `list` and `split` both need "is this user in this household?", which is `household` data. That check lives outside the modules in `src/server/guard.ts` (`requireUser`, `requireMember`), and every server function calls it. No server function takes a household id from the client: the household comes from the signed-in user.
- **One household per person.** Signed in with no household goes to Household; with a household goes to List.
- **Tests:** Vitest for services (split maths, guard), one Playwright path per issue against a local D1. Playwright signs in with Clerk's testing tokens, not a real Google account.
- **Risky lane (person merges):** issues 2, 3 and 4, because they decide who can see what. The rest merge on green.

### Additions to the schema in `design.md`

The design schema can't carry pass 1 as written. These columns are added:

- `households.invite_token`: the secret in the invite link.
- `members.name`, `members.email`, `members.joined_at`: so "who added" and "who owes whom" show names without calling Clerk on every read. These are the name and email the floor checklist says are stored.
- `id` and `created_at` on `items` and `spends`.

### 1. Skeleton on the test site

- TanStack Start app, shadcn/ui installed, one home page with the app name.
- Cloudflare Worker with a D1 binding, Drizzle wired up with an empty first migration, migrations applied on deploy.
- CI: typecheck, Vitest, one Playwright smoke test. Merges to `main` deploy to the test site.
- Needs from you: a Cloudflare account and an API token for deploys.

### 2. Sign in with Google

- Clerk with Google only. Sign in screen: one button, "Continue with Google".
- `requireUser` in the guard. Every route but Sign in sends signed-out visitors to Sign in.
- Header shows your name and a sign out button.
- Needs from you: a Clerk app with Google turned on, and its keys.

### 3. Make a household

- Tables: `households`, `members`.
- Household screen with no household: a name box and "Make household". The maker becomes its first member, with name and email copied from Clerk.
- Household screen with a household: its name and the member list (just you, for now).
- `requireMember` in the guard, with tests that a non-member gets nothing.

### 4. Invite link and joining

- "Copy invite link" on the Household screen. Link is `/join/<invite_token>`.
- Opening it signed out goes through Sign in and comes back. Signed in, it shows the household name and a "Join" button.
- Joining adds you to `members` and lands you on Household, where both people are listed.
- Already in a household: the join page says so and does nothing. Bad token: a plain "this link doesn't work" page.

### 5. The list: add items

- Table: `items`.
- List screen: add box at the top, items newest first, each with the name of who added it.
- Empty state ("Nothing on the list yet"), loading state, error state with a retry button.
- Blank names rejected; names trimmed and capped at 100 characters.
- List becomes the home screen for anyone in a household.

### 6. Tick items off

- Tick box on each item sets `ticked_at`. Ticked items show struck through and stay in place.
- Ticking is one-way in pass 1. Unticking and removing come in pass 2.

### 7. The list updates on its own

- The list query refetches every 5 seconds, and at once when the tab regains focus. It stops while the tab is hidden.
- A failed refetch keeps the last good list on screen and shows a small "can't reach the list" note, not the full error state.
- Playwright test with two browser sessions: one ticks, the other sees it without a reload. This is "done when" line 1.

### 8. Add a spend

- Table: `spends`.
- Split screen: a form with amount and date (default today), paid by is always you. Below it, this month's spends, newest first, with who paid.
- Amounts stored as whole cents. One currency for the whole app, set in config and written to each row; see open questions.
- "This month" is the calendar month on the viewer's device.

### 9. Who owes whom

- Pure function in the `split` service: month total divided evenly across current members, including those who paid nothing. Leftover cents go to members in a fixed order so the totals always add up.
- Balances turned into the shortest plain list of payments: "Sam pays Alex 12.50".
- Shown under the spends on the Split screen. No spends this month: "Nothing to split yet".
- Vitest covers uneven divisions, one member, and a member who paid nothing. This is "done when" line 2.

## Later passes in outline

Detail gets written when pass 1 is merged and you've used it.

**Pass 2**

- Shared list: Shop mode (big tick boxes, unticked first), untick, remove an item, ticks show instantly before the server answers.
- Household: leave a household, which deletes your name and email; reset the invite link.
- Cost split: edit and delete your own spends, look at earlier months.

**Pass 3**

- Shared list: replace the 5 second poll with pushed updates (a Durable Object per household), and keep ticks made with no signal until they can be sent.

## Open questions

None block the start. The default applies unless you say otherwise.

1. **Currency.** Default: one currency for the app, set in config. Which one?
2. **One household per person.** Default: yes. Someone in two flats would need two accounts.
3. **A flatmate who joins mid-month.** Default: they share the whole month's spends evenly with everyone else.
4. **Who a spend is paid by.** Default: always the person typing it in. Entering a spend for someone else is not planned.

## Build order

- Skeleton on the test site :: open the test site and see the flatshare home page
- Sign in with Google :: sign in with Google, see your name in the header, sign out, and get sent to Sign in when you visit signed out
- Make a household :: name a household and see yourself listed as its only member
- Invite link and joining :: copy the invite link, open it in a second Google account, join, and see both people in the member list
- The list: add items :: add items and see them with your name beside each, plus the empty state before you add any
- Tick items off :: tick an item and see it struck through, still ticked after a reload
- The list updates on its own :: with two accounts on two devices, tick or add on one and watch it show on the other within 5 seconds, no reload
- Add a spend :: type in what a shop cost and see it in this month's spends with your name
- Who owes whom :: add spends from two accounts and see who pays whom, and how much, to make the month even
