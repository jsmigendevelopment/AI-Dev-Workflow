# Pyramid

The build plan. Each pass goes through every slice that still has passes left, and each pass ends with something the whole flat could use. Pass 1 is planned in detail. Passes 2 and 3 are outlines and get their detail when the pass before them is merged.

Sources: `vision.md`, `mvp.md`, `features.md`, `design.md`, `architecture.md`, `stack.md`, and the wireframes approved on 2026-11-21 (decision 3).

## The passes at a glance

| Slice | Role | Pass 1 | Pass 2 | Pass 3 |
|---|---|---|---|---|
| Shared list | core | Add, tick, see who added, updates by 5-second polling | Shop mode, instant ticks, remove and clear items | True live push, holds up on bad shop signal |
| Sign-in | support | Google through Clerk, complete | | |
| Household | support | Make one, invite link, join, see members | Leave (removes your data), rename, new invite link | |
| Cost split | support | Add a spend, this month's spends, who owes whom | Edit and delete spends, earlier months, fair split when someone joins mid-month | |

After pass 1 both "Done when" checks in `mvp.md` can be shown on the test site in their plainest form. The MVP is not done until pass 3, because the core is "live while someone shops", and the personal-data floor item (leaving removes you) lands in pass 2.

## How pass 1 is cut

- **One issue is one thing you can try.** Each issue carries its own table changes, server functions, screen and tests. There are no "schema only" or "API only" issues, so nothing sits merged and invisible.
- **Six issues, in a line.** Each one builds on the one before, so they are merged in order. List and Split both depend only on Household and could swap places, but the list is the core, so it goes first.
- **Risky lane.** `stack.md` says a person merges the risky lane. In pass 1 that is issues 2 and 3: they decide who is signed in and who can see which household. The rest merge under the loop.
- **Move fast.** One happy-path Playwright test per issue, Vitest for the logic that can be wrong quietly (access checks, split maths). No more than that.

## Pass 1 in detail

### 0. Set up the app and the test site

The loop does this later; it is listed here so the order is whole.

- TanStack Start app on Cloudflare Workers, D1 with Drizzle and a first empty migration, shadcn/ui, Vitest and Playwright wired up.
- Folders as in `architecture.md`: `list`, `household`, `split`, each with route, service, repository. One `shared` folder for what all three need (signed-in user, membership check, db). Modules import `shared`, never each other.
- Two environments: local, and a test site with its own D1 database. Every merge to `main` deploys to the test site and runs migrations.
- CI on every pull request: typecheck, lint, Vitest, Playwright.
- A home page that says "flatshare" so the deploy can be seen.

**Needs from you before this issue can finish:** a Cloudflare account and API token, and a Clerk app with Google turned on (its keys go into the test site's secrets).

**Done when:** the test site URL opens and CI is green on an empty pull request.

### 1. Sign in with Google

Screen: Sign in. This is the whole Sign-in slice (one pass).

- One button, "Continue with Google", through Clerk.
- Every page other than Sign in sends a signed-out visitor to Sign in, then back to where they were going. This matters for invite links in issue 2.
- A sign-out control in the header, with the signed-in name.
- A `shared` helper that server functions call to get the current user or refuse. Nothing reads the user any other way.

**Not in this issue:** other sign-in methods, profile editing, account deletion (leaving a household covers data removal, in pass 2).

**Tests:** Vitest: the helper refuses when there is no session. Playwright: a signed-out visit to a protected page lands on Sign in.

**Done when:** you can sign in with Google on the test site, see your name, and sign out. *Risky lane.*

### 2. Household: make one, invite, join

Screen: Household.

- Tables: `households` (id, name, invite_token, created_at), `members` (household_id, user_id, name, email, joined_at). `invite_token`, `name` and `email` are additions to the schema in `design.md`: the token is the invite link, and name and email are what the list needs to show "who added each". They are copied from Clerk when a person joins.
- Signed in with no household: a form to name and make one. You become its first member.
- Signed in with a household: its name, the members listed, and a "Copy invite link" button.
- Opening an invite link: signed out goes through Sign in first, then lands on a "Join <name>" confirm. Joining adds you as a member.
- One household per person in pass 1. Opening an invite while already in a household says so and does nothing.
- The access rule, built here once: a `shared` `requireMember` check that returns the caller's household or refuses. Every list and split server function in later issues goes through it. Household ids are never trusted from the browser.

**Not in this issue:** leaving, removing a member, renaming, replacing the invite link, more than one household.

**Tests:** Vitest: `requireMember` refuses a non-member; a bad token joins nothing; joining twice makes one row. Playwright: one person makes a household, a second joins from the link, both see two members.

**Done when:** two Google accounts end up in the same household on the test site, and a third account that has not joined cannot see it. *Risky lane.*

### 3. Shared list: add, tick, see it on the other phone

Screen: List. The core's first pass, and the first check in "Done when".

- Table: `items` (id, household_id, name, added_by, created_at, ticked_at).
- An add box at the top. Enter adds the item and clears the box. Blank names are refused; names are trimmed and capped at 100 characters.
- Each row: tick box, name, who added it. Unticked first, newest first; ticked items below, struck through. Ticking again unticks.
- Live: the list refetches every 5 seconds and when the tab regains focus. Your own add or tick shows after the server answers (instant ticks are pass 2).
- States from the wireframe: empty ("Nothing on the list yet"), loading, and error with a retry.
- No household yet: the List page sends you to Household.
- The List becomes the home page for a signed-in member.

**Not in this issue:** Shop mode, removing or editing an item, clearing ticked items, quantities, ordering by aisle, push updates.

**Tests:** Vitest: a member of one household cannot read, add to, or tick another household's items. Playwright: two browser sessions in one household; one adds and ticks, the other sees both within the poll, with no reload.

**Done when:** on two phones in the same household, an item added and ticked on one shows on the other within about 5 seconds.

### 4. Split: add a spend, see who owes whom

Screen: Split. The second check in "Done when".

- Table: `spends` (id, household_id, paid_by, amount_cents, currency, spent_on, created_at).
- Add-a-spend form: amount, date (today by default). The payer is whoever is signed in. Amounts are typed as money (12.50) and stored as cents; zero, negative and non-numbers are refused.
- This month's spends listed, newest first: who paid, how much, when. "This month" is the calendar month of `spent_on`, taken as the date typed, with no time-zone conversion.
- Who owes whom: the month's total divided evenly among the household's current members. Leftover cents go one each to members in a fixed order, so the shares always add up to the total. Then the fewest plain payments that settle it, shown as "Ana owes Ben 12.40".
- Currency: the column exists, but pass 1 writes one fixed currency for the whole app and shows no picker. Tell me which currency before this issue starts; I'll default to EUR.
- The split maths is a pure function in the `split` service with no database in it, so it can be tested hard.

**Not in this issue:** editing or deleting a spend, earlier months, uneven shares, marking a debt as paid, someone joining or leaving mid-month (pass 1 splits among whoever is a member now), linking a spend to a shopping trip.

**Tests:** Vitest on the pure function: one payer of four; everyone paid the same (nobody owes); totals that don't divide evenly; a single-member household; shares always sum to the total. Vitest: a non-member cannot read or add spends. Playwright: add a spend, see it listed and the debts change.

**Done when:** two members each add a spend on the test site and both see the same "who owes whom", which matches a sum done by hand.

### 5. Join it up: getting around, and a full walk-through

No new screen. This closes the pass.

- Navigation between List, Split and Household on every signed-in page, usable with a thumb on a phone.
- First-run path without dead ends: sign in, then make or join a household, then land on the List.
- One Playwright test that walks the whole of `vision.md`'s main flow with two people: sign in, make a household, join by link, add items, tick, add a spend, read who owes whom.
- Fix what the walk-through turns up. Update `state.md` and mark the pass 1 features in `features.md`.

**Done when:** a new flatmate with only the invite link gets from the link to a ticked item and a recorded spend on their phone without being told where to tap.

### What pass 1 leaves rough, on purpose

- Updates lag by up to 5 seconds, and your own tick waits for the server.
- No Shop mode screen yet; shopping is done from the plain List.
- Nothing can be deleted or edited: items, spends, or membership.
- One household per person, one currency, this month only.

## Pass 2 in outline

- **Shared list:** the Shop mode screen (big tick boxes, unticked first); ticks and adds show instantly and roll back on failure; remove an item; clear ticked items.
- **Household:** leave a household, which removes your name and email (the personal-data floor item); rename; replace the invite link.
- **Cost split:** edit and delete your own spends; look at earlier months; split a month among the people who were members during it.

## Pass 3 in outline

- **Shared list:** replace polling with push so a tick shows at once; keep ticking on a bad signal in the shop and sync when it returns; show when the list was last in sync. The way to push on Workers (most likely a Durable Object per household) is decided at the start of this pass, not now.
- Then check both "Done when" lines in `mvp.md` on real phones in a real shop.

## Open points

- Currency for pass 1 (see issue 4). Default: EUR.
- Cloudflare and Clerk accounts are needed before issue 0 can finish.

## Build order

- Set up the app and the test site :: Open the test site address and see a page that says flatshare
- Sign in with Google :: Sign in with your Google account, see your name in the header, and sign out again
- Household: make one, invite, join :: Make a household, copy the invite link, open it in a second Google account, and see both of you listed as members
- Shared list: add, tick, see it on the other phone :: Add and tick items on one phone and watch them show up on a flatmate's phone within about 5 seconds without reloading
- Split: add a spend, see who owes whom :: Type in what a shop cost from two accounts and see this month's spends and who owes whom
- Join it up: getting around, and a full walk-through :: Start from just an invite link on a new phone and get through joining, ticking an item, and adding a spend using only the on-screen navigation
