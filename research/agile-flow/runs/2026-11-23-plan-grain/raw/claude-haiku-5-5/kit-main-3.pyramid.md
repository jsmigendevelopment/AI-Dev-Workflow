# Tracer-bullet pyramid

Planned 2026-11-23, on Haiku 5.5: the model you chose (decision 5). Nothing is built. Pass 1 waits for your yes.

The routing table says the re-plan at each gate uses the strongest tier. Tell me if you want that changed.

## Slice 0: the skeleton

Applies `stack-tanstack-start` slice 0 (see that skill for the steps).

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: (filled in once the test site exists)
- [ ] A preview per pull request

## Slices

Only slices the core can't work without. Role: core, support, or insisted (a non-core must the person kept; pass 1 or 2 only).

| Slice | Role | What a person can do after pass 1 | Passes |
|---|---|---|---|
| Shared list | core | Add items, tick them, and see the other person's changes within about 10 seconds | 1, 2, 3 |
| Sign-in | support | Sign in with Google and sign out | 1 |
| Household | support | Make a household, invite by link, see who's in it | 1, 2 |
| Cost split | insisted (pending your answer, see Q1) | Add a shop's cost and see the month's even split and who owes whom | 1, 2 |

**Test:** does the core work without it? Sign-in and Household: yes, the list needs a signed-in person in a shared household, so they're in. Cost split: no. You listed it as a must, so it stays as `insisted`, capped at passes 1 and 2. Q1 asks you to confirm.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates sign in, share a household and one list, and split a shop | Slice 0, then Sign-in, Household, Shared list and Cost split, each thin | Each works end to end on a phone and a laptop. Empty, loading and error states are designed | building (not started) |
| 2 Real | The list is quick in the shop, and the household and money are right | Shared list, Household, Cost split | List: shop mode (big tick boxes, unticked first), remove an item, pending states on ticks. Household: leave, regenerate the invite link, personal data removed on leave. Cost split: switch months, edit and delete a spend, the penny rule, the currency | outline |
| 3 Ready | MVP complete on the test site | Shared list, then the whole app | List polished against the approved screens. Speed budgets met. axe clean on every screen in both themes. Noindex on test. Launch checklist written, not launched. A `qa` run and a `pr-security` review on the household and money changes | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is your call.

## Current pass: detail

Pass 1 is thin on purpose. Each issue below is one vertical slice: schema, server, and screen. Each ends with something you can try.

### Issue order and what each must do

**1. Skeleton: apply the stack pack and make `pnpm check` pass locally**
- Apply the `stack-tanstack-start` pack. Delete the example notes module, not rename it: the app doesn't need notes.
- Fill in "Commands that work here" in `AGENTS.md`, and the project facts.
- Draft checks:
  - SK-1 `pnpm check` passes on a clean clone.
  - SK-2 `pnpm new:module` makes a module that passes `pnpm check` as it comes out.

**2. Skeleton: GitHub and the test site on Cloudflare, with the first test deploy**
- Ask you to run `gh auth login` if needed. Then `setup-github.mjs` (dry run first, then your yes).
- `setup-cloudflare.mjs`: dry run, show you the output, then the real run, which makes the first test deploy (Coming soon page).
- Protection of the test URL follows your answer to Q2.
- Record the test URL in `AGENTS.md`.
- If the repo is GitHub Free and private, the pack's repository-variable mode applies. Tell you what that loses (no required reviewer on production).
- Draft checks:
  - SK-3 The test URL asks for the login you chose, or opens if you chose none.
  - SK-4 A merge to main deploys the test site, and its URL is in `AGENTS.md`.

**3. Skeleton: CI and a preview on the first pull request**
- Wire every key the stack needs by name, through the `secrets` skill. Values never go in chat.
- CI runs checks, Semgrep, the audit, licences, gitleaks, budgets, e2e and screenshots. The PR rules and the issue-link check run too.
- Draft checks:
  - SK-5 A pull request with no `Closes #n` fails `pr-rules`.
  - SK-6 A pull request gets a preview that answers 200 with the protection in place.

**4. Sign-in: Continue with Google, sign out, your name in the header**
- Adds the `users` table: Clerk id, display name, email. It's written at first sign-in.
- Adds the first seed script and two test users, so `qa` can sign in as two people. This is the first slice that adds a table.
- Screens: Sign in (one button, Continue with Google). Signed out, the list redirects to Sign in.
- Sign-in failure shows the designed error state: icon, title, message, next action, reference ID.
- You create the Google client and the Clerk test accounts through the `secrets` steps.
- Draft checks:
  - SI-1 WHEN a signed-out person opens the list THEN they see Sign in and no list.
  - SI-2 WHEN a person signs in THEN their name shows in the header and a `users` row exists.
  - SI-3 WHEN they sign out THEN the list is gone.
- Fence: no profile page, no account deletion. Personal data removal on leave is pass 2.

**5. Household: make one, invite by link, see members**
- Adds `households` (id, name, invite code, standard columns) and `members` (household id, user id). The invite code is random and not guessable.
- Make a household with a name. It shows the invite link with a copy button. Opening the link while signed out goes to Sign in, then joins.
- Members list shows display names.
- A non-member asking for a household's data gets a 404, not a 403, so ids don't leak.
- Adds the seed: two test users in one household.
- Draft checks:
  - HO-1 WHEN a second person opens a valid invite link THEN they join and both names show under Members.
  - HO-2 WHEN a non-member asks for the list or spends by id THEN they get a 404.
  - HO-3 WHEN the invite link is wrong THEN a designed error state shows, with a way back.
- Risky lane: the membership check is access control. `pr-security` reviews it, and you merge.

**6. Shared list (thin): add, tick, and see the other person's changes**
- Adds `items` (household id, name, added by, ticked at, standard columns).
- Add box at the top. Each row shows the name, who added it, and a tick box.
- Changes appear for the other person by polling every 5 seconds (design.md).
- Ticks are **not optimistic**: another person sees the tick at once, so the box shows a pending state until the server agrees. This follows the optimistic-write rule in the stack pack.
- Empty, loading and error states are designed. Each has a next action.
- Draft checks:
  - LI-1 WHEN person A adds an item THEN person B sees it within 10 seconds, without a reload.
  - LI-2 WHEN A ticks an item THEN B sees the tick within 10 seconds.
  - LI-3 WHEN the list is empty THEN the empty state says what to do next.
  - LI-4 WHEN a non-member tries to read or add items THEN they get a 404.
- Tests run as two browser contexts, two test users.

**7. Cost split (thin): add a shop, see the even split**
- **Waits for your answer to Q1 and Q3.** Money is not built on a guess.
- Adds `spends` (household id, paid by, amount in cents, currency, spent on, standard columns). Money is integer minor units with its currency.
- Form: amount, who paid (default you), date (default today).
- This month's spends are listed. The split shows each person's share and a net per person: owes or is owed.
- Rounding and currency follow Q3.
- Draft checks:
  - CS-1 WHEN a spend is added THEN both people see the same amounts, and the shares add up to the total exactly.
  - CS-2 WHEN there are three members and 1000 cents THEN the shares add up to 1000 (a property test).
  - CS-3 WHEN a zero, negative or too-long amount is entered THEN the field shows a specific error.
  - CS-4 WHEN a non-member asks for spends THEN they get a 404.
- Risky lane: money. `pr-security` reviews it, and you merge.

### Defaults I'll build with unless you object

- One household per person at a time.
- The split shows net per person, not a list of who pays whom.
- The month is the month of the spent date.
- Shop mode is pass 2. Say so if you need it in pass 1.
- Pass 1 has no remove, no leave and no edit. Those are pass 2.
- Anyone who is a member can invite others. There's no owner role in pass 1.

### Changes this plan needs in `docs/design.md`

`design.md` is not edited yet. These must go in before the issues are written:

1. Add a `users` table (Clerk id, display name, email). Members show names, and the floor says name and email are stored and removed on leave.
2. Add `invite_code` to `households`.
3. Every table gets `id`, `created_at` and `updated_at`. The generators add them. The design lists only feature columns.

## Open questions for you

Three now. Each has a recommendation. The rest are defaults above.

1. **Q1, cost split:** The list works without cost split, but you listed it as a must. Keep it in the MVP as an insisted slice, in passes 1 and 2? (Recommended: yes.)
2. **Q2, test site:** Who can see the test URL? (a) Cloudflare Access: Google plus a one-time PIN, for the people you name. Recommended. It's free to start, but Cloudflare may ask for a payment method, which is your call. (b) A password page: simpler, but everyone shares one password. (c) Nothing: anyone with the link can see it, and the data is real people's names and spends. Not recommended.
3. **Q3, money:** Which currency, and who takes the odd penny when a shop doesn't split evenly? Currency: (a) one per household, set when it's made. Recommended. (b) one fixed for the whole app. (c) several, with conversion, which is out of the MVP. Penny: (a) the person who paid takes it. Recommended. (b) the member who joined first takes it.

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
| 1 | Not chosen yet. Recipes is the only later feature in `features.md` | core | |

## Build order

- Skeleton: apply the stack pack and make `pnpm check` pass locally :: nothing
- Skeleton: GitHub and the test site on Cloudflare, with the first test deploy :: the test URL asks for the login you chose, or opens if you chose none
- Skeleton: CI and a preview on the first pull request :: nothing
- Sign-in: Continue with Google, sign out, your name in the header :: sign in with Google on the test site, see your name in the header, then sign out
- Household: make one, invite by link, see members :: make a household, copy the invite link, open it in a private window as the second test person, join, and see both names under Members
- Shared list: add, tick, and see the other person's changes :: add two items in one window; they show up in the other within about 10 seconds; tick one there
- Cost split: add a shop and see the even split :: add a shop you paid for; the split shows how much the other person owes you
