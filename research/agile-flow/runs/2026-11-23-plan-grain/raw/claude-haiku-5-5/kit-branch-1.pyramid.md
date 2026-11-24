# Tracer-bullet pyramid

Planned 2026-11-23 on claude-haiku-5-5, the model the person chose (decision 5). Inputs: `docs/vision.md`, `docs/mvp.md`, `docs/design.md`, `docs/architecture.md`, `docs/stack.md`, `docs/features.md`, approved wireframes (decision 3).

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: 
- [ ] A preview per pull request (if the host offers one)

## Slices

Only slices the core can't work without. Role: core, support, or insisted (a non-core must the person kept; pass 1 or 2 only). A slice is a column of the pyramid. Each pass cuts it into steps, below.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items to a household's list, tick them off, and see a flatmate's changes within 5 seconds |
| Sign-in | support | Sign in with Google; signed-out visitors land on Sign in |
| Household | support | See your flatmates; a list from another household stays hidden |
| Cost split | insisted | Add a shop cost; see who owes whom for the month, split evenly |

Cost split fails the "does the core work without it?" test, so it is `insisted`, not core. The person listed it in `docs/mvp.md` and wrote it into "Done when" 2. See question 1.

## Open questions for the person

1. **Cost split in the MVP?** The core works without it, so by the rule it's not MVP. Recommended: keep it as an insisted slice, planned for pass 2 at the latest. It's in your "Done when" 2, and this plan already gives it two steps in pass 1. Alternative: drop it from the MVP and make it layer 1 after launch, which shortens the MVP by two steps.
2. **Which currency?** Recommended: one currency per household, picked when the household is made. Tell me the currency you shop in and I'll put it in the schema.
3. **How fresh must the list be?** Recommended: refresh every 5 seconds in pass 1, as `docs/design.md` says. It's simple and needs no extra service. Alternative: live push from the start, which takes longer to build and needs a paid real-time service. Push can come in pass 3 if it's worth it.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. More than 3 passes needs a `decisions.md` row; never more than 4.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Works: one household, its list live between two flatmates, a shared cost split evenly | slice 0, then every MVP slice | Shared list: add, tick, see flatmates' changes within 5 seconds. Sign-in: Google, redirect when signed out. Household: members shown, other households hidden. Cost split: add a spend, see the even split. All thin and working end to end. | building |
| 2 Real | Real: the core works the way a flat really shops | core + supports | Shared list: shop mode (big tick boxes, unticked first), empty, loading and error states. Household: make a household and join by invite link. Sign-in: delete my data and leave a household. Cost split: edit or delete a spend, month rollover, the currency from question 2. | outline |
| 3 Ready | Ready: MVP complete on the test site | core, then the whole app | Polish the core. Speed (prerendered HTML, JS budget), accessibility, SEO basics, the launch checklist. Live push instead of polling, if question 3 says so. | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Current pass: steps

<!-- Only the pass marked building. One row per step, in build order. One step is one issue and one pull request.
     Try it: what the person does on the test site, and what they see. No try line, no step.
     Size: the issue's complexity, 1 to 10. 4 or under is thin. A 5 to 7 says why it can't be cut: "5 · <reason>". At most one step in three.
     After: the numbers of the steps that must merge first. Empty when none.
     Check it: node .agents/skills/pyramid/scripts/check-plan.mjs docs/pyramid.md -->

| # | Step | Slice | Try it | Size | After |
|---|---|---|---|---|---|
| 1 | The skeleton | slice 0 | Open the test URL: the starter page loads | 5 · sets up the app, CI, the test deploy and the shared pieces the stack pack needs; slice 0 is one step by design | |
| 2 | Sign in with Google | Sign-in | Click Continue with Google, sign in, and see your name at the top of the page | 5 · wires the login provider and its keys through `secrets`; can't be cut smaller | 1 |
| 3 | Signed-out visitors go to Sign in | Sign-in | Open the List page in a private window: you land on Sign in | 2 | 2 |
| 4 | Household shows your flatmates | Household | Sign in as a test user: Household lists both flatmates by name. Adds the `households` and `members` tables, and a seed script with three test users: two flatmates and one in another household | 4 | 2 |
| 5 | See the shared list | Shared list | Open List: the seeded items show, each with who added it. Adds the `items` table | 4 | 4 |
| 6 | Another household's list stays hidden | Household | Sign in as the test user from the other household and open List: no items from your household show | 3 | 5 |
| 7 | Add an item | Shared list | Type "milk" and press Enter: it shows at the top of the list | 3 | 5 |
| 8 | A flatmate sees a new item | Shared list | Add "milk" in one browser: the other flatmate's List shows it within 5 seconds, with no reload. This is the riskiest idea in pass 1 | 3 | 7 |
| 9 | Tick an item off | Shared list | Click the box next to "milk": it's struck through, and it stays struck through after a reload | 2 | 7 |
| 10 | A flatmate sees a tick | Shared list | Tick "milk" in one browser: the other flatmate's browser shows it struck through within 5 seconds | 3 | 8, 9 |
| 11 | Add a shop cost | Cost split | Type a shop cost and press Add: it shows under this month's spends. Adds the `spends` table | 3 | 4 |
| 12 | See who owes whom | Cost split | With two spends by two flatmates, the Split page shows the even split and who owes whom | 4 | 11 |

Steps 1 and 2 are the two big ones: 2 of 12, under one in three. Median size 3.

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

<!-- One row per layer. Each layer: new features (each in thin) plus a pass on what's already there (the core every layer). Plan one layer at a time; the gate runs between layers. -->

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Recipes (`later` in `docs/features.md`; not yet chosen) | core | |

## Build order

- The skeleton :: Open the test URL: the starter page loads
- Sign in with Google :: Click Continue with Google, sign in, and see your name at the top of the page
- Signed-out visitors go to Sign in :: Open the List page in a private window: you land on Sign in
- Household shows your flatmates :: Sign in as a test user: Household lists both flatmates by name
- See the shared list :: Open List: the seeded items show, each with who added it
- Another household's list stays hidden :: Sign in as the test user from the other household and open List: no items from your household show
- Add an item :: Type "milk" and press Enter: it shows at the top of the list
- A flatmate sees a new item :: Add "milk" in one browser: the other flatmate's List shows it within 5 seconds, with no reload
- Tick an item off :: Click the box next to "milk": it's struck through, and it stays struck through after a reload
- A flatmate sees a tick :: Tick "milk" in one browser: the other flatmate's browser shows it struck through within 5 seconds
- Add a shop cost :: Type a shop cost and press Add: it shows under this month's spends
- See who owes whom :: With two spends by two flatmates, the Split page shows the even split and who owes whom
