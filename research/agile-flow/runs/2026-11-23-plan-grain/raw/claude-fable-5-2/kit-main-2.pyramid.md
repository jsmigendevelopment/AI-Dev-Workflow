# Tracer-bullet pyramid

Planned 2026-11-23 from `docs/mvp.md`, `docs/design.md` and the wireframes approved in `docs/decisions.md` row 3. Nothing is built yet. The loop sets up slice 0 later.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: 
- [ ] A preview per pull request (if the host offers one)

Slice 0 is two issues, so the part that needs the person's accounts doesn't block the part that doesn't:

1. **The repo skeleton.** Apply the `stack-tanstack-start` pack. Rename or delete its example module so the modules are `list`, `household`, `split`. Every command in the check contract works. CI runs checks, the secret scan, the agent-file guard and the issue-link check. Write the generator commands and the check commands into `AGENTS.md`. Run the GitHub setup script as a dry run, show the person the list, and run it for real only on their yes.
2. **The test site.** Open `secrets` and wire the Cloudflare and Clerk keys for local and test (values never in chat). Main deploys to the test environment, each pull request gets a preview, and the test URL goes into `AGENTS.md`. Production is not deployed in pass 1 and its "Coming soon" page stays on.

## Slices

Only slices the core can't work without. Role: core, support, or insisted (a non-core must the person kept; pass 1 or 2 only).

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items, tick them off in the normal view or in Shop mode, and see a flatmate's change within 5 seconds without reloading |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Make a household, copy its invite link, and join one from a link |
| Cost split | support | Type in what a shop cost and see who owes whom for this month |

"Does the core work without it?" Sign-in and Household: no, the list has to belong to someone. Cost split: yes, strictly. It stays because `docs/mvp.md` lists it as a support slice and "Done when" 2 depends on it. It is ordered last and capped at 2 passes.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. More than 3 passes needs a `decisions.md` row; never more than 4.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates share one live list and split a month | slice 0, then Sign-in, Household, Shared list, Cost split | thin and working end to end. Details below | building |
| 2 Real | The list holds up in a real shop | Shared list, Household, Cost split | **List:** faster live updates than a 5-second poll, edit and remove items, clear ticked items, two people changing the same item. **Household:** leave a household (removes the person's data, the floor item), see and remove members, reset the invite link. **Cost split:** edit and delete a spend, look at past months | outline |
| 3 Ready | MVP complete on the test site | Shared list, then the whole app | **List:** polished for one-handed use on a phone, survives a bad signal in the shop. **Whole app:** speed, accessibility, SEO, the launch checklist | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: detail

Pass 1, Works. Ten issues, in the order under "Build order" at the end.

### Why this order

- Slice 0 first.
- Sign-in and "make a household" come before the core because every list row needs a household and a person. Both are small: Clerk does the sign-in, and making a household is one form.
- Then the core, which carries the riskiest idea: a tick showing up for someone else without a reload. It is proved by issue 6, and across two people by issue 7.
- Cost split last. The core doesn't depend on it.

### What the slices share

Builders follow this. They don't invent their own. It extends the schema line in `docs/design.md`; where it adds a column, the reason is given.

**Schema** (D1 through Drizzle; every table also gets the pack's standard ID and timestamp columns):

| Table | Columns | Notes |
|---|---|---|
| `households` | `name`, `invite_code` | `invite_code` is new: a long random string, unique. The Household screen's "copy the invite link" needs it |
| `members` | `household_id`, `user_id`, `display_name` | `user_id` is the Clerk user ID. Unique on `user_id`: one household per person in pass 1 (assumption 2). `display_name` is new: copied from Clerk when the person joins, so "who added each" doesn't need a Clerk call per row |
| `items` | `household_id`, `name`, `added_by`, `ticked_at` | `ticked_at` is a UTC instant, or null when unticked. Index on `household_id` |
| `spends` | `household_id`, `paid_by`, `amount_cents`, `currency`, `spent_on` | Whole cents, never a decimal. `spent_on` is a calendar date, not an instant. Index on `household_id`, `spent_on` |

**Server functions** (route → service → repository, one set per module):

| Module | Function | Does |
|---|---|---|
| `household` | `getMyHousehold` | The signed-in person's household and its members, or nothing |
| `household` | `createHousehold(name)` | Makes it and adds the person as the first member |
| `household` | `joinHousehold(inviteCode)` | Adds the person as a member. A bad code gets a designed error |
| `list` | `getItems` | Every item of the person's household, with who added it |
| `list` | `addItem(name)` | Adds one. Name trimmed, 1 to 100 characters |
| `list` | `setTicked(itemId, ticked)` | Sets or clears `ticked_at` |
| `split` | `getMonth` | This month's spends and the "who owes whom" lines |
| `split` | `addSpend(amountCents, spentOn)` | Adds one, paid by the signed-in person |

**Rules every slice keeps:**

- **Access.** Every function works out the household from the signed-in person on the server, through `check()`. It never trusts a household ID sent by the browser. Someone outside a household gets the same "not found" as for a household that doesn't exist. This is the floor item "only members see its list and spends", and it is in from the first table, not saved for pass 2.
- **Modules don't import each other.** `list` and `split` need the person's household and member names. They get them the way the stack pack does shared access, not by importing `household`. If the pack has no answer, the builder stops and asks.
- **Live updates.** The List and Shop mode screens ask the server again every 5 seconds while the tab is visible. A tick shows at once for the person who made it and is rolled back with a message if the server says no.
- **Routes.** `/sign-in`, `/household`, `/join/<invite code>`, `/list`, `/list/shop`, `/split`. A signed-in person with no household lands on `/household`; with one, on `/list`.
- **Look.** shadcn/ui components and the pack's design tokens. `docs/design.md` records no tokens of its own, so the kit's defaults stand until the person says otherwise. Phone width first: this app is used in a shop.
- **Screens come from the approved wireframes.** A screen that has to change goes back through `wireframes`.

### The issues

Lane `risky` means sign-in, access, money or deploy settings: the person merges those (`docs/stack.md`).

**1. Skeleton: the app from the stack pack, with checks and CI.** Lane: normal.
- As in "Slice 0" above, item 1.
- Fence: no deploy, no keys, no feature code.

**2. Test site: main deploys to test, with a preview per pull request.** Lane: risky. Needs the person for accounts and keys.
- As in "Slice 0" above, item 2.
- Fence: nothing reaches production. No feature code.

**3. Sign in with Google.** Lane: risky.
- The Sign in screen: one button, "Continue with Google".
- Every other screen sends a signed-out person to Sign in, then back to where they were going.
- Sign out, from a menu that shows the person's name.
- Fence: no other sign-in method, no profile page.

**4. Make a household.** Lane: risky (first table, first access rule).
- The Household screen for someone with none: a name box and a button. Then it shows the household's name and its members (just them, so far).
- Adds `households` and `members`, the seed script, and **two test users** in different households, so `qa` can sign in as each and check that one can't see the other's data.
- Fence: no invite link yet, no renaming, no leaving.

**5. List: add items and see them.** Lane: normal.
- The List screen: an add box at the top, then the items, newest first, each with who added it.
- The empty, loading and error states from the wireframes, each designed (icon, title, message, next action).
- Adds `items`. A person in another household can't see or add to this list.
- Fence: no ticking, no editing, no removing.

**6. List: tick items off, and see changes without reloading.** Lane: normal. **The riskiest idea in the MVP.**
- A tick box on each item. Ticking and unticking both work.
- The 5-second refresh, so a change made on one device shows on another.
- Fence: no Shop mode, nothing faster than the 5-second refresh.

**7. Household: invite link and joining.** Lane: risky.
- "Copy the invite link" on the Household screen.
- Opening the link: sign in if needed, then join and land on the list. The members list shows everyone.
- Someone already in a household, or with a bad link, gets a designed message saying what to do.
- After this, "Done when" 1 in `docs/mvp.md` can be checked by two real people.
- Fence: no leaving, no removing members, no resetting the link.

**8. Shop mode.** Lane: normal.
- The same list with big tick boxes, unticked items first, and the same 5-second refresh.
- A way to switch between the List and Shop mode.
- Fence: no add box here, no offline use.

**9. Split: add a spend and see this month's spends.** Lane: risky (money).
- The Split screen: a form with the amount and the date (today by default), and this month's spends with who paid.
- Adds `spends`. The amount is typed as 12.50 and stored as 1250 cents with the household's currency (assumption 1).
- Fence: no editing or deleting a spend, no other months, no "who owes whom" yet.

**10. Split: who owes whom.** Lane: risky (money).
- Under the spends: lines such as "Sam owes Alex 12.50", for this month.
- The month's total is split evenly between the current members. Left-over cents go to members in a fixed order, so the lines always add up to the cent. The fewest payments that settle it.
- The sum is a plain function with unit tests: one payer, several payers, a total that doesn't divide evenly, a household of one, a month with no spends.
- After this, "Done when" 2 can be checked.
- Fence: no "mark as paid", no uneven splits.

### Assumptions to confirm

Not asked today, because the plan can be read without the answers and none blocks issues 1 to 8. Each has my recommended answer, which the plan uses until the person says otherwise.

1. **Which currency are the spends in?** The docs don't say. Recommended: one currency for the whole app, chosen by the person before issue 9 is built. Issue 9 waits on this answer.
2. **Can one person be in more than one household?** Recommended: no, one each, as "one household per flat" in `docs/features.md` suggests. It keeps every screen free of a household switcher.
3. **Should the test site be locked so only the flatmates can open it?** Recommended: yes, behind a login for the people the person names (the stack pack's Cloudflare Access setup, free at this size). Decided in issue 2.

### Pass 1 is done when

All ten issues are merged and both "Done when" lines in `docs/mvp.md` hold on the test site. Then the pass gate runs: the person tries it, a fresh audit, cleanup, and a re-plan of pass 2 here.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Re-plan |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Debt

- `docs/wireframes/index.html` holds only the five screen titles, and `docs/design.md` names states (empty, loading, error) for the List alone. Builders of the other screens copy the List's states. If that isn't enough for a screen, it goes back through `wireframes`.
- `docs/design.md` doesn't yet show `invite_code` or `display_name`. Update its schema line when issue 4 is written.

## After the MVP: the hourglass

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (the only idea in `docs/features.md` so far) | core |  |

## Build order

- Skeleton: the app from the stack pack, with checks and CI :: nothing
- Test site: main deploys to test, with a preview per pull request :: open the test URL and see the app's starter page load
- Sign in with Google :: sign in with your Google account, see your name in the menu, and sign out again
- Make a household :: name a household and see it with yourself as its only member
- List: add items and see them :: add a few items and see each one in the list with your name beside it
- List: tick items off, and see changes without reloading :: open the list on your phone and your laptop, tick an item on one, and watch it tick on the other within 5 seconds
- Household: invite link and joining :: copy the invite link, send it to a flatmate, and both see the same list and each other's ticks
- Shop mode :: switch to Shop mode on your phone and tick items off with the big boxes, unticked ones first
- Split: add a spend and see this month's spends :: type in what a shop cost and see it in this month's spends with your name
- Split: who owes whom :: add spends from two people and see who owes whom, adding up to the cent
