# Tracer-bullet pyramid

Core: the shared list that updates live while someone shops. MVP: sign-in, household, shared list, cost split. Three passes, with pass 1 detailed.

## Slice 0: the skeleton

- [ ] The app runs locally
- [ ] CI runs every check on every pull request
- [ ] Boundary check on
- [ ] Main deploys to test. Test URL: (blank until the first deploy; then record it here and in `AGENTS.md`)
- [ ] A preview per pull request (if the host offers one)

Also set up in the skeleton (no feature depends on the stack pack doing it for us):

- Error envelope with request IDs, structured logs, a health endpoint, the `/api/v1` prefix.
- UTC times, money as integer cents, text IDs (see decision B), standard columns (`id`, `created_at`, `updated_at`).
- Audit log, feature flags, `object_action` event names, breakpoints and a type scale in the tokens, per-module `copy.ts`.
- Generators for module, route, section and component. The check command for the generator goes in "Commands that work here" in `AGENTS.md`.
- GitHub: run `setup-github` with `--dry-run`, show the list, ask "Set this up now?", then run it for real on a yes.
- Accounts: Cloudflare and Clerk. Before signing up, confirm each has a free tier that needs no card. A paid plan means asking first.
- Secrets: wired through the `secrets` checklist before issue 2 (the test deploy). Values never go in chat.

## Slices

Test for each: does the core work without it? Sign-in and household are needed for two flatmates to share a list. Cost split is the person's must (`features.md`) and the second MVP "done when", so it is `insisted`. `mvp.md` labels it "support"; align that label to `insisted` when the issues are written.

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Sign-in | support | Sign in with Google, see a signed-in page, sign out |
| Household | support | Make a household, copy its invite link, a second flatmate joins, and both are listed |
| Shared list | core | Add items and tick them off; a tick shows on the other device within about 5 seconds, no reload |
| Cost split | insisted | Add a shop cost; see this month's total and who owes whom, split evenly |

Shop mode is not in pass 1 (decision 7). It is in the approved wireframes, so pass 1's list screen is the normal list only.

## Outline: every pass

Status: `outline`, `building`, `gate`, `done`. One pass is `building` at a time. Pass 3 is the last pass of the MVP. More than three passes needs a `decisions.md` row, and never more than four.

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Works: two flatmates, one list, one month | slice 0, then sign-in, household, shared list, cost split | Sign-in: Google sign-in and sign-out. Household: invite link, members listed, seed users. Shared list: add and tick, live every 5 seconds, designed empty, loading and error states. Cost split: one spend form, month total, even split, who owes whom. | building |
| 2 Real | Real: a full month of real shopping | core + supports | Shared list: Shop mode (big tick boxes, unticked first), untick, edit and delete your own items, and the live method chosen (decision A). Household: remove a member, leave (your personal data is removed, your spends stay labelled "former member"), revoke the invite link. Cost split: edit and delete a spend, switch month, rounding shown. Sign-in: sign out everywhere, delete my data. | outline |
| 3 Ready | Ready: MVP complete on the test site | core, then the whole app | Shared list: designed states reviewed, copy polished, reduced-motion respected, speed inside the budget (`web-performance`). Every screen passes `a11y`. Sign-in page has `seo` basics. Launch checklist written, not launched. | outline |

Pass 3 done = **MVP complete on the test site.** Not launch. Launch is the person's call.

## Shared design for pass 1

From `docs/design.md`, approved 2026-11-21 (decision 3). Pass 1 builds the Sign in, Household, List and Split screens. Shop mode waits for pass 2.

- **Schema:** the four tables in `design.md`, plus one column: `items.ticked_by` (so the list can show who ticked). Money is `amount_cents` (integer) and `currency` (3-letter code, copied from the household when it is made). `spent_on` is a calendar date, and a month is its `yyyy-mm`.
- **Membership:** a core module `membership` owns the members table. `household` creates and changes members. `list` and `split` read membership through it. Feature modules never import each other (`architecture.md`).
- **Access:** every household read or write goes through `check()` for membership. A non-member gets the same "not found" as a household that does not exist.
- **Live updates in pass 1:** the list polls its server function every 5 seconds, sending the last time it saw, and pauses while the tab is hidden.
- **Events:** through `track()` only, named `object_action`: `household_created`, `member_joined`, `item_added`, `item_ticked`, `spend_added`.
- **API:** each module's server functions call its service, which calls its repository. The `/api/v1` prefix is set in the skeleton; pass 1 needs no outside client.
- **Test users:** two fixed Clerk test accounts, added by the household issue with the seed script. Issue 3 says how `qa` signs in with them.

## Current pass: detail

Pass 1, `building`. In build order. Each slice ends with something a person can try.

1. **Skeleton (slice 0).** App runs, every check command passes on main, generator works, CI runs checks on pull requests, boundary check on. **Done when** `check` passes on main.
2. **Test site (slice 0).** Main deploys to test. `/health` returns ok and the version. Errors come back in the one error format with a request ID. Logs are structured. Needs the test-deploy secrets. **Done when** the test URL serves the placeholder home page and `/health` is ok.
3. **Sign-in (support).** Clerk with Google. Signed-out visitors see the Sign in screen. A signed-in user with no household goes to the Household screen. Sign out works. Sign-in on test needs the Clerk keys and the Google setup from `secrets`. **Done when** `test:e2e` signs in and out with a test account.
4. **Household (support).** Create a household (name, currency). Invite link, valid 7 days (decision 8). Opening the link as a signed-in user joins the household. Members listed. Seed script and the two test users. No removing or leaving yet. **Done when** the second test user joins by link and both names show.
5. **Shared list (core).** Items table. Add box at the top. Each item shows who added it and who ticked it. Live updates every 5 seconds (see Shared design). Empty, loading and error states as designed, each with an icon, a title, a specific message, a next action and a reference ID. Members only. **Done when** two test users see the same list, and a tick by one shows for the other within about 5 seconds, with no reload. This is the riskiest idea, so it's the first thing to try on the test site. Not in pass 1: Shop mode, edit, delete.
6. **Cost split (insisted).** Spends table. Add-a-spend form: amount, who paid (default: you), date (default: today). This month's total. Even split, with leftover cents going to the earliest-joined members. Who owes whom, as the fewest payments that settle the month. Current month only. **Done when** two spends from different members give the expected totals and payments in `test:e2e`. Not in pass 1: edit, delete, month switching.

Order: 1 → 2 → 3 → 4 → 5. Issue 6 needs only 4, so it can run in parallel with 5.

## Decisions the builders need

**A. Live updates after pass 1.** Chosen at the pass 2 gate, once pass 1 is tried.
1. Keep polling: simplest, works everywhere, a few seconds late, more requests.
2. Server-sent events: one-way push, fast, needs reconnect handling.
3. A live socket per household (Durable Objects): instant, most moving parts.
Recommendation: keep polling. Switch to option 2 only if the person says 5 seconds feels slow when they try pass 1.

**B. IDs.** Chosen in the skeleton (decision 9).
1. Sortable text IDs (ULID): sort by creation, do not reveal counts. **Recommended.**
2. Random UUIDs: standard, but do not sort.
3. Auto-increment integers: simplest, but reveal how many rows exist and are guessable.

**C. Sharing membership between modules.** Chosen in the skeleton (decision 10).
1. A core `membership` module that all feature modules use. **Recommended.**
2. `split` imports `household`: breaks the module rule.
3. `split` keeps its own copy of members: drifts out of sync.

## Questions for the person

These three are open. Pass 1 can be built with the recommended answers, so none blocks the build.

1. **Which currency do you shop in?** Recommended: set per household when it's made. Your answer only matters for the first test household.
2. **Should Shop mode come in pass 1 or pass 2?** Recommended: pass 2. Pass 1 proves the live list; Shop mode is the same list with big boxes, so it adds little risk to wait.
3. **When a flatmate leaves, what happens to the spends they paid?** Recommended: keep the spends, labelled "former member", so the month still adds up.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Re-plan |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Debt

<!-- "Nice to have" review findings, audit findings and refactors not yet picked. Worst first. -->

Nothing yet.

## After the MVP: the hourglass

<!-- One row per layer. Each layer: new features (each in thin) plus a pass on what's already there (the core every layer). Plan one layer at a time; the gate runs between layers. -->

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | Planned at MVP complete (recipes is the first candidate, from `features.md`) | core | |

## Build order

- Skeleton: app runs, every check passes, module generator, CI on pull requests :: nothing
- Test site: main deploys, health check, one error format with request IDs, structured logs :: open the test URL and see the placeholder home page; /health says ok
- Sign-in with Google :: sign in with Google on the test site, see a signed-in page, then sign out
- Household: create one, invite link, members listed, seed script and two test users :: make a household, open its invite link in a second browser as the other test user, and see both names listed
- Shared list: add, tick, live updates every 5 seconds :: add items in one browser, tick one, and see it appear in the other within about 5 seconds, with no reload
- Cost split: add a shop cost, month total, even split, who owes whom :: add two costs from different flatmates and see the month total and who owes whom
