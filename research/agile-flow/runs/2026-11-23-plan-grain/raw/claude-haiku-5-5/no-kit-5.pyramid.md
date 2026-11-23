# Pyramid

The build comes in passes. Each pass is a thin cut through every layer (route, service, repository, UI, tests) for the slices it touches. Later passes widen the cut. The base is the first pass: a working, deployed app with the smallest real version of each slice.

Sources: `docs/mvp.md` (slices and passes), `docs/design.md` (screens, schema, API), `docs/architecture.md` (module rules), `docs/stack.md`.

## The pyramid

| Slice | Pass 1 | Pass 2 | Pass 3 |
|---|---|---|---|
| Sign-in | Google through Clerk, sign out | nothing new | nothing new |
| Shared list | Add, tick, untick, poll every 5 s, one account | Shop mode, multi-member reads | Polish and the two-flatmate check |
| Household | Auto-created household per account, no invites | Invite link, join, members list, leave | nothing new |
| Cost split | nothing | Spends, add-a-spend form, monthly even split, who owes whom | nothing new |

Pass 1 is the base. Nothing outside it is built in pass 1.

## Pass 1 in detail

### Goal

A signed-in person can open the list, add items, tick them off, and see a tick made in another window appear within about 5 seconds, without a reload. Every visible part of this runs through the real route, service, repository, and database.

### In scope

- Slice 0: the app skeleton, deploy, and test runners (set up by the loop, see `docs/state.md`).
- Google sign-in and sign-out through Clerk.
- One household per account, created on first sign-in, with the account as its only member.
- The list: items table, add, tick, untick, empty/loading/error states, polling.
- Playwright tests for the flow.

### Out of scope for pass 1

- Invite links and more than one member (household pass 2).
- Shop mode (list pass 2).
- Spends and the split (cost split pass 2).
- Leaving a household and deleting data (household pass 2). Pass 1 stores only what it needs (see the floor below).

### Choices made here

- **One household per account in pass 1.** The MVP's done-when check needs two flatmates sharing a list, which needs invites. Pass 1 avoids that by giving each account its own household, so pass 1 tests use one account in two windows. The list code still reads the household through the same path it will use later, so pass 2 only adds the join flow.
- **`members` gets a `display_name` column.** `design.md` lists `members (household_id, user_id)`. "Added by" needs a name to show, and calling Clerk on every render is slower and fragile. The name is copied at sign-in. This is a change to the schema in `design.md`; record it in `docs/decisions.md` when the issue merges.
- **`added_by` holds the Clerk user id**, not the name.
- **A small shared session module** (`src/shared/session`) returns the signed-in user and their household id. `list` uses it, so `list` never imports `household`, which keeps the rule in `docs/architecture.md`. Pass 2's `household` module can use it too.
- **Polling, not push.** `design.md` says polling every 5 seconds in pass 1. The list refetches on that interval and stops when the tab is hidden.
- **Ticks are a timestamp.** `ticked_at` is set on tick and cleared on untick. Ticked items sort last.
- **Tests:** Vitest for the service and repository logic; one Playwright test per visible issue; a final Playwright test for the whole pass 1 flow.

### Floor for pass 1

- Sign-up and sign-in: Google through Clerk (default, from `docs/features.md`).
- Who can see or change the list: only members of the household. In pass 1 that is the account itself. Every list query filters by the signed-in household id.
- Personal data: pass 1 stores the Clerk user id and a display name. No email is copied into our database. Deletion of these rows comes with household pass 2, when leaving is built.

### Issues for pass 1, in order

Each issue is one merged PR. Each one leaves the app deployable and the tests green.

1. **Scaffold the app and CI.** TanStack Start on Workers, D1 with Drizzle and an empty migration, Clerk keys read from env, shadcn/ui set up, Vitest and Playwright running in CI, folders `src/list`, `src/household`, `src/split` each with route, service, and repository stubs, plus `src/shared/session`. Deploys to the test site. Nothing to see yet.
2. **Sign in with Google.** Sign-in page with one button, Continue with Google. Sign-out. Signed-out visitors are sent to sign-in. Lands on the list page, which is empty for now.
3. **One household per account, made at first sign-in.** Creates `households` and `members` rows (with `display_name`) on first sign-in, once. The list page header shows the household name. `shared/session` returns the household id.
4. **Add items to the list.** `items` table and migration (`household_id`, `name`, `added_by`, `ticked_at`). Add box at the top, list shows each item with who added it. Empty, loading, and error states. Service checks the household id on every call.
5. **Tick and untick items.** Tick box on each row sets `ticked_at`; untick clears it. Ticked items move to the bottom. Error shows if the save fails and the box reverts.
6. **Live list updates by polling.** Refetch every 5 seconds while the tab is visible. Changes from another window show without a reload. Stops polling on sign-out.
7. **Playwright test for the pass 1 flow.** Sign in, add two items, tick one, open a second window on the same account, check the tick appears there within 10 seconds. Runs in CI.

### Done when (pass 1)

- Every issue above is merged and on the test site.
- The pass 1 Playwright test passes in CI.
- Two windows on one account show the same list, and a tick in one shows in the other without a reload.
- Any change to `design.md`'s schema is written in `docs/decisions.md`.

### Open questions

- The test site URL and how it deploys on merge are not in the docs yet. This plan assumes a deploy from `main` to a Cloudflare test environment; confirm before issue 1.
- Clerk: which Google OAuth app and whether a dev instance is used for the test site.
- Polling every 5 seconds on Workers costs requests on every open list. Fine for four flatmates; revisit if the free tier is at risk.

## Pass 2 and pass 3 (outline only)

Not planned in detail. Each gets its own detailed plan when it starts.

- **Pass 2:** household invites and join, members list, leave (removes the member row and `display_name`); shop mode on the list; spends table, add-a-spend form, monthly even split, who owes whom.
- **Pass 3:** list polish, and the two-flatmate check from the MVP's done-when.

## Build order

- Scaffold the app and CI :: nothing
- Sign in with Google :: Open the test site, press Continue with Google, and land on the empty list page.
- One household per account, made at first sign-in :: Sign in with a new Google account and check the list header shows a household name.
- Add items to the list :: Type an item in the box at the top and add it; it shows with your name under added by.
- Tick and untick items :: Tick an item and see it move to the bottom with a tick; untick it to move it back.
- Live list updates by polling :: Open the test site in two windows on the same account, tick an item in one, and see it appear ticked in the other within about 5 seconds, without reloading.
- Playwright test for the pass 1 flow :: nothing
