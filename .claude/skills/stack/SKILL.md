---
name: stack
description: Use to decide how an app gets built ("what stack should we use", "pick the tech", the tech grill in /idea after naming) - platform, framework, UI kit, architecture and folders, API pattern, database, auth, hosting, test and production environments, CI, and the risk dial. Recommends a pick with alternatives for each area so beginners can accept and experts can override.
---

# Stack: short, opinionated, overridable

The person shouldn't need to know any of this. For each area, give your **recommended pick, why it fits this product, and one or two alternatives.** A beginner says "go with your picks." An expert changes whatever they want. Keep rounds at three questions.

## Order

The platform comes first, because everything else depends on it.

1. **Platform(s):** web, iOS, Android, desktop, CLI. Decide from the main flow and the users, not from habit.
2. **Framework and language.**
3. **UI kit and styling.** Always pick one. Without one, the AI invents its own components and the UI drifts.
4. **Architecture and folders:** a modular monolith with feature modules (see `templates/architecture.md` in the `idea` skill).
5. **API pattern:** controller → service → repository/client, with one composition root. Also pick the wire style.
6. **Data:** the database, how the schema is migrated, and backups.
7. **Auth:** buy it, don't build it.
8. **Environments:** **test** and **production**, plus a **preview per pull request** if the host offers one. Merging to main auto-deploys to test.
   - **Agents get test credentials only.** Production keys and settings stay with the person.
9. **CI:** every pull request runs install, lint, typecheck, unit tests, the boundary check, build and end-to-end tests. Start from `templates/ci.yml` in the `idea` skill.
10. **Build vs buy** for every other need: open source first, then a free-tier SaaS, then build it.
11. **Repo and risk dial:** confirm visibility and licence, and pick the risk dial in `stack.md`.

## Default picks for a web app

| Area | Recommended | Alternatives |
|---|---|---|
| Framework | TanStack Start (React, TypeScript) | React Router (framework mode), SvelteKit |
| UI | shadcn/ui + Tailwind CSS | Mantine, Radix + your own CSS |
| Structure | Feature modules, Bulletproof React style | By layer (only for tiny apps) |
| API | Controller → service → repository, schema validation (Zod) | tRPC, GraphQL |
| Boundary check | `eslint-plugin-boundaries` or `dependency-cruiser`, run with lint | A custom script |
| Database | SQLite (self-hosted, or Cloudflare D1) | Supabase Postgres when SQLite isn't enough; Convex for heavy real-time multi-user |
| Queries | Drizzle | Kysely, Prisma |
| Auth | Clerk (free tier) | Supabase Auth, Better Auth (self-hosted) |
| Hosting | Cloudflare Workers | A small VPS with Docker + Caddy, Fly.io, Netlify |
| Tests | Vitest + Playwright | Jest |

If the person picks a database, make it a real decision. Switching engines after launch means a new SQL dialect and a data migration.

For other platforms there's no fixed default. Recommend the mainstream choice, since a niche stack takes more correction rounds with an AI. Anything crucial and unclear goes to `research`.

## Write it down

From the `idea` skill's `templates/`:
- `docs/stack.md`: every row marked **default** or **chosen**;
- `docs/architecture.md`;
- `docs/security-policy.md`: the trust boundaries, what's sensitive, and the risks the person accepts and why. The security reviewer reads it.

Add each decision to `docs/decisions.md`.
