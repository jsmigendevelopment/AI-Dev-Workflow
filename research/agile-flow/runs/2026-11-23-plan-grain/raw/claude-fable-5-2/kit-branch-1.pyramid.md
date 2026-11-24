# Tracer-bullet pyramid

Planned 2026-11-23 from `docs/mvp.md`, `docs/design.md` and the wireframes approved in `docs/decisions.md` row 3. Nothing is built yet. The loop sets up slice 0.

## Slice 0: the skeleton

Apply the `stack-tanstack-start` pack. It ships the items below; don't build them by hand.

- [ ] The app runs locally
- [ ] CI runs every check on every pull request (checks, secret scan, agent-file guard, issue-link check)
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: 
- [ ] A preview per pull request
- [ ] Production shows "Coming soon"
- [ ] Every command in the check contract works, and the generator commands are in `AGENTS.md`
- [ ] The example notes module is renamed or deleted
- [ ] Design tokens from `docs/design.md` applied to the shadcn/ui theme
- [ ] Keys wired through the `secrets` skill (Clerk, Cloudflare). The person does this part
- [ ] GitHub set up with `setup-github.mjs`, after the person says yes

## Slices

Only slices the core can't work without. Role: core, support, or insisted. A slice is a column of the pyramid. Each pass cuts it into steps, below.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | See their household's list, add an item, tick it off, see a flatmate's tick within 5 seconds, and shop with big tick boxes |
| Sign-in | support | Sign in with Google and sign out |
| Household | support | Make a household, copy its invite link, and join one from a link |
| Cost split | support | Add what a shop cost and see who owes whom this month |

"Does the core work without it?" Sign-in and Household: no, the list has to know whose it is. Cost split: yes, but it is half of "Done when" in `docs/mvp.md` and the person's own must, so it stays as a support slice, capped at pass 2.

## Shared design

Builders follow this. They don't invent their own. Screens are the five approved ones in `docs/design.md`.

### Schema

Every table also has the pack's standard columns (`id`, `created_at`, `updated_at`, instants in UTC). One migration per slice, in that slice's first step.

| Table | Columns | Added by step |
|---|---|---|
| `items` | `household_id`, `name`, `added_by` (Clerk user ID), `ticked_at` (null = not ticked) | 3 |
| `households` | `name`, `invite_code` (random, unique) | 9 |
| `members` | `household_id`, `user_id` (Clerk user ID), `display_name`; unique on the pair | 9 |
| `spends` | `household_id`, `paid_by`, `amount_cents` (integer), `currency`, `spent_on` (date) | 13 |

- `invite_code` and `display_name` are not in `docs/design.md` yet. The invite link and "who added each" need them. Step 9's issue updates `docs/design.md`.
- Step 3 also adds the seed script and two test users: user A with three items in a seeded household, user B with none. Step 9 extends the seed with the household row and A's membership.

### API

Server functions per module. Route, then service, then repository. Modules don't import each other.

| Module | Function | What it does |
|---|---|---|
| `list` | `getItems` | The household's items, unticked first, newest first |
| `list` | `addItem(name)` | Adds an item with the caller as `added_by` |
| `list` | `setTicked(itemId, ticked)` | Sets or clears `ticked_at` |
| `household` | `getMyHousehold` | The caller's household and its members, or none |
| `household` | `createHousehold(name)` | Makes it, and makes the caller a member |
| `household` | `joinHousehold(inviteCode)` | Makes the caller a member |
| `split` | `getMonth` | This month's spends and who owes whom |
| `split` | `addSpend(amountCents, spentOn)` | Adds a spend paid by the caller |

- **Who sees what:** every function goes through `check()`. The caller's household comes from the shared access layer, which reads `members`. That is how `list` and `split` know the household without importing `household`.
- **Live updates:** the List and Shop mode screens ask `getItems` every 5 seconds in pass 1.
- **The split:** the month's total divided evenly between members, in integer cents. Each member's balance is what they paid minus their share. Pass 1 shows the fewest "X owes Y" lines that settle it.
- **States:** every screen uses the skeleton's shared empty and error components from its first step, so no bare "Error" ships. The designed List states are pass 2.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates share one live list and see the month's split | slice 0, then every MVP slice | Shared list: see, add, tick, a flatmate's tick in 5 seconds, shop mode. Sign-in: Google in, and out. Household: make, invite, join. Cost split: add a spend, who owes whom | building |
| 2 Real | The list holds up in a real shop, and the floor is in | Shared list, Household, Cost split | Shared list: untick, remove and rename items, designed empty, loading and error states, no double items, live push in place of polling if the gate asks for it. Household: leave a household and have your name and email removed, one household per person, a fresh invite link. Cost split: fix or remove a spend, look at earlier months, leftover cents handled by a written rule | outline |
| 3 Ready | MVP complete on the test site | Shared list, then the whole app | Shared list: fast and smooth on a phone in a shop, works through a weak signal. Whole app: speed, a11y, SEO, security headers, the launch checklist | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: steps

Pass 1. One step is one issue and one pull request, in build order.

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | The skeleton | slice 0 | Open the test URL: the starter page loads | 5 · sets up the app, CI and the test deploy | |
| 2 | Sign in with Google | Sign-in | Open the test URL and press Continue with Google: you land in the app with your name in the corner | 3 | 1 |
| 3 | See the list | Shared list | Sign in and open the list: three seeded items show, each with who added it | 4 | 2 |
| 4 | Add an item | Shared list | Type "milk" in the add box and press Enter: it shows at the top of the list with your name | 3 | 3 |
| 5 | Tick an item off | Shared list | Click the box next to an item: it's struck through, and still ticked after a reload | 2 | 3 |
| 6 | See a flatmate's tick | Shared list | Tick an item in a second browser: the first browser shows it within 5 seconds, without a reload | 3 | 5 |
| 7 | Shop with big tick boxes | Shared list | Press Shop mode on the list: the same items show with big tick boxes, unticked ones first | 2 | 5 |
| 8 | Sign out | Sign-in | Press Sign out in the corner: you're back on the sign-in screen, and the list won't open | 1 | 2 |
| 9 | Make a household | Household | Type "Flat 3" and press Create: the household screen shows the name with you as its one member | 4 | 2 |
| 10 | Copy the invite link | Household | Press Copy invite link on the household screen: a link is on your clipboard and the button says Copied | 2 | 9 |
| 11 | Join from an invite link | Household | Open the invite link in a second browser as another person and press Join: both of you show under Members | 3 | 10 |
| 12 | See only your own household's list | Shared list | Sign in as a person in a different household: none of the first household's items show | 4 | 3, 9 |
| 13 | Add a spend | Cost split | On Split, type 24.50, pick today and press Add: it shows in this month's spends with your name | 4 | 9 |
| 14 | See who owes whom | Cost split | With two members and one spend of 20.00, open Split: it says the other person owes the payer 10.00 | 3 | 11, 13 |

Notes for the `issues` skill:

- **Step 3 proves the core first.** Until step 12 merges, every signed-in tester sees the one seeded list. That is on the test site only; production shows "Coming soon". Step 12 moves every `list` read and write onto the caller's household through `check()`, and sends a person with no household to the Household screen. It is the step where `qa` checks that user B can't read or change user A's items.
- **Risky lane** (a migration or access): steps 2, 3, 9, 12 and 13. Those merges wait for the person, per `docs/stack.md`.
- **Side by side:** once step 2 is in, steps 3, 8 and 9 can start together. Once 3 and 9 are in, the list steps (4, 5, 12), the household steps (10) and the split steps (13) don't wait on each other.
- Steps 4 and 12 both touch `addItem`. Whichever merges second rebases.

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

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

## After the MVP: the hourglass

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (turn a recipe into list items), if still wanted | core |  |

## Open questions

Not blocking. Each has a default the build uses unless the person says otherwise.

1. **Which currency?** Default: one currency for the whole app, set once in config. Needed before step 13.
2. **Can anyone with the invite link join?** Default: yes in pass 1, with a fresh link in pass 2.
3. **Is one shared seeded list fine on the test site until step 12?** Default: yes. The other choice builds Household before the list, and the core shows up four steps later.

## Build order

- The skeleton :: Open the test URL and the starter page loads
- Sign in with Google :: Press Continue with Google and you land in the app with your name in the corner
- See the list :: Sign in and open the list to see three seeded items, each with who added it
- Add an item :: Type "milk" in the add box and press Enter, and it shows at the top of the list with your name
- Tick an item off :: Click the box next to an item and it's struck through, and still ticked after a reload
- See a flatmate's tick :: Tick an item in a second browser and the first browser shows it within 5 seconds without a reload
- Shop with big tick boxes :: Press Shop mode on the list and the same items show with big tick boxes, unticked ones first
- Sign out :: Press Sign out and you're back on the sign-in screen, and the list won't open
- Make a household :: Type "Flat 3" and press Create, and the household screen shows the name with you as its one member
- Copy the invite link :: Press Copy invite link on the household screen and the link is on your clipboard
- Join from an invite link :: Open the invite link in a second browser as another person and press Join, and both of you show under Members
- See only your own household's list :: Sign in as a person in a different household and none of the first household's items show
- Add a spend :: On Split, type 24.50, pick today and press Add, and it shows in this month's spends with your name
- See who owes whom :: With two members and one spend of 20.00, open Split and it says the other person owes the payer 10.00
