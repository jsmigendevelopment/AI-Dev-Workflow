# Tracer-bullet pyramid

Planned 2026-11-23 from `docs/mvp.md`, `docs/design.md` and the wireframes approved on 2026-11-21 (decision 3). Nothing is built yet. The loop sets up slice 0 later.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL:
- [ ] A preview per pull request (if the host offers one)

How: apply the `stack-tanstack-start` pack. Don't hand-build what the pack ships. Detail is under "Current pass" below.

## Slices

Only slices the core can't work without. Role: core, support, or insisted (a non-core must the person kept; pass 1 or 2 only).

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items, tick them off, and see another person's changes within 5 seconds without a reload. Shop mode shows the same list with big tick boxes, unticked first. |
| Sign-in | support | Sign in with Google and sign out. |
| Household | support | Make a household, copy its invite link, and have a flatmate join from that link. |
| Cost split | support | Type in what a shop cost, see this month's spends, and see who owes whom. |

Why each support is in: the list belongs to a household, a household needs members, and members need sign-in. Cost split is MVP "done when" number 2 in `docs/mvp.md`. Recipes stay out.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. More than 3 passes needs a `decisions.md` row; never more than 4.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates, one live list, one month split | slice 0, then sign-in, household, shared list, cost split | Every slice thin and working end to end on the test site. Both "done when" lines in `docs/mvp.md` can be shown, roughly. | building |
| 2 Real | A list you can trust in the shop | shared list, household, cost split | **List:** fix and remove items, clear the ticked ones, changes feel instant, two people editing at once never lose a tick. **Household:** leave a household (this removes your name, the floor item), see and manage members, a new invite link if the old one leaked. **Split:** fix or remove a spend, look at earlier months, odd cents handled visibly. Sign-in stops at pass 1. | outline |
| 3 Ready | MVP complete on the test site | shared list, then the whole app | **List:** polished for one hand in a shop: speed on a weak signal, large targets, keyboard and screen reader. **Whole app:** speed, a11y, SEO basics, the launch checklist. | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

Passes 2 and 3 are outlines. They get detail at their gates, from what the person says after trying the pass before. Any pass 2 item that adds a control the wireframes don't show (remove an item, leave a household) goes back through `wireframes` first.

## Current pass: detail

Pass 1, "Works". Nine issues, in the order under "Build order" at the end.

### The order, and why

The riskiest idea is the live list: a tick by one person showing up for another. It can't be built first, because every item hangs off a household and every read is checked against a signed-in member.

| Option | Good | Bad |
|---|---|---|
| A. Sign-in, the smallest household, then the whole core, then invite, shop mode, split | The core lands third. Nothing is thrown away. Live can be tried at once with one account on a phone and a laptop. | Two small issues come before the core. |
| B. Core first, on a fake household with no sign-in | The core lands first. | Throwaway code, and no access rule, on the one thing that must be safe. |
| C. All of household (make and invite), then the core | Two real people can test live on day one of the core. | The core waits one issue longer for something a second tab already proves. |

**Chosen: A.** Invite comes straight after the core, and that's the point where MVP "done when" number 1 is met with two real people.

### Shared design for pass 1

This fills in `docs/design.md`. It changes no approved screen. Builders follow it. They don't invent their own. The issue that first touches a table updates the schema section of `docs/design.md` to match.

**Schema.** Every table also gets the pack's standard columns (ID, created and updated times in UTC).

| Table | Columns | Rules |
|---|---|---|
| `households` | `name`, `invite_token` | The token is random, unguessable and unique. One per household in pass 1. |
| `members` | `household_id`, `user_id` (the Clerk user ID), `display_name`, `joined_at` | Unique on `user_id`: one household per person in the MVP. The name is copied from Google at join, so there's no users table. No email is stored in pass 1. |
| `items` | `household_id`, `name`, `added_by` (a member), `ticked_at` (empty = not ticked) | Name is 1 to 80 characters, trimmed. |
| `spends` | `household_id`, `paid_by` (a member), `amount_cents`, `currency`, `spent_on` | Whole cents, more than zero. `spent_on` is a calendar date, not an instant, so a month is the same for everyone. |

**Access.** Every server function goes through `check()`. It reads the signed-in user's `members` row and returns the household and the member, or refuses. The household ID never comes from the browser. `list` and `split` get the household and the member names from this shared access layer, not by importing `household`.

**API.** Server functions, per module:

| Module | Function | Takes | Gives back |
|---|---|---|---|
| `household` | `getMyHousehold` | nothing | the household, its invite link and its members, or nothing if you have none |
| `household` | `createHousehold` | `name` | the household. Refused if you're already in one. |
| `household` | `getInvite` | `token` | the household's name only |
| `household` | `joinHousehold` | `token` | the household. Joining the one you're in is fine and changes nothing. |
| `list` | `listItems` | nothing | items, each with its name, who added it and `tickedAt` |
| `list` | `addItem` | `name` | the item |
| `list` | `setItemTicked` | `itemId`, `ticked` (yes or no) | the item. It sets the state, it doesn't flip it, so two people ticking the same item never untick it. |
| `split` | `listSpends` | `month` | the month's spends, newest first, and the total |
| `split` | `addSpend` | `amountCents`, `spentOn` | the spend. The payer is the signed-in member. |
| `split` | `getSettlement` | `month` | each member's balance, and a list of "A pays B this much" |

**Live.** The list re-reads every 5 seconds while its tab is visible, and again when the tab gets focus. Polling only. Nothing fancier in pass 1.

**The split sum.** Total for the month, divided by the current members. Each balance is what they paid minus their share. Spare cents go one each to members in the order they joined, so balances always add to zero. Then the person who owes most pays the person owed most, and repeat. Integer cents throughout.

**Routes.** `/sign-in`, `/household`, `/join/<token>`, `/list`, `/list/shop`, `/split`. Signed out goes to sign-in. Signed in with no household goes to `/household`.

**Screens.** Each has its designed empty, loading and error states, per `AGENTS.md`. Copy lives in each module's `copy.ts`.

### The issues

Risky lane (the person merges, per `docs/stack.md`): 2, 3, 6, 8 and 9, because they touch sign-in, access or money.

**1. Skeleton (slice 0).**
- Apply the `stack-tanstack-start` pack. Rename the example module into the three empty modules `list`, `household` and `split`, or delete it.
- Every command in the check contract works. CI runs on every pull request. The boundary check is on.
- Put the design tokens from `docs/design.md` into the shadcn/ui theme.
- Main deploys to the test environment, with a preview per pull request. Write the test URL and the working commands into `AGENTS.md`.
- Needs the person, each asked the `ask` way before it's done: `gh auth login` and a yes to the GitHub setup script; a Cloudflare account; a Clerk app with Google turned on; keys through the `secrets` checklist. All free tier. Nothing touches production.
- Out: any feature.

**2. Sign in with Google.**
- The Sign in screen: one button, Continue with Google. Sign out from the app's header.
- Signed-out visitors to any other page land on sign-in.
- Two test users that the end-to-end tests and `qa` can sign in as without Google.
- Out: any other sign-in method, a profile page.

**3. Make a household.**
- The Household screen, first half: name it, make it, see yourself listed as a member.
- Adds `households` and `members`, `check()` on a real rule, and the seed script: the two test users, in two different households, so `qa` can try to read across them.
- Signed in with no household lands here.
- Out: the invite link, leaving, renaming.

**4. List: add items and see them live.**
- The List screen: the add box at the top, items with who added each, and the empty, loading and error states.
- Adds `items`. The 5-second re-read goes in here.
- Out: ticking, editing, removing, sorting.

**5. List: tick items off.**
- The tick box on each item, on and off, with `setItemTicked`. A tick shows on another device within 5 seconds.
- Out: shop mode, clearing ticked items.

**6. Join a household from an invite link.**
- The Household screen, second half: copy the invite link, and all members listed.
- `/join/<token>` shows the household's name and a Join button. Signed out goes through sign-in and comes back. A bad link gets a designed error.
- A person already in another household is told so and not moved.
- Out: a new link, removing members, leaving.

**7. Shop mode.**
- `/list/shop`: the same items with big tick boxes, unticked first. A way in from the list and back.
- Lives in the `list` module and reuses its functions. No new table.
- Out: anything offline, keeping the screen awake.

**8. Split: add a spend and see this month's spends.**
- The Split screen, first half: the add-a-spend form (amount, date, today by default) and this month's spends with who paid and the total.
- Adds `spends`. Amounts typed as money, stored as whole cents.
- Out: who owes whom, editing or removing a spend, other months, more than one currency.

**9. Split: who owes whom.**
- The Split screen, second half: `getSettlement` and a plain list of "A pays B this much" for this month. All square gets a designed empty state.
- Unit tests on the sum, with odd cents and with 2, 3 and 4 members.
- Out: marking a debt paid, uneven splits.

### Open questions

None blocks issues 1 to 7. Each has a default the build uses unless the person says otherwise.

1. **One household per person?** Default: yes, for the whole MVP. It's the `members` rule above.
2. **Which currency?** Needed by issue 8. Default: one currency for the whole app, set in one place, and no picker. The person names it.
3. **Someone joins halfway through a month.** Default: the month splits evenly between whoever is a member when you look.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Re-plan |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Debt

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

- Items can't be removed until pass 2, so the list only grows during pass 1.
- Leaving a household (the "how it's deleted" floor item) is pass 2. Until then, removal is by hand in the test database.

## After the MVP: the hourglass

<!-- One row per layer. Each layer: new features (each in thin) plus a pass on what's already there (the core every layer). Plan one layer at a time; the gate runs between layers. -->

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (from `docs/features.md`), if still wanted at the gate | core |  |

## Build order

- Skeleton: the app runs, CI checks it, main deploys to test :: nothing
- Sign in with Google :: Sign in with Google, land on a near-empty home page, and sign out again
- Make a household :: Name and make a household, and see yourself listed as its member
- List: add items and see them live :: Add items on your laptop and watch them appear on your phone within 5 seconds, each with your name on it
- List: tick items off :: Tick an item on one device and see it ticked on the other without reloading
- Join a household from an invite link :: Copy the invite link, have a flatmate join with their own Google account, and both see and tick the same list
- Shop mode :: Open shop mode on your phone, see big tick boxes with unticked items first, and tick your way through
- Split: add a spend and see this month's spends :: Type in what a shop cost and see it in this month's spends with who paid and the total
- Split: who owes whom :: With spends from two or more flatmates entered, see who pays whom and how much for this month
