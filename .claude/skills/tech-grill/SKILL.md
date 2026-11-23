---
name: tech-grill
description: Secondary skill. Use after the product grill (and naming) to decide how the app gets built - platform, framework, UI kit, folder structure and architecture, API pattern, database and schema approach, auth, hosting and environments, testing, build-vs-buy for each need, and the risk dial. Recommends a pick with alternatives for every area so beginners can accept and experts can override; writes docs/stack.md and docs/architecture.md.
---

# Tech grill: short, opinionated, overridable

The person shouldn't need to know any of this. For each area, give your **recommended pick, why it fits *this* product, and one or two alternatives.** A beginner says "go with your picks." An expert changes whatever they want. Keep rounds at three questions.

## Order

The platform comes first, because everything else depends on it.

1. **Platform(s):** web, iOS, Android, desktop, CLI. Decide it from the main flow and the users, not from habit.
2. **Framework and language.**
3. **UI kit and styling.** Always pick one. Without one, the AI invents its own components and the UI drifts.
4. **Architecture and folder structure.** A modular monolith with feature modules (see `templates/architecture.md` in `new-project`).
5. **API pattern.** Controller → service → repository/client, with one composition root. Also pick the wire style: RPC, REST, or a typed client.
6. **Data:** database, how the schema is designed and migrated, and backups.
7. **Auth:** buy, don't build, unless there's a strong reason not to.
8. **Hosting, deploy and environments:** at least **test** and **production.** Merging to main should auto-deploy to test.
9. **Testing:** unit tests for services, plus end-to-end tests in a real browser for user flows.
10. **Build vs buy** for every remaining need: open source first, then a free-tier SaaS, then build it.
11. **Repo and risk dial:** confirm visibility and licence, and pick the risk dial in `stack.md` (move fast, careful or strict).

## Default picks for a web app

These are the defaults. Offer each one as the recommendation, then the alternatives.

| Area | Recommended | Alternatives |
|---|---|---|
| Framework | TanStack Start (React, TypeScript) | Next.js, Remix/React Router, SvelteKit |
| UI | shadcn/ui + Tailwind CSS | Mantine, Chakra, Radix + your own CSS |
| Structure | Feature modules in the style of Bulletproof React | By layer (only for tiny apps) |
| API | Controller → service → repository, typed RPC or REST with schema validation (Zod) | tRPC, GraphQL |
| Database | SQLite (self-hosted, or Cloudflare D1) | Supabase Postgres (free tier) when SQLite isn't enough; Convex for heavy real-time multi-user |
| ORM / queries | Drizzle | Prisma, Kysely |
| Auth | Clerk (free tier) | Supabase Auth, Better Auth (self-hosted) |
| Hosting | Cloudflare Workers | A small VPS with Docker + Caddy; Fly.io; Netlify |
| Tests | Vitest + Playwright | Jest, Cypress |

For other platforms there's no fixed default. Recommend the mainstream choice, because a niche stack takes many more correction rounds with an AI. Send anything crucial and unclear to `deep-research`.

## Write it down

Fill in `docs/stack.md` and `docs/architecture.md` from the `new-project` templates. Mark every row **default** or **chosen**. Add each decision to `docs/decisions.md`.
