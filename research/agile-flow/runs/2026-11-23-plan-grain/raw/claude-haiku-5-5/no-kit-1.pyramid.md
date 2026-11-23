# Pyramid: build plan

Status: plan only. Nothing is set up and no code is written. Planned on the model the person has open (see decisions.md #5).

## The passes

Each pass stacks on the one before and ends with something you can try on the test site. Source for the pass split: the "Passes planned" column in mvp.md.

| Pass | Slices | Why here |
|---|---|---|
| 1 | Sign-in (plus the slice 0 skeleton) | Every later slice needs a signed-in person. |
| 2 | Household, Cost split | Spends belong to a household, and a household needs members. |
| 3 | Shared list (the core) | Items belong to a household. The list is last because mvp.md puts it there. |

Open question: mvp.md puts the shared list in pass 3, so passes 1 and 2 ship no list. If the live list is meant to be seen earlier, it has to move up, and that is your call.

Conflict to settle: design.md says live updates by polling every 5 seconds "in pass 1". mvp.md puts the list, which is what polls, in pass 3. This plan follows mvp.md. Polling lands with the list in pass 3 unless you say otherwise.

## Pass 1 in detail

**Goal:** a person opens the app, signs in with Google, and reaches a signed-in home page. No household, no list, no spends yet.

### In scope

- **Slice 0 skeleton.** TanStack Start on Cloudflare Workers, D1 connected through Drizzle, shadcn/ui installed, Vitest and Playwright wired with one passing test each. Loop sets this up later; this plan only describes it.
- **Sign-in.** One screen with one button, "Continue with Google", through Clerk. Loading and error states on this screen. Sign out.
- **Users.** A `users` table holding name and email, created on first sign-in. Schema in design.md has no users table, but the floor checklist in features.md says name and email are stored, and `members.user_id` needs something to point at. Proposed addition: `users` (id, name, email).
- **Route guard.** A signed-out visit to any app page goes to sign-in.

### Out of scope

- Households, invite links, members list (pass 2).
- Spends and the split (pass 2).
- The shared list and polling (pass 3).
- The data deletion path. features.md ties it to leaving a household, so it arrives in pass 2.

### Modules

architecture.md names three feature modules (`list`, `household`, `split`) and no module for sign-in. Proposed: an `auth` module that wraps Clerk and owns the `users` table. That makes four modules, so architecture.md needs a line for it. Modules still do not import each other.

### Done when

1. Continue with Google signs a person in and lands on the signed-in home page.
2. Sign out returns to the sign-in screen.
3. A signed-out request for an app page is redirected to sign-in.
4. After the first sign-in there is one `users` row with that person's name and email.
5. `vitest` and `playwright test` both pass locally and in CI.

### Tests

- Vitest: the route guard decision, and the create-on-first-sign-in logic for `users`.
- Playwright: the sign-in flow end to end, using Clerk's test mode if the account has it.

### Needs from the person

- Clerk application keys and a Google OAuth client, both in the person's accounts. Pass 1 cannot finish without them. Keys go in environment config, never in the repo.
- A decision on the two proposals above: the `users` table and the `auth` module.

### Risks

- Clerk sign-in on Cloudflare Workers may need a specific setup. Check this in the first issue, before building on it.
- D1 with Drizzle locally versus on Workers: confirm migrations run in both before pass 2 depends on them.

## Pass 2 outline

Household: create a household, copy an invite link, join by link, see members. Leaving removes the person and their stored data (floor item in features.md).

Cost split: an add-a-spend form, this month's spends, and who owes whom, split evenly. Ends at the month boundary.

Not decided here: how a month is cut off, and whether a spend can be edited after it is saved. Write these down before pass 2 starts.

## Pass 3 outline

Shared list: items with who added them, a tick box, an add box at the top, empty, loading and error states. Shop mode: the same list with big tick boxes, unticked first. Live updates by polling every 5 seconds, unless changed above.

This pass is the MVP's "Done when" items 1 and 2 becoming true together.

## Build order

The issues for pass 1, in order. Each line says what to try on the test site once merged.

- Slice 0 skeleton: Start on Workers, D1 with Drizzle, shadcn/ui :: the placeholder home page loads on the test site
- Vitest and Playwright wired with one passing test each :: nothing
- Clerk sign-in with Google, loading and error states, sign out :: click Continue with Google, land on the signed-in home, then sign out
- Users table and create-on-first-sign-in :: nothing
- Route guard for signed-out visits :: open an app page while signed out and get sent to sign-in
