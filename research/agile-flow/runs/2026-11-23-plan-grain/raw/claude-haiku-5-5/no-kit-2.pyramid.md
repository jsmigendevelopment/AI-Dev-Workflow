# Build pyramid

This is the plan for the build. Nothing is built yet. Each layer rests on the one below it. The top is the goal; the base is the scaffolding everything else stands on.

```
        Goal: the MVP (live shared list + even monthly split)
       ─────────────────────────────────────────────────────
      Pass 1 slices: sign-in, household, shared list, cost split
     ───────────────────────────────────────────────────────────
    Access rules: only members see a household's data; leaving removes personal data
   ──────────────────────────────────────────────────────────────────────────────────
  Data: households, members, users, items, spends (D1 + Drizzle migrations)
 ──────────────────────────────────────────────────────────────────────────────
Base: TanStack Start on Cloudflare Workers, Clerk, tests (Vitest, Playwright), CI, test-site deploy
```

## Sources

- Vision and main flow: `docs/vision.md`
- MVP slices and done-when: `docs/mvp.md`
- Features and floor checklist: `docs/features.md`
- Screens and schema: `docs/design.md`
- Module rules: `docs/architecture.md`
- Stack and automation level: `docs/stack.md`
- Decisions 1–5: `docs/decisions.md`

## Base: slice 0

Scope:

- Scaffold TanStack Start for Cloudflare Workers, with shadcn/ui.
- Wire D1 through Drizzle, with an empty first migration.
- Set up Vitest and Playwright, each with one passing smoke test.
- Add CI that runs lint, typecheck, unit and e2e tests on each PR.
- Deploy `main` to the test site on each merge.
- Add the Clerk client and server keys as environment config. No sign-in UI yet.

Done when: the test site serves the starter page over HTTPS, and CI is green on a PR.

Needs you: a Cloudflare account, the D1 database created, a deploy token for CI, and a Clerk development instance. I can scaffold without these, but the deploy and Clerk steps will wait for them.

## Data

Tables, taken from `docs/design.md`, with one addition:

- `households` (id, name)
- `members` (household_id, user_id)
- `items` (household_id, name, added_by, ticked_at)
- `spends` (household_id, paid_by, amount_cents, currency, spent_on)
- **`users` (id, name, email)**. New. The floor checklist says name and email are stored, but `design.md` has no table for them. Clerk is the source; the row is upserted at sign-in so the list can show who added an item. Leaving a household deletes the user's row only if they belong to no other household.

Decision for you: is a `users` table acceptable, or should name and email be read from Clerk on every request?

Pass 1 assumes one currency per household. `spends.currency` is stored, but the split does not convert between currencies.

## Access rules

- Every household query goes through one membership check, in one place, before the feature modules are called. A non-member gets not-found, never a 403 that confirms the household exists.
- `architecture.md` says feature modules do not import each other. The split needs the member list, and the list needs the membership check. I plan to have the route layer pass the member list into the split service, and to put the membership check in a small shared `platform/` folder that holds session and auth code, not a feature module. Confirm this placement.

## Pass 1 slices

Pass counts are from `docs/mvp.md`. Pass 1 is the thinnest working path through each slice. What falls outside pass 1 is listed at the end.

### Sign-in (1 of 1 pass)

- Sign-in screen with one button, Continue with Google, through Clerk.
- Signed-out visitors are redirected to sign-in from every page except the sign-in page.
- Sign-out.

### Household (1 of 2 passes)

- Make a household (name it), which makes the creator its first member.
- Household screen: members listed, invite link copied with one button.
- Joining from an invite link. The link carries an unguessable token, stored hashed, that can be revoked. Expiry is out of scope for pass 1.
- Leave household, which removes the membership and, per the floor checklist, personal data as described under Data.

### Shared list (1 of 3 passes)

- List screen: items with the name of who added each, a tick box per item, and an add box at the top.
- Adding and ticking write to the server and return the new state.
- Live updates by polling every 5 seconds, as `docs/design.md` says for pass 1.
- Empty, loading and error states.

Not in pass 1: shop mode (the big-tick-box screen, unticked first). It is the second list pass.

### Cost split (1 of 2 passes)

- Split screen: this month's spends, an add-a-spend form (amount, paid by, date, currency), and who owes whom.
- The split is even across all current members for the month of each spend. It is computed on read, not stored.
- Month navigation past the current month is out of scope.

## Test plan

- Vitest: the membership check, the split arithmetic (including odd cents), the invite-token check, and the list state logic.
- Playwright: one flow with two browser contexts signed in as two accounts. It covers join, add, tick and see the tick appear without reload, add two spends, and check the owes figures.
- Clerk in tests: uses the development instance and test users. Needs the Clerk setup from slice 0.

## Done when (pass 1)

1. Two flatmates sign in, one makes a household, the other joins from its link.
2. A tick by one shows for the other within 5 seconds, without a reload.
3. Two spends in one month are split evenly, and the owes figures match a hand calculation.
4. A signed-in non-member gets not-found for the household's list.
5. Leaving a household removes that person's membership and personal data.

## Automation and merges

- Automation level: recommended. Loop on.
- Risk dial: move fast.
- Merges in the risky lane are yours. I'd put these in the risky lane: sign-in, the membership check, the invite token, leave-and-delete, and the schema migration. Everything else I merge through the loop once CI is green.

## Open decisions

1. `users` table, or read name and email from Clerk each time (see Data).
2. Shared `platform/` folder for the membership check, or another home (see Access rules).
3. One currency per household in pass 1.
4. "The test site" is the Cloudflare deploy of `main`. The docs don't name it. Tell me if it's somewhere else.

## Build order

- Slice 0: scaffold, tooling, CI and test-site deploy :: Open the test site and see the starter page load over HTTPS.
- Schema and first migration for households, members, users, items and spends :: nothing
- Sign-in with Google through Clerk, with signed-out redirect and sign-out :: Click Continue with Google, sign in, land on the signed-in page, then sign out.
- Membership check on household data :: Signed in as a non-member, open a household's list address; you should see a not-found page.
- Household: make one and copy its invite link :: Make a household, copy the invite link, and see yourself listed as its only member.
- Household: join from an invite link :: Open the copied link in a private window, sign in as a second account, join, and see both members listed.
- Household: leave and remove personal data :: Leave from the second account; the household disappears from its screen and the first account no longer lists that person.
- Shared list: add items and show who added each :: Add an item in one browser and see the name of the person who added it.
- Shared list: tick items with live updates every 5 seconds :: Tick an item in one browser and see it ticked in a second browser in the same household within about 5 seconds, without reloading.
- Shared list: empty, loading and error states :: Open a new household's list and see the empty message; turn off the network and reload to see the error state.
- Cost split: add a spend :: Add a spend with an amount, a payer and a date, and see it in this month's list.
- Cost split: even monthly split and who owes whom :: Add two spends from two accounts in one month and check the owes figures against a hand calculation.
