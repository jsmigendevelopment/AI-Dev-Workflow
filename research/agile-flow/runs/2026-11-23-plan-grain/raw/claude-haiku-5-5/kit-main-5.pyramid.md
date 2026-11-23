# Tracer-bullet pyramid

Planned 2026-11-23 on claude-haiku-5-5, at the person's request (`docs/decisions.md` row 5). The skill asks for the strongest tier; the person chose this model. Re-plan at the first gate if the plan needs more care.

## Slice 0: the skeleton

- [ ] The app runs locally, and every check command runs: `check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`
- [ ] Lint includes the boundary check: feature modules `list`, `household`, `split` don't import each other
- [ ] CI runs every check on every pull request, plus secret scan and agent-file guard
- [ ] Main deploys to test. Test URL: *(set when the first deploy works; record in `AGENTS.md`)*
- [ ] A preview per pull request, if the host offers one
- [ ] Keys for Clerk and Cloudflare are wired by name through the `secrets` checklist. The person does this; no values in chat.
- [ ] GitHub set up with `setup-github.mjs`, after the person's yes (run `--dry-run` first)

Skeleton conventions (set up once, used by every slice): error envelope with request IDs; structured logs; `/api/health`; `/api/v1` prefix; UTC instants; money as integer cents with currency; ID strategy and standard columns; audit log; feature flags; `track()` with `object_action` event names; breakpoints and type scale in the tokens; per-module `copy.ts`; generators for module, route, section and component.

## Slices

Role: **core**, **support**, or **insisted**. Test for each: *does the core work without it?*

| Slice | Role | What a person can do after pass 1 |
|---|---|---|
| Shared list | core | Add items, tick and untick them, open shop mode, and see the list refresh within 5 seconds without a reload |
| Sign-in | support | Sign in with Google through Clerk, and sign out |
| Household | support | Make a household, see its members, and join one by invite link |
| Cost split | support | Add a spend and see the month's total, each person's even share, and who owes whom |

Why each one is in the MVP: the core needs people who are signed in (sign-in), in one place (household), and a list only members can see (the floor). The split is in because the MVP's second "done when" needs it, though the list works without it.

Floor items: sign-in through Google (pass 1); members-only access (pass 1, needed by the list); personal data removed on leaving a household (pass 2).

## Schema (designed from the approved screens)

The design in `docs/design.md` lists four tables. Two changes:

- **Add `invites`** (`id`, `household_id`, `token_hash`, `created_by`, `created_at`, `revoked_at`). The invite link needs a stored token, and the token is stored as a hash.
- **Add `currency` to `spends`**, as designed, and keep it on each row so every amount carries its currency (AGENTS money rule).

| Table | Columns | Notes |
|---|---|---|
| `households` | `id`, `name`, `currency`, `created_at`, `updated_at` | `currency` is the default for new spends. Pending question 2. |
| `members` | `id`, `household_id`, `user_id`, `display_name`, `joined_at` | Unique on (`household_id`, `user_id`). `user_id` is the Clerk user ID. Pending question 1 (one household per person). |
| `invites` | `id`, `household_id`, `token_hash`, `created_by`, `created_at`, `revoked_at` | The link is valid until revoked. |
| `items` | `id`, `household_id`, `name`, `added_by`, `ticked_at`, standard columns | `ticked_at` is a UTC instant; null means not ticked. |
| `spends` | `id`, `household_id`, `paid_by`, `amount_cents`, `currency`, `spent_on`, standard columns | `amount_cents` is an integer. `spent_on` is a calendar date, so no time zone is needed to pick the month. |

Personal data: email is **not** stored here. Clerk holds it. `members.display_name` is a copy taken when someone joins. Leaving a household deletes the member row (pass 2).

## API (server functions, one module each)

Decision (see below): server functions are the controllers for the UI. Each one calls `check()` first, then a service, then the repository.

| Module | Functions | Pass 1 |
|---|---|---|
| `household` | create, get (with members), create invite, join by invite | yes |
| `list` | get items, add item, set ticked | yes |
| `split` | add spend, get month (spends, shares, who owes whom) | yes |

Membership read: `check()` lives in a shared `access` core module, with the members read behind it. Feature modules never import each other.

Live updates in pass 1: the list refetches every 5 seconds, and only while the tab is visible.

## Decisions to confirm (three options each, recommendation first)

**A. Where the membership check lives.** The list needs to know who is a member, but `list` can't import `household`.
1. **Shared `access` core module owns the members read** (recommended). `check()` reads `members` through its own repository. Simple, and the rule holds.
2. `list` calls the household service. Breaks the module rule; lint would fail.
3. Copy members into each module's table. Duplicates data and needs sync; no benefit for four people.

**B. Live updates in pass 2 (pass 1 is polling).**
1. **Keep polling, and tune it** (recommended). Refetch on tab focus, back off on errors. Meets "without a reload" and costs nothing extra.
2. Server-sent events from a Worker. Cheaper than sockets, but needs a long-lived connection on each request path. Test on the Workers plan first.
3. Durable Objects per household with WebSockets. Truly instant. More moving parts, and it may need a paid Cloudflare plan. **Money: ask before choosing this one.**

**C. Pass 1 API style.** The design says server functions; the architecture says controller → service → repository.
1. **Server functions as controllers, one per module** (recommended). Matches the design, and the architecture rule still holds.
2. A `/api/v1` HTTP route per function. More surface to secure, and no screen needs it yet.
3. Both. Doubles the work for no MVP gain.

## Questions for the person

Each has my recommended answer. Pass 1 proceeds on the recommendations, so these don't block the first pass.

1. **Can one person be in more than one household?** Recommended: no. One household per flat, as in `docs/features.md`. This adds a unique rule on `members.user_id`.
2. **Which currency does the flat spend in?** Recommended: one currency, chosen when the household is made. Each spend keeps the currency it was entered in. I need the currency name to set the default.
3. **When someone joins mid-month, do they share the earlier spends that month?** Recommended: no. Each spend is split among the members who were in the household on its date. Pass 1 splits among everyone currently in the household; pass 2 adds the rule.

## Pass 1: detail (building)

Slices in order. Each ends with something a person can try. Order follows dependencies, and the riskiest idea (the live list) comes right after the things it needs.

1. **Keys and accounts.** Clerk app and Cloudflare account wired by name. Needs the person. Free tiers only; ask before signing up for anything paid.
2. **Skeleton.** The app runs, every check command works, lint has the boundary check, CI runs on every pull request, main deploys to test.
3. **Shared conventions and generators.** Error envelope with request IDs, structured logs, `/api/health`, UTC and cents helpers, IDs and standard columns, audit log, feature flags, `track()` events, tokens, copy files, generators.
4. **Sign-in.** Google through Clerk, sign out. Two test accounts in the Clerk test instance, for `qa`.
5. **Household.** Make a household; see its members; copy an invite link; join from a second account. Adds the first tables, so the seed script goes in here: both test accounts in one household.
6. **Membership check.** `check()` in the `access` module. A non-member opening a household's pages sees a designed not-found state (icon, title, message, next action, reference ID).
7. **Shared list.** Add, tick and untick items. Shop mode: the same list with big tick boxes, unticked first. Refetch every 5 seconds. Empty, loading and error states designed.
8. **Cost split.** Add a spend (amount in cents, currency, date). See the month's total, each person's even share, and who owes whom. Remainder cents go to the earliest members by `joined_at`, so the split is deterministic.

Test coverage per slice: unit tests for the split and the access check (pure logic); one Playwright run with two accounts for the core's "done when" 1; one run for the split's "done when" 2. `qa` runs the two-account checks on the preview before merge.

## Pass outline

| Pass | Milestone | Slices | What "better" means, per slice | Status |
|---|---|---|---|---|
| 1 Works | Two flatmates sign in, share a household, and see a live list and an even split | skeleton; sign-in, household, shared list, cost split (all thin) | Each slice works end to end with the floor's access rule; no polish | building |
| 2 Real | The core works for real use: shop mode, household management, a correct monthly split | shared list, household, cost split (sign-in has no pass 2 work) | List: shop mode tuned for a phone, refresh tuned (decision B), retry on failure. Household: members managed, invite links revocable, leaving deletes the member's data. Split: month picker, edit and delete a spend, mid-month joiners (question 3). | outline |
| 3 Ready | MVP complete on the test site. Not launch. | the core, then the whole app | List: speed to budget, every screen passes `a11y`, every error and empty state reviewed. Household: invite-link abuse limits (`web-security`). Split: copy and states reviewed. App: bundle budget, a11y audit, `seo` on the sign-in page only, launch checklist written but not launched. | outline |

Pass 3 done = **MVP complete on the test site.** Launch is the person's call, and the "Coming soon" page stays on until then.

## Gate record

| Pass | Date | Feedback issues | Audit | Cleanup issues | Re-plan |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Debt

None yet.

## After the MVP: the hourglass

Not planned yet. Planned only when the MVP is complete on the test site.

| Layer | New features | Pass on what's there | Gate |
|---|---|---|---|
| 1 | *(from `docs/features.md`: recipes, later)* | core | |

## Build order

- Keys for Clerk and Cloudflare on the test site :: nothing
- Skeleton: runnable app, every check command, lint with boundary check, CI on every pull request, main deploys to test :: nothing, the test site shows a placeholder page only
- Shared conventions and generators: error envelope, request IDs, structured logs, health endpoint, UTC and cents helpers, audit log, feature flags, event names, tokens, generators :: open the health address on the test site and see status ok with a request ID
- Sign-in: Google through Clerk, sign out, two test accounts :: sign in with Google, see the signed-in home page, sign out
- Household: make one, see its members, join by invite link, seed both test accounts into one household :: make a household on one account, copy the invite link, join from the second account, see both names listed
- Membership check: only members can open a household's pages, with a designed not-found state :: open a household's page from an account that isn't in it and see the not-found message
- Shared list: add, tick and untick items, shop mode, refresh every 5 seconds, empty, loading and error states :: add items on one account and see them on the other within 5 seconds, tick one and see it on the other, then open shop mode and tick with the big boxes
- Cost split: add a spend, see the month's total, each person's even share, and who owes whom :: add a spend on one account and see each person's share and who owes whom
