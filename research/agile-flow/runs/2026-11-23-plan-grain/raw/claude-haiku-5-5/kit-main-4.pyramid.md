# Tracer-bullet pyramid

Planned 2026-11-23 on Haiku 5.5 (the person's choice; see `docs/decisions.md` row 5). Nothing is built yet. Before the issues are written, re-check this plan on a stronger tier if the person wants the extra care.

## Slice 0: the skeleton

- [ ] The app runs locally, from the `stack-tanstack-start` pack (applied, not hand-built, if the pack is available)
- [ ] Every check-contract command works: `check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`
- [ ] Lint enforces the code rules a tool can check, including the boundary check (feature modules don't import each other)
- [ ] The module, route, section and component generators work; their command is in "Commands that work here" in `AGENTS.md`
- [ ] Shared base, from `guide/app-conventions.md`: error envelope with request IDs, structured logs through the logger, `/health`, `/api/v1`, UTC times, money as integer cents with currency, standard ID and timestamp columns, audit log, feature flags, `object_action` event names, breakpoints and type scale in the tokens, `copy.ts` per module
- [ ] CI runs on every pull request: checks, secret scan, agent-file guard, issue-link check
- [ ] Main deploys to test. Test URL goes in `AGENTS.md` and below. A preview per pull request, if the host offers one
- [ ] Keys wired through the `secrets` skill: Clerk and Cloudflare. Check both free tiers first; anything paid needs the person's yes
- [ ] GitHub set up for the person (`setup-github.mjs --dry-run` first, then a plain "Set this up now?" to them)

Test URL: _(filled in when slice 0 deploys)_

## Slices

Role: `core` = the product. `support` = the core can't work without it. `insisted` = none yet.

| Slice | Role | Why it's in |
|---|---|---|
| Shared list (live, with shop mode) | core | The MVP core, from `docs/decisions.md` row 2 |
| Sign-in (Google, through Clerk) | support | Nobody can share a list without knowing who they are |
| Household (make, invite, join, members-only) | support | The list and spends belong to a household |
| Cost split (add a spend, month split) | support | The MVP's second "done when" |

Not in the MVP: recipes, shop suggestions, receipts by photo (`docs/mvp.md`).

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. Pass 1 is `building`.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates share a list and split a month | slice 0, then sign-in, household, shared list, shop mode, cost split | Thin and working end to end. Every main-flow screen from the wireframes exists, with its empty, loading and error states. Live update is a 5-second poll | building |
| 2 Real | The app is usable for a real month | core + household + cost split | Shared list: ticks show who ticked and when; items can be edited and removed; a tick is optimistic and rolls back with a clear message on failure. Shop mode: sorted, big targets, usable on a slow connection. Household: leaving removes the leaver's name and email; the invite link can be reset. Cost split: month view, who owes whom, edit or delete your own spend | outline |
| 3 Ready | MVP complete on the test site | core, then the whole app | Core polished: WCAG 2.2 AA on every screen, reduced motion, the list fits a phone, error copy with a reference ID, speed budget met. Sign-in page has basic SEO. Access and money paths get a fresh security audit. Launch checklist written, Coming soon page left on | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call, and `AGENTS.md` lists it as an always-stop.

## Current pass: detail

### Shared design (decided here, used by every pass 1 slice)

- **Schema:** as `docs/design.md`, plus three small additions the screens need:
  - `households.currency` (text, one per household). See question 1.
  - `households.list_version` (integer). Bumped on every change to the list. The poll reads only this number, so the list is re-read only when it changes. See the cost note below.
  - `invites` (id, household_id, token_hash, created_by, expires_at). The invite link carries a random token. Only its hash is stored, so a link can be revoked. Options:
    1. Table with hashed tokens, revocable (**recommended**): one more table, full control.
    2. Signed token with no table: no storage, but a leaked link can't be revoked before it expires.
    3. One fixed link per household: simplest, no way to shut it off.
- **Access:** membership is checked in the shared access layer through `check()`, never by one feature module importing another. The list and split modules ask `check()` whether the signed-in user is a member of the household they're reading. Non-members get a not-found page, not a "you're not allowed" page, so they can't tell a household exists.
- **Live update:** a 5-second poll of `households.list_version`. If it changed, the client fetches the list. Cost note: four flatmates polling every 5 seconds is about 69,000 reads a day per household if each poll reads one row. Reading the whole list on every poll would be several million rows a day. Check the current D1 free-tier read limit before the list issue is written; this design keeps the app inside it.
- **Seed and test users:** the household issue adds a seed script and two test users (two members in one household), so `qa` can sign in and check that one user can't see another household's data.
- **Money:** `spends.amount_cents` (integer) and `spends.currency`. Split uses the household's currency only.

### 1. Slice 0: the skeleton

- **Depends on:** nothing.
- **Must do:** everything in the slice 0 checklist above.
- **Done when:** `check` passes on main, main deploys to test, and `/health` answers on the test URL.
- **Lane:** safe.

### 2. Sign-in

- **Depends on:** slice 0.
- **Must do:** the sign-in screen (one button, Continue with Google). Sign-out. Signed-out users who open any app page are sent to sign-in and back.
- **Done when:** a test user can sign in with Google on the test site, sign out, and is kept out of pages when signed out.
- **Lane:** risky (authentication). Person merges.

### 3. Household, seed data and members-only access

- **Depends on:** sign-in.
- **Must do:**
  - Household screen: make a household (name, currency per question 1), copy the invite link, see the members listed.
  - Joining from an invite link: sign in if needed, then join. An expired or revoked link shows a clear message with a next step.
  - Members-only: the access check in the shared layer, used by this module's own pages.
  - Seed script and two test users.
- **Done when:** a second Google account joins from the link and both see the same members. A signed-in user who isn't a member gets not-found for that household.
- **Lane:** risky (access). Person merges.
- **Blocker:** question 1 changes the Household screen. Confirm the currency answer, then send the change through `wireframes` for approval before this issue is written.

### 4. Shared list (core)

- **Depends on:** household.
- **Must do:**
  - The List screen: items, who added each, a tick box, an add box at the top.
  - Empty, loading and error states, designed (icon, title, specific message, next step, reference ID).
  - Adding an item and ticking it off, through `list_version`, polling every 5 seconds.
- **Done when:**
  - Two browsers in one household: an item added in one appears in the other within about 5 seconds.
  - A tick in one shows in the other without a reload.
  - A non-member gets not-found for the list.
  - A Playwright test does the two-browser check in `test:e2e`.
- **Lane:** risky (reads and writes household data through the access check). Person merges.

### 5. Shop mode

- **Depends on:** shared list.
- **Must do:** the Shop mode screen. The same list with big tick boxes, unticked items first.
- **Done when:** on a phone-sized viewport, every item can be ticked with a thumb and the unticked items sit at the top.
- **Lane:** safe (UI only, same module, same access check).

### 6. Cost split

- **Depends on:** household. Can be built beside slice 4, since it's a separate module.
- **Must do:** the Split screen: this month's spends, an add-a-spend form (amount, paid by, date), the month's total, and each person's even share.
- **Odd penny rule (question 2):** leftover cents go to the earliest-joined member, so the split is deterministic.
- **Done when:** a £20 spend paid by one of three members shows a total of 20.00 and each person's share is computed in integer cents, with the odd penny rule applied and tested.
- **Lane:** risky (money). Person merges.

### Order and parallel work

1 → 2 → 3 → then 4 and 6 can run in parallel → 5 after 4.

## Questions for you

These don't block slice 0. Questions 1 and 2 must be answered before the household and split issues are written.

1. **Currency: which money do the flatmates use?**
   - a. One currency per household, picked when it's made (**recommended**). Adds a field to the Household screen, so it goes back through `wireframes`.
   - b. One currency for the whole app, fixed in the code. Simplest, but not right if a flat is abroad.
   - c. Mixed currencies with conversion. Out of MVP scope.
2. **Odd pennies: where does the leftover go when a spend doesn't split exactly?**
   - a. To the earliest-joined member (**recommended**): always the same, easy to check.
   - b. Round every share to the nearest whole unit: easy to read, but the total can be off by a unit.
   - c. Show the leftover as its own line: honest, but one more thing on the screen.
3. **Someone leaves with money owed: what happens to their spends?**
   - a. Keep the spends and show "Former flatmate" (**recommended**). Their name and email are removed, as the floor says; the totals don't change.
   - b. Block leaving until the month is settled. Safe for the money, but it can trap someone.
   - c. Delete their spends too. Changes everyone else's totals, so I'd advise against it.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Re-plan |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Debt

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

## After the MVP: the hourglass

<!-- One row per layer. Each layer: new features (each in thin) plus a pass on what's already there (the core every layer). Plan one layer at a time; the gate runs between layers. -->

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 |  | core |  |

## Build order

- Slice 0: the skeleton :: The test URL loads a placeholder page, and `/health` answers "ok"
- Sign in with Google :: Click Continue with Google, come back signed in, and sign out again
- Household: make it, invite by link, join, members only :: Make a household, copy the link, open it in a private window signed in as the second test user, join, and see the same members
- Shared list: add, tick, live every 5 seconds :: Open the list in two windows, add an item in one, see it in the other within about 5 seconds, then tick it there
- Shop mode: big tick boxes, unticked first :: Open Shop mode on a phone-sized window and tick items with the big boxes; unticked items sit at the top
- Cost split: add a spend, see the month's total and each even share :: Add a 20.00 spend paid by one flatmate and see the total and each person's share
