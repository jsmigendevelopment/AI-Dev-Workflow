> **Fact-checked 2026-11-23 by a second agent.** Corrections are made in place and listed in [Fact-check](#fact-check), with the security concerns it found. The note below is the original author's and is kept for the record; where the fact-check settled an item, the Fact-check section says so.
>
> **Researched 2026-11-23.** One pass, one author. Vendor websites were not reachable from the research session, so product facts were read from each project's docs repository on GitHub and from the npm registry (commits and versions are in [Sources](#sources)). The engine design was run as a scratch prototype on local D1 and on PGlite; that code is **not in this repo** and nothing here has run on production D1. **Still unverified:** every price and free tier for AuthZed Cloud and Auth0 FGA (search summaries only); the Zanzibar paper itself (not opened; described from memory and from what the SpiceDB and OpenFGA docs quote); whether `@openfga/sdk` runs on Workers; whether production D1 counts rows and plans queries the way local D1 does; Clerk's token lifetime; npm download counts. Run a fact-check and the spikes in [Before anyone builds](#before-anyone-builds) before acting on it.

# Authorization: research dossier

**Question:** how should the kit build in relationship-based authorization (ReBAC, in the style of Google Zanzibar, SpiceDB and OpenFGA) from day one, behind a port, so an app starts on a small built-in engine and can move to SpiceDB or OpenFGA later without touching its services?

**Date:** 2026-11-23. Re-check versions and prices before building.

**Starting point:** the web pack (`stacks/tanstack-start/`): TanStack Start on Cloudflare Workers, Drizzle on D1, Clerk, controller → service → repository with one composition root and memory fakes. Today the pack authorizes by ownership: every repository method takes `ownerId` and puts it in the `WHERE` (`notes.repository.drizzle.ts`). `Actor` is `{ userId }` only. There are no workspaces, roles or shares yet.

**What the kit already says:** `guide/app-conventions.md` section 18 and the architecture template set the direction: simple apps filter by owner in the repository; anything more (sharing, teams, roles, folders) uses ReBAC through one `check(user, action, object)` behind a port at `server/authz.ts`, with the kit's own engine as the default adapter. Both mark the table shape, the schema format and how lists are filtered as "until research confirms". This dossier is that research. It keeps the direction and fills in those three, and it proposes two changes: `forbidden` for a user who can see a thing but not change it ([2.9](#29-not-found-or-forbidden)), and a proof of the check on repository methods. The kit's word "action" is called a **permission** here, as in SpiceDB.

**Constraints used:** the architecture template (services hold the rules; no HTTP, SQL or SDK in a service; one composition root; "someone else's data returns not found"), `guide/app-conventions.md`, D1's lack of interactive transactions, the kit's "reuse before you build" rule, and the always-stop list (money, secrets, production).

**What the owner's private research library already covers** (not redone here): ports and adapters with one composition root, and `not_found` for another user's data (`service-boundaries` skill, rules 4 and 9); "authentication is middleware, authorization is the service", D1 `batch` as the only transaction, and D1's limits (`layered-api` skill, rules 10 and 13, and its D1 reference, measured there on local D1). It has nothing on Zanzibar, tuples, SpiceDB or OpenFGA. Its `agent-permissions` skill is about what an AI agent may do, a different layer.

## How to read the evidence marks

| Mark | Meaning |
|---|---|
| **[V]** | Verified today against a primary source: the npm registry, or the project's own docs or source in its GitHub repo at the commit named in Sources, or a file in this repo. |
| **[M]** | Measured today in a scratch prototype (local D1 in workerd through wrangler 4.166.0, and PGlite 0.5.16). Local only. |
| **[S]** | Secondary: a web-search summary of a page I could not open. A lead, not a fact. |
| **[I]** | Inferred from how the tools work, or from training knowledge (cut-off mid-2026). Not checked today. |

**What I could not open:** `authzed.com`, `openfga.dev`, `docs.fga.dev`, `usenix.org`, `developers.cloudflare.com`, `clerk.com`, `sqlite.org`, `api.npmjs.org` (download counts) and the GitHub API. Where a project keeps its docs on GitHub (SpiceDB, OpenFGA, Cloudflare, Clerk) I read the files there.

## Summary

| # | Topic | Recommendation | Confidence | Biggest open point |
|---|---|---|---|---|
| 1 | Model | A positive-only subset of Zanzibar: direct relations with typed subjects (including "all members of X"), permissions as unions, and parent inheritance (arrows). No intersection, exclusion, wildcards or caveats in version 1 | High | Public links (wildcards) will be asked for early |
| 2 | Engine | The kit's own small engine: one `authz_tuples` table, and **one recursive SQL statement per call** for `check`, `checkMany` and both lookups | Medium-high: it passed a contract suite and a 2,400-answer differential test on local D1 [M] | Not run on production D1; costs about 95 rows read per check |
| 3 | Library instead | None today. The closest fit, `@zanzibar-ts/core`, is two releases old with one maintainer. Keep it as an alternative adapter to spike | Medium | Popularity could not be checked (no download counts) |
| 4 | Port | One typed `Authz` interface built from a schema written as code. A wrong permission, relation or subject type does not compile [M, `tsc` 6.0.3]. `authorize()` returns a proof that repositories require | High for the types; medium for the proof pattern (new to the kit) | The proof pattern changes every repository signature |
| 5 | Writes | Tuples go in the **same D1 batch** as the domain row, through the repository. A separate `writeRelationships` exists for shares | High | External engines can't join that batch: they need an outbox |
| 6 | Lists | List by parent after one check (the default); page-then-`checkMany` when some rows are private; `lookupResources` only for small "shared with me" sets | High | `lookupResources` reads every reachable row |
| 7 | Clerk | Membership of the active Organization comes from the verified session token as a request-scoped tuple. No sync, no webhook | Medium | SpiceDB has no request-scoped tuples; moving there means syncing memberships first |
| 8 | Later | A schema translator (about 30 lines; its output parsed by both vendors' own parsers [M]), an outbox for dual-write, a shadow adapter that compares answers, then switch reads in the composition root | Medium | Hosted prices; neither official JS client is a clean fit for Workers |

Six findings that shape the design:

1. **D1 allows five `SELECT` terms in a compound statement** (`UNION`, `UNION ALL`). It's in the limits table [V] and local D1 enforces it: a six-term `UNION ALL` fails with `too many terms in compound SELECT` [M]. The limit counts terms in **one** compound chain, not in the whole statement: two four-term chains in one statement run fine on local D1 and on SQLite 3.53 [M, fact-check]. The walk is written with **one** recursive term, which also makes it run on Postgres.
2. **The Free plan allows 50 D1 queries per Worker invocation** (1,000 on Paid), and a batch counts as one [V]. An engine that expands the graph step by step in the service would spend that budget on one list page. One statement per call doesn't.
3. **Postgres refuses `LIMIT` inside a recursive query** ("LIMIT in a recursive query is not implemented") [M, PGlite]. SQLite accepts it. The node limit needs a different guard in the Postgres adapter.
4. **A generic walk costs about 95 rows read per check; a hand-written query for the same permission costs 5** [M]. The generic walk is fine to start (the Paid plan includes 25 billion rows a month [V]). Compiling each permission to flat SQL is the first optimisation.
5. **OpenFGA has no consistency tokens yet** ("OpenFGA is considering a similar feature") and **SpiceDB has no contextual tuples** [V]. The port must treat a token as optional and must not assume request-scoped tuples everywhere.
6. **Drizzle 0.45.4 has no `WITHOUT ROWID`** in its SQLite table builder [V, package source]. The prototype used it; the pack's table would be an ordinary table with a composite primary key unless a migration is hand-written.

## Decisions for the owner

Three questions, each with a recommended answer. The second is about scope and money, so it's an open question first.

1. **Build the small engine, adopt a young library, or run a real service from day one?** Recommended: **build it** (about 300 lines plus one contract suite), because no maintained, popular library fits D1 today, and the port hides the choice either way. The alternatives are in [section 3](#3-existing-libraries-clients-and-hosting).
2. **Where do workspaces and their members live?** Open question: does the app want Clerk's ready-made team features (organization switcher, invitations, domain sign-up), or its own workspace table and invite flow? If Clerk Organizations: recommended **membership from the session token**, not a webhook sync. Note the cost: Clerk's free plan includes 100 Monthly Retained Organizations in production (an organization with at least two members, one of them active that month), and custom roles in production need the paid B2B Authentication add-on [V, Clerk docs `4a1fa58`, 2026-11-23].
3. **In the example app, can every member of a workspace see every note in it?** Recommended: **yes** for pass 1. It makes list pages one check plus one indexed query. Private notes inside a workspace are a later slice with a known pattern ([section 2.6](#26-lookup-and-list-pages)).

---

## 1. The Zanzibar model

### What the paper describes

Zanzibar is Google's shared authorization service, published at USENIX ATC 2019. Its ideas, in plain words:

- **Relation tuples.** Access is stored as facts of the form `object#relation@user`, where the user is either one user or a **userset**: "everyone who has relation R on object O" (`group:eng#member`) [I; the form is confirmed by the SpiceDB and OpenFGA docs, which write `document:budget#owner@group:finance#member`] [V].
- **Namespaces and relations.** Each object type (a namespace) has a config that lists its relations [I].
- **Userset rewrites.** A relation's users can be computed, not only stored. The paper's own example, as quoted in OpenFGA's docs [V]:
  - `_this`: the tuples stored for this relation (a direct relation);
  - `computed_userset`: everyone in another relation of the same object ("every owner is an editor");
  - `tuple_to_userset`: follow a tuple to another object and take a relation there ("a doc's viewers include its parent folder's viewers");
  - combined with `union`, `intersection` and `exclusion`.
- **Consistency.** The "new enemy" problem: a check must never run on permissions older than the content it protects. The paper's two examples (removing someone from a folder, then adding documents; removing someone from a document, then adding content) are quoted in SpiceDB's docs [V]. Zanzibar's answer is the **zookie**: an opaque token returned by a write, stored with the content, and sent with later checks to say "at least this fresh" [I, confirmed in outline by both projects' docs] [V].
- **API.** Read, Write, Watch, Check and Expand [V, OpenFGA's Zanzibar page]. Listing ("what can this user see?") is not in the paper; both projects added it [V].
- **Scale.** Trillions of tuples, millions of checks a second, with a separate index (Leopard) for deeply nested groups [I]. None of that is the kit's problem. OpenFGA's docs put it well: "Zanzibar's *model* is what's valuable, not its operational scale" [V].

### How SpiceDB and OpenFGA express it

| Idea | Zanzibar | SpiceDB schema [V] | OpenFGA DSL [V] |
|---|---|---|---|
| Object type | namespace | `definition note { ... }` | `type note` |
| Direct relation | `_this` | `relation viewer: user` | `define viewer: [user]` |
| Subject is a set | userset | `relation viewer: user \| group#member` | `define viewer: [user, group#member]` |
| Computed | `computed_userset` | `permission view = viewer + editor` | `define view: viewer or editor` |
| Parent inheritance | `tuple_to_userset` | `permission view = parent->view` (the arrow) | `define view: view from parent` |
| Union / intersection / exclusion | same | `+` / `&` / `-` | `or` / `and` / `but not` |
| Public | (none) | `relation viewer: user:*` | `[user:*]` |
| Conditions | (none) | caveats (CEL), and expiring relationships | conditions (CEL) |
| Request-scoped tuples | (none) | none; caveat context carries values, not relationships | contextual tuples, up to 100 a request |
| Consistency | zookie | ZedToken; `minimize_latency`, `at_least_as_fresh`, `at_exact_snapshot`, `fully_consistent` | `MINIMIZE_LATENCY` or `HIGHER_CONSISTENCY`; no token |
| Depth limit | (n/a) | 50 hops by default; a cycle is an error | 25 by default; 10 nodes per level resolved concurrently (a concurrency setting, not a cap on breadth) |

Differences that matter for a portable subset:

- **SpiceDB splits relations (stored) from permissions (computed)**: "you cannot write a relationship that references a permission", so "it's easy to change a permission, but not a relation" [V]. OpenFGA has one kind, and a relation with no `[types]` can't be written [V]. The kit follows SpiceDB's split: it's the clearer rule, and it maps onto OpenFGA without loss.
- **Arrows go over plain object types only.** OpenFGA rejects a parent relation whose subjects are usersets or wildcards [V]. SpiceDB allows it but ignores the `#relation` part and warns against it [V]. The kit forbids it.
- **Union precedence.** In SpiceDB `a + b & c` means `(a + b) & c` [V]. A subset with only unions never meets this.
- **Cycles.** SpiceDB "does not support cyclical relationships" and errors at the depth limit [V]. The kit's engine returns a deny. Data that can loop (folders in folders, groups in groups) needs a check on write in any engine.

### The subset the built-in engine supports

| In version 1 | Why |
|---|---|
| Direct relations with typed subjects | The tuple itself |
| Userset subjects (`workspace#member`) | "Share this note with a whole workspace" |
| Permissions as a **union** of relations and other permissions of the same object | Roles that include each other (`owner` → `manage` → `view`) |
| Arrows: `from('workspace', 'view')` | Parent inheritance, the reason to use ReBAC at all |
| Request-scoped ("contextual") tuples, **only** as direct grants to the subject being checked | Clerk membership without a sync ([section 2.10](#210-clerk-organizations)) |

| Out of scope in version 1 | What to do instead |
|---|---|
| Intersection and exclusion | Two checks in the service (`a && b`), or a narrower relation. See below |
| Wildcards (public access) | The first extension: a `user:*` subject matched in the last join. Small, but SpiceDB's warning applies: read permissions only [V] |
| Caveats and conditions (CEL) | The tuple type has an optional `caveat` field so the port doesn't change later; the built-in engine **refuses to write** a tuple that has one. Storing it and ignoring it would grant too much |
| Expiring relationships | Delete the tuple from a job. SpiceDB has this natively; OpenFGA uses a condition [V] |
| Recursive types (folder in folder, group in group) | Allowed by the engine (a cycle ends in a deny [M]) but not recommended until a write-time cycle check exists |
| Watch, Expand, snapshots | Not needed in-process |

**Why positive-only.** With only unions and arrows, "may X do P on O?" is a reachability question: is there a chain of tuples from O to X? That is exactly what one recursive SQL statement can answer, forwards for `check` and backwards for `lookupResources`. Exclusion breaks this (the answer can flip from yes to no as tuples are added), and it's where the engines disagree at the edges: a TypeScript engine that tests itself against both lists "wildcard × exclusion" and cyclic data among the cases it can't compare across them [V, `@zanzibar-ts/core` docs]. Staying inside the common ground is what makes "swap the engine later" honest.

**Sources for this section:** SpiceDB docs: `concepts/schema`, `concepts/consistency`, `concepts/zanzibar`, `modeling/recursion-and-max-depth`, `migrate-to-spicedb/migrate-from/openfga`. OpenFGA docs: `configuration-language`, `learn/zanzibar`, `interacting/consistency`, `interacting/contextual-tuples`, `getting-started/setup-openfga/configuration`. `@zanzibar-ts/core`: `docs/guide/concepts/limits-and-gotchas.md`. The paper (Pang et al., "Zanzibar: Google's Consistent, Global Authorization System", USENIX ATC 2019) was not opened.

---

## 2. Recommended design

### 2.1 Files

```
src/server/authz.ts        the port (where the architecture template puts it): the types,
                           defineSchema(), from(), authorize()
src/server/authz/
  schema.ts                this app's types, relations and permissions. The one place rules live
  compile.ts               validates the schema at start-up and flattens it into steps
  authz.d1.ts              the built-in engine (the default adapter)
  authz.memory.ts          the test fake, and the reference for what the answers should be
  authz.contract.test.ts   one suite, every adapter, plus a random differential test
  authz-tuples.table.ts    the Drizzle table
  actor-context.ts         turns the verified actor into request-scoped tuples
migrations/NNNN_authz_tuples.sql
```

The schema is one shared file, not one per module, because arrows cross types (a note inherits from a workspace) and because one file is what a reviewer reads to see every rule. It names types; it imports no module.

### 2.2 Schema as code

The example app: notes in workspaces, with members and viewers.

```ts
// src/server/authz/schema.ts
import { defineSchema, from } from '@/server/authz'

export const schema = defineSchema({
  user: {},
  workspace: {
    relations: { owner: ['user'], admin: ['user'], member: ['user'], viewer: ['user'] },
    permissions: {
      manage: ['owner', 'admin'],
      contribute: ['manage', 'member'],
      view: ['contribute', 'viewer'],
    },
  },
  note: {
    relations: {
      workspace: ['workspace'], // the parent
      owner: ['user'],
      editor: ['user', 'workspace#member'], // one user, or every member of a workspace
      viewer: ['user', 'workspace#member'],
    },
    permissions: {
      edit: ['owner', 'editor', from('workspace', 'manage')],
      view: ['edit', 'viewer', from('workspace', 'view')],
      delete: ['owner', from('workspace', 'manage')],
    },
  },
})
export type AppSchema = typeof schema

export const user = (id: string) => ({ type: 'user', id }) as const
export const workspace = (id: string) => ({ type: 'workspace', id }) as const
export const note = (id: string) => ({ type: 'note', id }) as const
export const membersOf = (id: string) => ({ type: 'workspace', id, relation: 'member' }) as const
```

Read it as: a note can be edited by its owner, its editors, and whoever manages its workspace; it can be viewed by anyone who can edit it, its viewers, and anyone who can view its workspace.

Rules the schema follows so it translates to both SpiceDB and OpenFGA:

- Names are lowercase letters, digits and underscores, 3 to 64 characters, with no leading or trailing underscore (SpiceDB's rule [V]).
- A name is a relation or a permission, never both. Code **checks permissions** and **writes relations**.
- A relation used in an arrow takes plain types only.
- Object ids use letters, digits and `/ _ | - = +` (SpiceDB's set [V]). UUIDs and Clerk ids (`user_...`, `org_...`) fit. An email address does not.

### 2.3 The port

Trimmed from a sketch that typechecks under `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` with TypeScript 6.0.3 [M].

```ts
// src/server/authz.ts
export interface Arrow<R extends string = string, P extends string = string> {
  readonly from: R
  readonly permission: P
}
export const from = <R extends string, P extends string>(relation: R, permission: P): Arrow<R, P> =>
  ({ from: relation, permission })

export interface TypeDef {
  readonly relations?: Readonly<Record<string, readonly string[]>>
  readonly permissions?: Readonly<Record<string, readonly (string | Arrow)[]>>
}
export type Schema = Readonly<Record<string, TypeDef>>

type RelationsOf<D> = D extends { readonly relations: infer R } ? keyof R & string : never
type PermissionsOf<D> = D extends { readonly permissions: infer P } ? keyof P & string : never

/** Compile-time checks on the schema itself. compile() repeats and completes them at start-up. */
type Checked<S extends Schema> = {
  readonly [T in keyof S]: {
    readonly relations?: {
      readonly [R in RelationsOf<S[T]>]: readonly ((keyof S & string) | `${keyof S & string}#${string}`)[]
    }
    readonly permissions?: {
      readonly [P in PermissionsOf<S[T]>]: readonly (
        | RelationsOf<S[T]>
        | PermissionsOf<S[T]>
        | Arrow<RelationsOf<S[T]>, string>
      )[]
    }
  }
}
export const defineSchema = <const S extends Schema>(schema: S & Checked<S>): S => schema

export type TypeName<S extends Schema> = keyof S & string
export type Permission<S extends Schema, T extends TypeName<S>> = PermissionsOf<S[T]>
export type Relation<S extends Schema, T extends TypeName<S>> = RelationsOf<S[T]>
export interface ObjectRef<T extends string = string> {
  readonly type: T
  readonly id: string
}
export interface SubjectRef<T extends string = string> extends ObjectRef<T> {
  /** Set for a userset: `workspace:w1#member` is "every member of w1". */
  readonly relation?: string
}

type AllowedSpec<S extends Schema, T extends TypeName<S>, R extends string> =
  S[T] extends { readonly relations: infer Rs }
    ? R extends keyof Rs ? (Rs[R] extends readonly (infer U)[] ? U : never) : never
    : never
type SpecToSubject<U> = U extends `${infer T}#${infer R}`
  ? { readonly type: T; readonly id: string; readonly relation: R }
  : U extends string
    ? { readonly type: U; readonly id: string; readonly relation?: undefined }
    : never

/** One stored fact. Built from the schema: a wrong relation or subject type does not compile. */
export type Relationship<S extends Schema> = {
  [T in TypeName<S>]: {
    [R in Relation<S, T>]: {
      readonly object: ObjectRef<T>
      readonly relation: R
      readonly subject: SpecToSubject<AllowedSpec<S, T, R>>
      /** A named condition and its stored context. The built-in engine refuses these in version 1. */
      readonly caveat?: { readonly name: string; readonly context?: Readonly<Record<string, unknown>> }
    }
  }[Relation<S, T>]
}[TypeName<S>]
export type RelationshipUpdate<S extends Schema> = Relationship<S> & { readonly op: 'touch' | 'delete' }

export interface RelationshipFilter<S extends Schema> {
  readonly object: { readonly type: TypeName<S>; readonly id?: string }
  readonly relation?: string
  readonly subject?: { readonly type: TypeName<S>; readonly id?: string; readonly relation?: string }
}

declare const tokenBrand: unique symbol
/** Opaque. A D1 bookmark, a SpiceDB ZedToken, or an empty string. Callers store it and pass it back. */
export type ConsistencyToken = string & { readonly [tokenBrand]: true }
export type Consistency = 'minimize_latency' | 'fully_consistent' | { readonly atLeastAsFresh: ConsistencyToken }
export interface ReadOptions {
  readonly consistency?: Consistency
}
export interface PageOptions extends ReadOptions {
  readonly after?: string | undefined
  readonly limit?: number | undefined
}
export interface IdPage {
  readonly ids: string[]
  readonly nextCursor: string | null
}
export interface CheckItem<S extends Schema, T extends TypeName<S> = TypeName<S>> {
  readonly permission: Permission<S, T>
  readonly object: ObjectRef<T>
}

export interface Authz<S extends Schema> {
  /** False for anything unknown. Throws only when a limit is hit or the engine is down. */
  check<T extends TypeName<S>>(
    subject: SubjectRef<TypeName<S>>, permission: Permission<S, T>, object: ObjectRef<T>, options?: ReadOptions,
  ): Promise<boolean>
  /** Many checks for one subject in one round trip. Answers come back in the order asked. */
  checkMany(
    subject: SubjectRef<TypeName<S>>,
    items: readonly { [T in TypeName<S>]: CheckItem<S, T> }[TypeName<S>][],
    options?: ReadOptions,
  ): Promise<boolean[]>
  /** Ids of `type` objects the subject has `permission` on, in id order. For small sets only. */
  lookupResources<T extends TypeName<S>>(
    subject: SubjectRef<TypeName<S>>, permission: Permission<S, T>, type: T, options?: PageOptions,
  ): Promise<IdPage>
  /** Ids of `subjectType` subjects that have `permission` on `object`, in id order. */
  lookupSubjects<T extends TypeName<S>>(
    object: ObjectRef<T>, permission: Permission<S, T>, subjectType: TypeName<S>, options?: PageOptions,
  ): Promise<IdPage>
  /** All or nothing. `touch` is an upsert; deleting a missing tuple is a no-op. */
  writeRelationships(updates: readonly RelationshipUpdate<S>[]): Promise<ConsistencyToken>
  deleteRelationships(filter: RelationshipFilter<S>): Promise<ConsistencyToken>
}
```

What the compiler catches [M]: a permission that the object's type doesn't have (`check(ann, 'manage', note(id))`); asking for a relation instead of a permission; an unknown type; writing a permission; a subject of the wrong type (`note#owner` given a workspace); a userset where only users are allowed; and, in the schema itself, an unknown subject type, a union term that names nothing, or an arrow over a relation the type doesn't have. Two things are left to `compile()` at start-up (so the first test run fails): that an arrow's target exists on the parent type, and that `type#relation` names a real relation.

`touch` and `delete` are SpiceDB's words: `TOUCH` is an upsert and `DELETE` of a missing relationship "will silently succeed" [V]. Both make writes safe to retry.

### 2.4 The table and indexes

```sql
CREATE TABLE authz_tuples (
  object_type      TEXT NOT NULL,
  object_id        TEXT NOT NULL,
  relation         TEXT NOT NULL,
  subject_type     TEXT NOT NULL,
  subject_id       TEXT NOT NULL,
  subject_relation TEXT NOT NULL DEFAULT '',   -- '' is the subject itself; 'member' is a userset
  created_at       INTEGER NOT NULL,           -- epoch ms
  PRIMARY KEY (object_type, object_id, relation, subject_type, subject_id, subject_relation)
) WITHOUT ROWID;

CREATE INDEX authz_tuples_by_subject
  ON authz_tuples (subject_type, subject_id, subject_relation, object_type, relation, object_id);
```

- The primary key serves the forward walk ("who is on this object?") and the final "is this subject on it?" probe. The second index serves the reverse walk ("what is this subject on?") and "delete every tuple that points at this object". The query plan uses both as intended [M].
- `subject_relation` is `''`, not `NULL`, so it can sit in the primary key and duplicates can't exist.
- With `WITHOUT ROWID` a tuple costs 2 rows written (the table and one index) [M]. Drizzle 0.45.4 can't express it [V], so the pack either hand-writes this one migration or accepts an ordinary table (3 rows written per tuple) [I]. Recommended: ordinary table first; it keeps CI's "migrations match the tables" step honest.
- The architecture template asks for `created_at` and `updated_at` on every table. Tuples never change (they are added and removed), so `updated_at` has no meaning here. Either add it to satisfy the lint or name the exception.
- Caveat columns are **not** reserved. A caveat is not part of a tuple's identity in SpiceDB or OpenFGA, so adding nullable columns later is a plain `ALTER TABLE ... ADD COLUMN`.
- Postgres (the Supabase add-on): the same columns with `text` and `bigint`, the same two indexes, no `WITHOUT ROWID`, and `.enableRLS()` like the notes table [M for the DDL on PGlite; I for RLS].

### 2.5 The check algorithm

**Step 1, at start-up: flatten the schema into steps.** `compile()` validates the schema and emits one row per way a `(type, name)` can be reached. For the example that is 16 rows [M]:

```
kind     meaning                                   example row (otype, rel, kind, via, stype, srel, target)
self     same object, another relation/permission  note, view, self, '', '', '', edit
arrow    follow a parent tuple, then a permission  note, view, arrow, workspace, workspace, '', view
userset  follow a userset subject                  note, viewer, userset, viewer, workspace, member, member
```

**Step 2, per call: one statement.** Start from the objects being asked about, walk the steps until nothing new appears, then look for the subject on any node reached. This is the text that ran [M]:

```sql
WITH RECURSIVE steps(otype, rel, kind, via, stype, srel, target) AS MATERIALIZED (
  SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'),
         json_extract(value,'$[4]'), json_extract(value,'$[5]'), json_extract(value,'$[6]')
  FROM json_each(?1)                       -- the compiled steps, one JSON parameter
), frontier(root, otype, oid, rel) AS (
  SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]')
  FROM json_each(?2)                       -- what is being asked: [key, type, id, permission] per item
  UNION                                    -- UNION, not UNION ALL: a node is visited once, so cycles end
  SELECT f.root,
         CASE s.kind WHEN 'self' THEN f.otype ELSE t.subject_type END,
         CASE s.kind WHEN 'self' THEN f.oid ELSE t.subject_id END,
         s.target
  FROM frontier f
  JOIN steps s ON s.otype = f.otype AND s.rel = f.rel
  LEFT JOIN authz_tuples t
    ON s.kind <> 'self' AND t.object_type = f.otype AND t.object_id = f.oid AND t.relation = s.via
   AND t.subject_type = s.stype AND t.subject_relation = s.srel
  WHERE s.kind = 'self' OR t.object_id IS NOT NULL
  LIMIT ?3                                 -- the node limit
),
ctx(otype, oid, rel) AS (                  -- request-scoped tuples for this subject
  SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]') FROM json_each(?6)
)
SELECT 'nodes' AS k, CAST(count(*) AS TEXT) AS v FROM frontier
UNION ALL
SELECT DISTINCT 'ok', f.root FROM frontier f
  JOIN authz_tuples t ON t.object_type = f.otype AND t.object_id = f.oid AND t.relation = f.rel
   AND t.subject_type = ?4 AND t.subject_id = ?5 AND t.subject_relation = ''
UNION ALL
SELECT DISTINCT 'ok', f.root FROM frontier f
  JOIN ctx c ON c.otype = f.otype AND c.oid = f.oid AND c.rel = f.rel
```

Why it is shaped this way:

- **One recursive term; no chain longer than three.** D1's limit is five terms per compound chain [V][M]. Here the recursive CTE is a two-term chain and the final select a three-term chain; each is counted on its own [M, fact-check]. The obvious version (one `UNION` arm per step kind) would sit at the limit; this one has room.
- **Everything variable is a JSON parameter.** Six bound parameters whatever the size of the request, so D1's 100-parameter limit never applies [V]. Cloudflare's docs recommend `json_each` for exactly this [V].
- **`checkMany` is the same statement** with more rows in `?2`. Each answer carries the caller's key. `check` is `checkMany` with one item. The node limit is shared by every item in the call, so scale it with the item count or split large calls (fact-check).
- **The node limit fails closed.** If the `nodes` row reaches the limit, the adapter throws; it never returns a partial answer. A limit of 4 on the example data throws [M]. Suggested default: 1,000 (the example walks 12 nodes).
- **Request-scoped tuples carry no subject in the SQL.** The `ctx` join matches on object and relation only. The fact-check ran this statement: a context tuple meant for the actor also granted `view` to a different user checked in the same call [M, fact-check]. The adapter must drop context tuples whenever the subject is not the actor, or the SQL must carry the subject and join on it. Do the second; it can't be forgotten.
- **Userset subjects are not supported as the checked subject.** The final join binds `subject_relation = ''`, so `check(workspace:w1#member, ...)` is answered as if it asked about `workspace:w1` itself. The port should reject a subject with a `relation` in `check`, `checkMany` and `lookupResources` until this is built (fact-check).
- **A cycle ends in a deny**, not a hang: `folder a → b → a` checked in both engines [M].
- **Unknown things are false.** A missing object, an unknown id, another workspace's note: no tuples, so no match [M].
- **Postgres** needs three edits: `$n` parameters, `json_array_elements` for `json_each`, and no `LIMIT` in the recursive term (bound it with `statement_timeout` or a depth column instead). With those, the same walk gave the same answers as the fake on PGlite [M]. The error text is in Postgres's own source (`parse_cte.c`: "LIMIT in a recursive query is not implemented") [V, fact-check]. Careful with a depth column: it makes every row distinct, so `UNION` no longer removes repeats and a cycle runs until the depth cap. Throw at the cap (fail closed), or use Postgres 14+'s `CYCLE` clause [I].

**Step 3, per request: remember answers.** The composition root builds everything per request, so the adapter can keep a `Map` of answers for the life of the request and repeated checks cost nothing. **Never cache across requests** in isolate memory: a revoked grant would live on until the isolate is recycled.

**What it costs** [M, local D1, example schema, table as in 2.4]:

| Call | Rows read | Note |
|---|---|---|
| `check` view on a note through its workspace | 95 | 12 nodes walked |
| `check` manage on a workspace | 47 | |
| `authorize` (edit + view on one note, one statement) | 125 | |
| `checkMany`, 50 notes | 3,136 | about 63 each |
| `lookupResources`, first 50 of 250 viewable notes | 1,969 | reads the whole reachable set |
| `lookupResources`, 13 owned notes | 164 | |
| The same check with `steps` not materialised | 235 | why `AS MATERIALIZED` is there |
| The same check with the steps in a real table | 66 | not worth a second source of truth |
| A hand-flattened query for `note#view` | 5 | what a per-permission compiler would emit |

With 104,000 tuples loaded, D1 reported 0 to 1 ms of SQL time per check and 8 ms for 50 checks in one statement (measured before `AS MATERIALIZED` was added). Wall time through wrangler's local bridge was about 10 ms a call, which says nothing about production [M].

What that means in money: D1 bills rows read, as reported in each query's `meta` [V]. Free includes 5 million rows read and 100,000 rows written a day; Paid includes 25 billion read and 50 million written a month [V]. At 95 rows a check, Free covers roughly 50,000 checks a day. If that ever binds, emit flat SQL per permission (possible whenever the schema has no recursive type): the gap is about 20 times [M].

### 2.6 Lookup and list pages

`lookupResources` runs the walk backwards: start from the tuples the subject is on (second index), apply the steps in reverse, keep the rows of the wanted type and permission, and page by id (`oid > ?after ORDER BY oid LIMIT ?n`). Only the steps that can lead to the wanted permission are sent. The statement that ran [M]:

```sql
WITH RECURSIVE steps(...) AS MATERIALIZED (... FROM json_each(?1)),   -- as above
seeds(otype, oid, rel) AS (
  SELECT t.object_type, t.object_id, t.relation FROM authz_tuples t
   WHERE t.subject_type = ?2 AND t.subject_id = ?3 AND t.subject_relation = ''
  UNION ALL
  SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]') FROM json_each(?4)
),
held(otype, oid, rel) AS (
  SELECT otype, oid, rel FROM seeds
  UNION
  SELECT CASE s.kind WHEN 'self' THEN h.otype ELSE t.object_type END,
         CASE s.kind WHEN 'self' THEN h.oid ELSE t.object_id END,
         s.rel
  FROM held h
  JOIN steps s ON s.target = h.rel AND (CASE s.kind WHEN 'self' THEN s.otype ELSE s.stype END) = h.otype
  LEFT JOIN authz_tuples t
    ON s.kind <> 'self' AND t.subject_type = h.otype AND t.subject_id = h.oid AND t.subject_relation = s.srel
   AND t.object_type = s.otype AND t.relation = s.via
  WHERE s.kind = 'self' OR t.object_id IS NOT NULL
  LIMIT ?5
)
SELECT 'nodes' AS k, CAST(count(*) AS TEXT) AS v FROM held
UNION ALL
SELECT * FROM (SELECT 'id', oid FROM held WHERE otype = ?6 AND rel = ?7 AND oid > ?8 ORDER BY oid LIMIT ?9)
```

Its cost grows with everything the subject can reach, not with the page size: SQLite builds the whole set before it can sort it. That limit is not special to this engine. SpiceDB calls its own `LookupResources` "a heavy request that can cause performance problems when more than 10k results are involved"; OpenFGA caps `ListObjects` at 1,000 results and 3 seconds by default [V]. And the ids come back in id order, while a list page wants newest first.

So list pages follow the three patterns both projects document [V], cheapest first:

| Pattern | When | How |
|---|---|---|
| **By parent** (the default) | Everyone who can see the parent can see its children: notes in a workspace | One `authorize(view, workspace)`, then the repository lists `WHERE workspace_id = ?` with the pack's keyset paging. About 47 rows for the check |
| **Page, then check** | Some rows are private | The repository pages by keyset; `checkMany` filters; repeat until the page is full. OpenFGA: "search, then check". SpiceDB: `CheckBulkPermissions`, which "works better with … cursor-based pagination" [V] |
| **Lookup, then fetch** | A small, scattered set: "shared with me" | `lookupResources` (cap it at about 1,000), then `WHERE id IN (SELECT value FROM json_each(?))` |

A fourth option exists only for the built-in engine: join `authz_tuples` inside the list query. It's the fastest and it's what one of the libraries does. It also puts authorization SQL into every repository and ends the day the engine moves out of the database. Not recommended.

`lookupSubjects` ("who can see this note?") is the forward walk with the last join left open on the subject id [M]. With membership taken from the session token it can't list workspace members: nothing about them is stored. Ask Clerk for those.

### 2.7 Writes

Two kinds of write, two paths.

**A relationship that is created with a row** (a new note's parent and owner). It must commit or fail with the row. D1 has no interactive transactions; `db.batch([...])` is the transaction [V], and Drizzle's `db.transaction()` fails on D1 (the owner's library, measured there). So the **repository** takes the tuples and batches them:

```ts
// notes.repository.ts (the port): the service says which relationships; the adapter makes it atomic
insert(grant: Granted<'workspace', 'contribute'>, row: NoteRow,
       relationships: readonly RelationshipUpdate<AppSchema>[]): Promise<void>

// notes.repository.drizzle.ts
async insert(_grant, row, relationships) {
  await db.batch([db.insert(notes).values(row), ...tuples.statements(relationships)])
}
```

`tuples` is a small helper from `src/server/authz/` that the composition root passes to the Drizzle adapter. For the built-in engine it returns `INSERT ... ON CONFLICT DO NOTHING` and `DELETE` statements on `authz_tuples` (validated against the schema first). Each insert binds 7 values, so one statement per tuple stays far under D1's 100-parameter limit [V]. The memory repository gets the memory authz and writes to it in the same call.

**Deleting** a note deletes its row, every tuple **on** it and every tuple that **points at** it, in one batch [M]. Permission changes belong in the audit log (the architecture template lists them); that row goes in the same batch.

**A relationship that is the whole action** (share a note, change a role): the service calls `authz.writeRelationships` after an `authorize`.

**The duplicate to accept.** `notes.workspace_id` and the tuple `note:N#workspace@workspace:W` say the same thing. Every Zanzibar-style system has this: OpenFGA's own advice is that hierarchies "already live in application's databases" and get mirrored [V]. The same batch keeps them equal; a consistency test (2.11) catches drift.

### 2.8 Consistency tokens

| Engine | What `writeRelationships` returns | What a read does with `consistency` |
|---|---|---|
| Built-in, D1 without read replication | An empty token | Nothing. Every query goes to the one primary, so every read is current [V] |
| Built-in, D1 with read replication (beta) | The session's bookmark (`session.getBookmark()`) | `db.withSession(token)` for `atLeastAsFresh`, `withSession('first-primary')` for `fully_consistent`, `withSession()` otherwise [V]. Fact-check: a replica "may be arbitrarily out of date" [V], so with `withSession()` a revoked grant can still pass. Default checks to `first-primary` (or the bookmark of the last permission write) once replication is on |
| SpiceDB | The ZedToken | Maps one to one [V] |
| OpenFGA | An empty token | `HIGHER_CONSISTENCY` for anything but `minimize_latency` [V] |

The token is a branded string, so a service can store it and pass it back and can't do anything else with it. With the built-in engine a service can ignore it. Tuples and rows live in one database and are written in one batch, so the "new enemy" gap between a permission and its content doesn't open. It does open the day checks leave the database. The Zanzibar habit then applies: store the token of the last permission write next to the row and send it as `atLeastAsFresh` [I].

### 2.9 Not found or forbidden

The kit's rule is "someone else's data returns not found". ReBAC adds a case the rule didn't have: a viewer who tries to edit. They already know the note exists, so `forbidden` is the honest answer. One helper holds the rule, and it also returns a **proof**:

```ts
declare const grantBrand: unique symbol
/** Proof that a check passed. Only authorize() makes one, and repository methods ask for it. */
export interface Granted<T extends string, P extends string> {
  readonly object: ObjectRef<T>
  readonly permission: P
  readonly [grantBrand]: true
}

export async function authorize<S extends Schema, T extends TypeName<S>, P extends Permission<S, T>>(
  authz: Authz<S>,
  subject: SubjectRef<TypeName<S>>,
  permission: P,
  object: ObjectRef<T>,
  rule: { readonly visibleWith: Permission<S, T>; readonly missing: () => AppError },
): Promise<Granted<T, P>> {
  const ask = (p: Permission<S, T>) =>
    ({ permission: p, object }) as { [K in TypeName<S>]: CheckItem<S, K> }[TypeName<S>]
  const [allowed, visible] = await authz.checkMany(subject, [ask(permission), ask(rule.visibleWith)])
  if (allowed) return { object, permission } as Granted<T, P>
  throw visible ? new AppError('forbidden', 'You can see this, but you cannot change it.') : rule.missing()
}
```

- Allowed: carry on. Not allowed but visible: `forbidden`. Not visible, **or doesn't exist**: the same `not_found`. A missing id and someone else's id are indistinguishable because both have no tuples [M].
- Both questions go in one statement (125 rows read [M]).
- The check runs **before** the row is loaded, so the two cases also take the same path through the code.

**Why the proof.** Today the pack is safe by construction: ownership is in every `WHERE`, so a forgotten check finds nothing. With ReBAC, `repo.rename(id, title)` has no scope left, and a forgotten check exposes every row (the classic direct-object-reference hole). If the repository port asks for a `Granted<'note', 'edit'>`, forgetting the check is a compile error; passing a proof of `view` where `edit` is needed is too [M]:

```ts
// notes.service.ts
export function createNotesService({ repo, authz, now, newId }: NotesDeps) {
  const missing = () => new AppError('not_found', 'That note does not exist.')
  const noSpace = () => new AppError('not_found', 'That workspace does not exist.')
  const me = (actor: Actor) => user(actor.userId)

  return {
    async list(actor: Actor, input: { workspaceId: string; cursor?: string; limit: number }) {
      const grant = await authorize(authz, me(actor), 'view', workspace(input.workspaceId),
        { visibleWith: 'view', missing: noSpace })
      const rows = await repo.listByWorkspace(grant, { after: decodeCursor(input.cursor), limit: input.limit + 1 })
      // ...page as today
    },

    async create(actor: Actor, input: { workspaceId: string; title: string }) {
      const grant = await authorize(authz, me(actor), 'contribute', workspace(input.workspaceId),
        { visibleWith: 'view', missing: noSpace })
      const row = { id: newId(), workspaceId: input.workspaceId, title: input.title, createdAt: now(), updatedAt: now() }
      await repo.insert(grant, row, [
        { op: 'touch', object: note(row.id), relation: 'workspace', subject: workspace(input.workspaceId) },
        { op: 'touch', object: note(row.id), relation: 'owner', subject: me(actor) },
      ])
      return toDto(row)
    },

    async rename(actor: Actor, input: { id: string; title: string }) {
      const grant = await authorize(authz, me(actor), 'edit', note(input.id), { visibleWith: 'view', missing })
      const row = await repo.rename(grant, input.title, now())
      if (!row) throw missing()
      return toDto(row)
    },

    async share(actor: Actor, input: { id: string; userId: string }) {
      await authorize(authz, me(actor), 'edit', note(input.id), { visibleWith: 'view', missing })
      await authz.writeRelationships([
        { op: 'touch', object: note(input.id), relation: 'viewer', subject: user(input.userId) },
      ])
    },
  }
}
```

**Limits of the proof (fact-check).** It is a compile-time guard against forgetting, not a security boundary:

- The brand exists only in types. `{...} as Granted<'note', 'edit'>` compiles anywhere. Add a lint rule that bans `as Granted` and building one outside `src/server/authz.ts`.
- It names an object, but nothing ties it to the rest of the call. `insert(grant, row, relationships)` takes a `contribute` proof for workspace W, yet `row.workspaceId` and the tuples are separate arguments. A slip could insert into another workspace or write any tuple (say, `owner` of a different workspace). The repository should derive the parent tuple from `grant.object`, assert `row.workspaceId === grant.object.id`, and accept only tuples whose object is the new row.
- `writeRelationships` asks for no proof, yet granting access is the most sensitive write. Give it one (for example a `share` permission), and fix the relation being written in code. Never take the relation from the request, or an editor could make themselves owner.
- It isn't tied to the actor or the request. Keep it a local value; never store it or pass it between requests.

No role appears anywhere. The service states facts ("the creator owns the note; the note belongs to this workspace") and asks questions ("may this actor edit?"). What `edit` means lives in `schema.ts`.

**Keeping role checks out.** Two lint rules: only `src/server/auth.ts` and `src/server/authz/` may read Clerk's role fields (`orgRole`, `has`, `sessionClaims`); and a service may import the port's types but no adapter. Both fit the boundary lint the pack already runs.

**The composition root** is the only place that picks the engine:

```ts
// src/server/composition.ts
export function notesApi(actor: Actor | null) {
  const db = createDb(env.DB)
  const authz = d1Authz(db, compiledSchema, { context: actor ? contextFromActor(actor) : [] })
  const repo = drizzleNotesRepository(db, tupleStatements(db, compiledSchema))
  const service = createNotesService({ repo, authz, now: Date.now, newId: () => crypto.randomUUID() })
  return notesController(service)
}
```

Swapping to SpiceDB or OpenFGA changes these lines and nothing in a service. One difference from today's `notesApi()`: the factory takes the actor, because request-scoped tuples ([2.10](#210-clerk-organizations)) belong to one request. An app with no Clerk Organizations leaves the parameter out.

### 2.10 Clerk Organizations

What Clerk gives [V, re-checked in the fact-check]: an Organization has members with roles; two default roles (`org:admin`, `org:member`); the creator gets the "Creator" role, which is `org:admin` by default and can be changed; up to 10 custom roles per instance; the verified session token (version 2 claims) carries an `o` claim for the **active** organization with its id (`id`), role (`rol`, without the `org:` prefix) and slug (`slg`). Version 1 claims (`org_id`, `org_role` with the prefix) were deprecated on 2025-04-14; read the organization through Clerk's SDK helpers rather than raw claims so either works. Webhooks exist for syncing, but Clerk's docs say deliveries are "not guaranteed", may arrive out of order and may repeat [V].

Three ways to turn that into tuples:

| | A. From the session token (recommended) | B. Webhook sync into stored tuples | C. The app owns workspaces |
|---|---|---|---|
| How | Each request adds one request-scoped tuple: `workspace:<org id>#<role>@user:<user id>` | `organizationMembership` events write and delete tuples; a nightly job compares with Clerk's API | A `workspaces` table and an invite flow; membership tuples written by the app |
| Freshness | As fresh as the token: Clerk's session token expires after 60 seconds and the frontend SDK refreshes it [V, Clerk docs `how-clerk-works/overview`, 2026-11-23]. A removed member keeps access for up to about a minute | Seconds to minutes; a missed delete leaves access in place until the nightly job | Immediate (same batch) |
| Work | A few lines | A webhook route with signature check, idempotency, a reconcile job | Screens and emails Clerk already has |
| Works with | Built-in engine; OpenFGA (contextual tuples, 100 a request) [V] | Everything | Everything |
| Doesn't work with | SpiceDB (no request-scoped tuples) [V] | | |
| Limits | Only the active organization is known; "who are the members?" must ask Clerk | | Loses the switcher, invitations, domain sign-up and enterprise sign-in |

Recommended: **A**, with the SpiceDB cost written down now (moving there means doing B first). `Actor` grows an optional `org: { id, role }`, filled in `src/server/auth.ts` from the verified session, never from the request body. `contextFromActor` maps the role to a relation through an explicit table in code (not by matching names, so a custom role someone later names `owner` grants nothing until the table says so), and drops any role not in the table, so an unknown role grants nothing. Example-app mapping: `admin` → `workspace#admin`, `member` → `workspace#member`; `owner` and `viewer` exist only if the app adds them as custom roles (a paid add-on in production [V]) or as stored tuples.

Request-scoped tuples are deliberately narrow: direct grants to the subject being checked, nothing else. The engine filters out any that name another subject [M]. That keeps them to one extra join and stops a token from ever granting access to someone else. Fact-check: the SQL in 2.5 does not do this filtering itself (see the note there), so it rests on adapter code. The contract suite must include "the actor's context does not apply when checking another user" for `check`, `checkMany`, both lookups and `lookupSubjects`.

Clerk's roles and custom permissions stay out of services entirely. The token says who is in the workspace; `schema.ts` says what that means.

### 2.11 Tests

| Test | What it proves | Status |
|---|---|---|
| `authz.contract.test.ts`: one suite, run against the memory fake and the D1 adapter (local D1 with the real migration, like the notes repository contract) | Direct relation; computed chain; parent inheritance; another workspace sees nothing; a missing object is false; userset subjects; both lookups with keyset paging; delete revokes; deleting an object removes its tuples; idempotent writes; rejected writes (unknown relation, writing a permission, wrong subject type); a cycle ends in a deny; the node limit throws; request-scoped tuples apply to their subject only | 11 cases passed on both [M] |
| Differential test in the same file: random tuples on the app's schema; every `(user, permission, object)` answer and every lookup must match the fake | The SQL means what the 40-line fake means | 2,400 answers over 25 random graphs matched [M] |
| `schema.test.ts` | `compile(schema)` doesn't throw; the committed `.fga` and `.zed` exports match the schema (2.12) | Not built |
| Type tests (`// @ts-expect-error` lines) | The mistakes in 2.3 and 2.9 don't compile | 13 cases [M] |
| Service tests with the memory fake | Per method: allowed; visible but not allowed → `forbidden`; not visible and missing → the same `not_found` | The pack's existing pattern |
| A consistency test per module | Every note row has its `workspace` tuple and the reverse | Not built |
| `qa` skill | Already tries to read and delete another user's data in a real browser | Exists |

The fake is the reference, as with the pack's repositories: "the memory fake is only trustworthy if it passes what D1 passes".

### 2.12 Changing the schema

The schema is code. It ships with the Worker, so there is no schema migration in the database. What needs care is the stored tuples. SpiceDB's rules are the right ones to copy [V]:

| Change | Safe? |
|---|---|
| Add a relation or a permission; change how a permission is computed; allow another subject type on a relation | Yes. Deploy it |
| Rename a relation; move tuples from one relation to another | No. Add the new relation, write both, backfill with a D1 migration (`INSERT INTO authz_tuples SELECT ... 'new_name' ... WHERE relation = 'old_name'`), switch the permission, delete the old tuples, remove the old relation. One deploy per step |
| Remove a relation or a subject type that still has tuples | No. Delete the tuples first. A start-up check or CI query (`SELECT DISTINCT object_type, relation, subject_type, subject_relation FROM authz_tuples`) compared with the schema finds leftovers |

Two guards worth building:

- **Commit the translated schema** (`authz/schema.fga` and `authz/schema.zed`, generated) and fail CI when it's out of date, the way CI already checks that migrations match the tables. Every permission change then shows up in a pull request as a readable diff, and the export for a later move is always current.
- **Treat any change to `schema.ts` as the `risky` lane.** A one-word edit changes who can see what, for every row, the moment it deploys.

**Sources for this section:** this repo (`stacks/tanstack-start/src/server/*`, `src/modules/notes/server/*`, `.agents/skills/idea/templates/architecture.md`). Cloudflare docs: `d1/platform/limits`, `d1/platform/pricing` and its pricing partial, `d1/worker-api/d1-database` (batch, sessions), `d1/best-practices/read-replication`, `d1/sql-api/query-json`, the D1 limits FAQ, `workers/platform/limits`. SpiceDB docs: `ops/data/writing-relationships`, `modeling/protecting-a-list-endpoint`, `concepts/querying-data`, `modeling/migrating-schema`. OpenFGA docs: `interacting/search-with-permissions`, `best-practices/source-of-truth`, `getting-started/setup-openfga/configuration`. Clerk docs: `guides/organizations/overview`, `control-access/roles-and-permissions`, `guides/sessions/session-tokens`, `guides/development/webhooks/overview` and `syncing`. `drizzle-orm@0.45.4` package files. The prototype runs.

---

## 3. Existing libraries, clients and hosting

### Building the check: three ways compared

| | One recursive statement (recommended) | Step-by-step expansion in the service | Flat SQL compiled per permission |
|---|---|---|---|
| D1 round trips per call | 1 | One per level, or more | 1 |
| Against the 50-queries-per-invocation Free limit [V] | Safe | A list page can exhaust it | Safe |
| Rows read for the example check | 95 [M] | Similar, plus per-request overhead ("to get more throughput … reduce the number of requests" [V]) | 5 [M, hand-written] |
| Intersection, exclusion, conditions | No | Yes: logic is in TypeScript | Partly |
| Recursive types | Yes | Yes | No |
| Code | About 300 lines; 3 statements | More, with its own concurrency and limits; it's what SpiceDB, OpenFGA and `@tsfga/core` do | A compiler from schema to SQL: more to get wrong |
| When | Now | If the subset ever needs exclusion or conditions | When rows read matter |

### TypeScript libraries

Checked on npm today [V]; READMEs read at the commits in Sources. Download counts were not reachable, so "popular" is unverified for all of them.

| Package | Version, last publish | Licence | What it is | Verdict |
|---|---|---|---|---|
| `@zanzibar-ts/core` | 0.1.1, 2026-06-10 (2 releases; repo last touched 2026-07-17) | MIT | In-process engine with memory and **D1** stores, a typed model builder, the model stored as OpenFGA's JSON, consistency tokens from D1 bookmarks. Its README says it was written by an AI agent "with no line-by-line human review" and is tested by comparing against live OpenFGA and SpiceDB | The closest fit and the most honest about its risks. Too young and too single-handed to be the security core today. **Spike it as a second adapter behind the port** |
| `@tsfga/core` + `@tsfga/kysely` | core 0.7.1, 2026-10-30 (10 releases since 2026-02); kysely 0.6.0 | MIT | OpenFGA-compatible check with CEL conditions; storage behind a `TupleStore` interface; the shipped store is Kysely on Postgres. Node 22.12+, ESM only | A candidate for the Postgres add-on. For D1 the kit would write the store itself, and it expands step by step |
| `@zanzojs/core` + `@zanzojs/drizzle` | 0.3.1 / 0.3.2, 2026-03-23 (7 core releases since 2026-02-27; repo quiet since 2026-04-03) | MIT | Drizzle adapter that works on D1; turns permissions into `EXISTS` subqueries | The pushdown idea is good; its model doesn't translate one to one and it has been quiet for seven months |
| `polizy` | 0.6.1, 2026-09-26 | MIT | In-process; memory and Prisma storage; its own model (actions mapped to relations) | No: Prisma, and no path to SpiceDB or OpenFGA |
| `graplix` | 1.0.0, published 2025-06-29 (the registry's "modified" date is 2025-12-21) | none declared on npm, and no licence file in the package | Resolver-style checks using OpenFGA's DSL; no tuple store | No |
| `@casl/ability` | 7.1.3, 2026-11-13 | MIT | Mature rules-and-conditions library | Not tuples. A different model |
| `casbin` | 5.51.1, 2026-06-25 | Apache-2.0 | Policy-file engine (roles, attributes) | Not Zanzibar-shaped |

The kit's rule is to reuse a popular, maintained library before building. None of these is both, for this job, on D1. The port keeps the decision cheap to revisit: a library becomes one more adapter that has to pass the contract suite.

Two small official packages are worth using in dev tooling: `@openfga/syntax-transformer` 0.2.3 (Apache-2.0; parses and validates the OpenFGA DSL) and `@authzed/spicedb-parser-js` 1.2.0 (parses SpiceDB schemas). Both accepted the translated example schema [M].

### The clients, for the adapters

| | `@openfga/sdk` | `@authzed/authzed-node` |
|---|---|---|
| Version on npm [V] | 0.9.8, 2026-11-12 | 1.6.1, 2025-10-06. The repo has a `v1.7.0` tag from 2026-05 that isn't on npm |
| Licence | Apache-2.0 | Apache-2.0 |
| Transport | HTTP through `axios` 1.21.1; needs Node 20.19+ | gRPC through `@grpc/grpc-js` |
| On Workers | `check` worked in local workerd (`wrangler dev` 4.166.0, `nodejs_compat`) against a mock HTTP server, with the default client and with `axios.create({ adapter: 'fetch' })` passed as the constructor's second argument [M, fact-check]. Not tried on production Workers, with credentials, or against a real OpenFGA | Unlikely: `node:http2` is only a non-functional stub on Workers [V, Cloudflare docs, 2026-11-23], and `grpc-js` requires `http2` in its transport code [V, package source of `@grpc/grpc-js` 1.13.4] |
| Fallback | Call OpenFGA's HTTP API with `fetch` (check, batch check, list objects, write) | Call SpiceDB's HTTP API with `fetch`. It exists behind `--http-enabled`, but "Authzed doesn't officially maintain HTTP client libraries" [V] |

Either adapter is likely a thin `fetch` client the kit writes itself: about one request per port method. Limits to respect: OpenFGA takes 100 tuples a write and 50 checks a batch by default; SpiceDB takes 1,000 updates a write [V].

### Running SpiceDB or OpenFGA for a Cloudflare app

| Option | What it takes | Cost | Notes |
|---|---|---|---|
| **Built-in engine on D1** | Nothing new | D1 rows. Free covers about 50,000 checks a day [M][V] | Same database, same batch, no extra hop |
| **OpenFGA, self-hosted** (v1.23.0, 2026-11-20, Apache-2.0, a CNCF Incubating project) [V] | One container and a database: Postgres 14+, MySQL 8, or SQLite (beta) [V] | A small server and a database | HTTP API is native, which suits `fetch` |
| **Auth0 FGA** (hosted OpenFGA) | An account | A free trial that is "not time-limited"; production use needs an enterprise contract [S] | Not confirmed. Prices not found |
| **SpiceDB, self-hosted** (v1.57.1, 2026-11-10, Apache-2.0) [V] | One or more containers and Postgres 15+, CockroachDB or Spanner (MySQL "not recommended"; no SQLite) [V] | A server and Postgres | Start it with `--http-enabled` for Workers |
| **AuthZed Cloud** (hosted SpiceDB) | An account; pick region, vCPUs, replicas [V] | Usage-based, no commitment [V]. About $2 an hour for a deployment, and no free plan, per aggregator sites that disagree with each other [S]. Search results also mention a "Starter Program" with up to $700 of credits [S, fact-check; terms not seen] | Not confirmed |
| **Cloudflare Containers** for either | Workers Paid; a container next to the Worker [V] | Per 10 ms of use [V] | Disk is "ephemeral by default" [V], so the engine still needs a database somewhere else |

Latency: any external engine adds a network round trip per check from the Worker to wherever the engine runs [I]. D1 is not free of this either (a D1 database has one primary location unless read replication, still beta, is on [V]), but the built-in engine pays it once for the check and the data together. Each hosted option costs money or a new account, which is on the kit's always-stop list.

**Sources for this section:** npm registry (`npm view` for every package and date above, 2026-11-23). READMEs and docs of `skmtc/zanzibar-ts`, `emfga/tsfga`, `GonzaloJeria/zanzo`, `bratsos/polizy`, `openfga/js-sdk`, `authzed/authzed-node`. Tags and licence files of `authzed/spicedb` and `openfga/openfga`. OpenFGA docs: `getting-started/setup-openfga/configure-openfga`, `configuration`, the project page. SpiceDB docs: `concepts/datastores`, `getting-started/client-libraries`, `authzed/guides/picking-a-product`, `authzed/guides/cloud`. Cloudflare docs: `workers/runtime-apis/nodejs`, `containers/platform/pricing`, `containers/faq`. Prices: web-search summaries only.

---

## 4. Moving to SpiceDB or OpenFGA later

SpiceDB's own migration guide describes the same order: convert the schema, load the data, convert the calls, "run both systems side by side", then cut over [V]. The port removes the "convert the calls" step.

1. **Translate the schema.** Because the subset is the common ground, this is a small code generator. The prototype's is about 30 lines. For the example it emits:

   ```
   # OpenFGA
   type note
     relations
       define workspace: [workspace]
       define owner: [user]
       define editor: [user, workspace#member]
       define viewer: [user, workspace#member]
       define edit: owner or editor or manage from workspace
       define view: edit or viewer or view from workspace
       define delete: owner or manage from workspace
   ```

   ```
   // SpiceDB
   definition note {
     relation workspace: workspace
     relation owner: user
     relation editor: user | workspace#member
     relation viewer: user | workspace#member
     permission edit = owner + editor + workspace->manage
     permission view = edit + viewer + workspace->view
     permission delete = owner + workspace->manage
   }
   ```

   The OpenFGA text passed `validateDSL` in `@openfga/syntax-transformer`, and came out as the expected `computedUserset` and `tupleToUserset` JSON; the SpiceDB text parsed with `@authzed/spicedb-parser-js` [M]. Neither was loaded into a running server.
2. **Dual-write through an outbox.** The repository's batch gains one more insert per tuple, into an `authz_outbox` table. A Queue consumer or cron sends rows to the new engine with idempotent writes (`TOUCH` in SpiceDB) and marks them done. D1 stays the source of truth, so a failed delivery is a retry, never a lost permission.
3. **Backfill.** Copy `authz_tuples` across in chunks (100 a write for OpenFGA, 1,000 for SpiceDB [V]), then let the outbox catch up.
4. **Shadow reads.** A `shadowAuthz(primary, candidate)` adapter answers from the built-in engine, asks the new one too, and logs every disagreement. The contract suite runs against the new adapter as well.
5. **Switch reads** in the composition root when the log is quiet. Keep dual-write on for a way back.
6. **Then decide** whether D1 keeps its tuples (as the outbox source and for consistency tests) or stops.

What changes for the app, even with the port:

| Topic | Change |
|---|---|
| Atomic writes | Gone. Permissions arrive a moment after the row. Pass the write's token (SpiceDB) or ask for higher consistency (OpenFGA) on the next read |
| Clerk membership from the token | Fine on OpenFGA. On SpiceDB, switch to the webhook sync first [V] |
| `lookupSubjects` paging | SpiceDB's "does not support cursoring" [V]. The adapter pages in memory |
| Cycles | SpiceDB errors where the built-in engine denies [V][M]. Map the error to a deny and log it |
| Latency and cost | A network hop per check; a server or a subscription |
| What it buys | Exclusion, intersection, conditions, wildcards, watch, audit, and scale past one D1 database (10 GB, single-threaded [V]) |

**Sources for this section:** SpiceDB docs: `migrate-to-spicedb/overview`, `migrate-from/openfga`, `ops/data/writing-relationships`, `concepts/querying-data`. OpenFGA docs: `configuration`, `getting-started/immutable-models`. Cloudflare docs: D1 limits and its FAQ. The prototype's translator run.

---

## 5. Risks

| # | Risk | Why it matters | What reduces it |
|---|---|---|---|
| 1 | **A home-made engine is the security core** | A bug grants access silently | Keep the subset small; the fake as the reference; the differential test in CI; fail closed everywhere; the `qa` cross-user check |
| 2 | **A forgotten check exposes everything** | Ownership is no longer in the `WHERE` | The `Granted` proof on repository methods; a service test per method for the other-user case |
| 3 | **Production D1 may not behave like local D1** | Plans, `AS MATERIALIZED`, row counting and the `LIMIT` in the recursive term were only seen locally | Spike S1 before building |
| 4 | **Rows-read cost** | About 95 a check; `lookupResources` reads the whole reachable set | List by parent; cap lookups; the per-permission compiler; watch `meta.rows_read` |
| 5 | **Rows and tuples drift apart** | A note with no parent tuple is invisible; a stale tuple is a leak | Same batch; a consistency test; delete tuples on both sides of an object |
| 6 | **A schema edit changes access for everyone at once** | One word in `schema.ts` | Risky lane; the committed `.fga`/`.zed` diff; tests name the expected answers |
| 7 | **The subset is outgrown** | Blocklists, public links and time limits are common asks | Wildcards are a small extension; the rest is the reason to move engines, and the port is the way |
| 8 | **Clerk membership from the token** | Only the active organization; revocation waits for the token to expire; doesn't carry to SpiceDB | Short token life; document the sync path; unknown roles grant nothing |
| 9 | **Recursive data** | A loop is a deny here and an error in SpiceDB | No recursive types until there is a write-time cycle check |
| 10 | **The proof pattern is new to the kit** | Every repository signature changes; agents may fight it | Decide it once in `docs/decisions.md`; put it in the module generator |
| 11 | **Prices and hosted limits are unknown** | The "later" plan may cost more than expected | Check with the vendors before choosing; it's a money decision for the person |
| 12 | **D1's own ceiling** | 10 GB and one thread per database [V] | Tuples are small; this is years away for a starter, and it's the moment to move engines |

## Before anyone builds

1. **S1: the engine on real D1.** Deploy the walk to a test Worker. Confirm the answers, read `meta.rows_read` and timings, and confirm the five-term limit and `LIMIT` in a recursive term behave as they do locally. Half a day.
2. **S2: `@zanzibar-ts/core` behind the port.** Wrap its D1 store, run the kit's contract suite and compare rows read. Decides question 1 with evidence.
3. **S3: Clerk on the pack.** Read `orgId` and the role from the verified session in `src/server/auth.ts` on Workers; measure how long a removed member keeps access.
4. **S4: one external adapter.** OpenFGA in Docker with SQLite, a `fetch` adapter, the contract suite. Proves the port is real and finds what the subset can't express there.
5. **Fact-check this dossier.** Done 2026-11-23 ([Fact-check](#fact-check)). Prices are still open: confirm them with the vendors before any money decision.
6. **Fix security concerns 1 to 3** from the Fact-check section (context tuples in the SQL, the proof on writes, userset subjects in `check`) in the design before the first issue is written.

What the kit would change if this is accepted (each its own issue, none done here):

- `src/server/authz.ts`, the `src/server/authz/` folder and the migration. One point to settle: section 18 keeps simple apps on the owner filter, while the brief for this research asked for ReBAC by default. Recommended: ship the port and the engine in the base pack so they are there from day one, keep the pack's notes example on the owner filter, and make "notes in workspaces" the worked example in the stack skill for apps whose security policy needs more than ownership. An owner-only app gains nothing from a tuple per note.
- `Actor` (an optional organization), and the composition root's factories.
- `guide/app-conventions.md` section 18 and the architecture template: drop "until research confirms", link here, and amend "never forbidden" as in 2.9.
- `docs/security-policy.md`, the `pr-security` checklist, two lint rules and the module generator.

## Sources

Read on 2026-11-23. "Docs" means the project's documentation repository on GitHub at the commit shown, not the website.

| Source | Version or commit |
|---|---|
| SpiceDB docs (`authzed/docs`) | `3f30daf`, 2026-11-20 |
| OpenFGA docs (`openfga/openfga.dev`) | `a0edd83`, 2026-11-19 |
| Cloudflare docs (`cloudflare/cloudflare-docs`: D1, Workers, Containers) | `1c6e632`, 2026-11-22 |
| Clerk docs (`clerk/clerk-docs`) | `4a1fa58`, 2026-11-22 |
| `authzed/spicedb` | tag `v1.57.1`, `7074da7`, 2026-11-10; `LICENSE` |
| `openfga/openfga` | tag `v1.23.0`, `d67ba7b`, 2026-11-20; `LICENSE`, `README.md` |
| `authzed/authzed-node` | `518ff92`, 2026-05-26; npm `1.6.1` |
| `openfga/js-sdk` | `5b75def`, 2026-11-13; npm `0.9.8` |
| `skmtc/zanzibar-ts` | `67385f5`, 2026-07-17; npm `@zanzibar-ts/core@0.1.1` |
| `emfga/tsfga` | `bff4eb5`, 2026-10-29; npm `@tsfga/core@0.7.1`, `@tsfga/kysely@0.6.0` |
| `GonzaloJeria/zanzo` | `b060b95`, 2026-04-03; npm `@zanzojs/core@0.3.1`, `@zanzojs/drizzle@0.3.2` |
| `bratsos/polizy` | `5e70656`, 2026-09-26; npm `polizy@0.6.1` |
| npm registry | `npm view` for every package named, including `@casl/ability@7.1.3`, `casbin@5.51.1`, `graplix@1.0.0`, `@openfga/syntax-transformer@0.2.3`, `@authzed/spicedb-parser-js@1.2.0`, `drizzle-orm@0.45.4`, `wrangler@4.166.0` |
| This repo | `stacks/tanstack-start/` (server, notes module, migration), `stacks/tanstack-start-addons/database-supabase/ADDON.md`, `.agents/skills/idea/templates/architecture.md`, `guide/app-conventions.md` |
| The owner's private research library | `service-boundaries`, `layered-api` (and its D1 reference), `web-security`, `agent-permissions` skills |
| Prototype | Scratch code, not kept: schema compiler, D1 adapter, memory fake, contract and differential tests, a Postgres run on PGlite 0.5.16, a typecheck with TypeScript 6.0.3, the schema translator. Run on Node 22.23.5 with wrangler 4.166.0's local D1 |
| Web search (secondary) | AuthZed Cloud pricing (aggregator pages and `authzed.com/pricing` snippets); Auth0 FGA plans (`docs.fga.dev/subscription-plans` snippet) |
| Not opened | The Zanzibar paper; every vendor website; npm download counts |

## Fact-check

Done on 2026-11-23 by a second agent that did not trust the dossier's conclusions. Sources were read the same day: the npm registry (`npm view`, and package files from `npm pack`); the docs repositories of SpiceDB (`authzed/docs` `3f30daf`), OpenFGA (`openfga/openfga.dev` `a0edd83`), Clerk (`clerk/clerk-docs` `4a1fa58`) and Cloudflare (`cloudflare-docs`, `production` branch); release tags through `git ls-remote`; Postgres's `parse_cte.c` on `master`; the CNCF landscape file. Vendor websites, `usenix.org`, `sqlite.org` and `postgresql.org` could not be reached from this session either. Prototype checks were re-run in scratch code (not kept): SQLite 3.53.1 with the compound limit set to 5, local D1 through `wrangler` 4.166.0's `getPlatformProxy`, and `wrangler dev` for the OpenFGA SDK.

### Changed

| Where | Was | Now |
|---|---|---|
| Finding 1, 2.5 | "three compound terms in all" | The five-term limit counts each compound chain on its own, not the whole statement [M on local D1 and SQLite] |
| Decision 2 | "100 active organizations" | 100 Monthly Retained Organizations in production (at least two members, one active that month); custom roles need the B2B Authentication add-on [V] |
| 2.10 | Token lifetime 60 s [I] | 60 s, refreshed by the frontend SDK [V]. Creator role is `org:admin` by default but can be changed. Version 1 claims are deprecated |
| 2.10 | Role mapped "to a relation" | Through an explicit table, never by name matching |
| 2.5 | Postgres guard: depth column | A depth column breaks the cycle-stopping `UNION`; throw at the cap or use `CYCLE` |
| 2.5, 2.10 | "request-scoped tuples apply to their subject only" | True only if the adapter filters them; the SQL itself does not [M]. Put the subject in the SQL |
| 2.9 | The proof makes a forgotten check a compile error | Still true, but the proof is forgeable by a cast, isn't bound to the row or tuples written, and `writeRelationships` has none. Fixes listed there |
| 2.8 | Read-replication mapping | Default checks to the primary or a bookmark once replicas are on |
| Section 1 table | OpenFGA "breadth 10" | A per-level concurrency setting, not a breadth cap |
| Section 3, libraries | `graplix` 1.0.0, 2025-12-21 | Published 2025-06-29; 2025-12-21 is the registry's "modified" date. No licence file in the package either |
| Section 3, libraries | `@tsfga/kysely` 0.7.1 (implied) | 0.6.0 |
| Section 3, clients | `@openfga/sdk` on Workers "untested" | `check` works in local workerd against a mock server, default client and fetch adapter [M]. Production not tried |
| Section 3, clients | "no `http2` module" on Workers | `node:http2` is a non-functional stub [V]; `grpc-js` requires it [V, package source] |

### Confirmed [V, 2026-11-23]

- npm: `@openfga/sdk` 0.9.8 (2026-11-12, Apache-2.0, `axios` 1.21.1, Node ≥ 20.19); `@authzed/authzed-node` 1.6.1 (2025-10-06, Apache-2.0, `@grpc/grpc-js`); a `v1.7.0` tag at `518ff92` that isn't on npm; `@zanzibar-ts/core` 0.1.1 (2 releases, both 2026-06-10, MIT, README says AI-written with no line-by-line human review); `@tsfga/core` 0.7.1 (Node ≥ 22.12); `polizy` 0.6.1; `@casl/ability` 7.1.3; `casbin` 5.51.1 (Apache-2.0); `@openfga/syntax-transformer` 0.2.3; `@authzed/spicedb-parser-js` 1.2.0; `drizzle-orm` 0.45.4 (published 2026-10-08). No `WITHOUT ROWID` in `drizzle-orm` 0.45.4 **or** 1.0.0-rc.6.
- Tags: SpiceDB `v1.57.1` = `7074da7`, Apache-2.0; OpenFGA `v1.23.0` = `d67ba7b`, released 2026-11-20 per its changelog. OpenFGA storage: PostgreSQL 14+, MySQL 8, SQLite (beta). OpenFGA is CNCF Incubating (landscape file). SpiceDB: Postgres 15+ for best performance, MySQL "not recommended", no SQLite.
- D1: five compound terms; 100 bound parameters; 50 / 1,000 queries per invocation with a batch counting as one; batch is a transaction that rolls back on any failed statement (also re-run on local D1: a failed second insert left zero rows); `json_each` recommended; pricing (5 M reads and 100 k writes a day free; 25 B and 50 M a month on Paid); 10 GB Paid (500 MB Free); one thread per database; read replication beta and `withSession` options.
- OpenFGA: no consistency token yet ("considering a similar feature"); 100 contextual tuples a request; 100 tuples a write; 50 checks a batch; ListObjects 1,000 results and 3 s; depth 25; the arrow rule on usersets and wildcards; the paper's `_this` / `computed_userset` example; "Zanzibar's *model* is what's valuable".
- SpiceDB: relations vs permissions, `a + b & c`, wildcard warning, arrow over subject relations ignores `#relation`, 50 hops, no cycles, `TOUCH` and silent `DELETE`, 1,000 updates a write, LookupResources "heavy … more than 10k", LookupSubjects has no cursoring, name and object-id rules, no contextual tuples, HTTP API behind `--http-enabled` with no official HTTP client.
- Clerk: `o` claim with `id`, `rol` (no prefix), `slg`; 10 custom roles; webhooks not guaranteed, no ordering, duplicates possible.
- Postgres refuses `LIMIT` in a recursive query (source text).
- Re-run of the 2.5 statement on SQLite with the example schema: 16 compiled steps; 12 nodes for "view a note through its workspace"; a two-folder cycle ends with the right answer both ways; a limit of 4 is reached (so the adapter throws). Matches the dossier.

### Could not verify, and why

- **Prices and free tiers** for AuthZed Cloud and Auth0 FGA: vendor sites unreachable; search snippets only [S].
- **The Zanzibar paper**: `usenix.org` unreachable. Its API list (Read, Write, Watch, Check, Expand) and zookies are confirmed second-hand by the OpenFGA and SpiceDB docs; scale figures remain [I].
- **Production D1** behaviour (row counts, plans, `AS MATERIALIZED`, `LIMIT` in the recursive term): only local D1 was run. Spike S1 still stands.
- **`@openfga/sdk` on production Workers**, with real credentials and a real server.
- **npm download counts** (`api.npmjs.org` unreachable), so "popular" is still unverified.
- Rows-read figures (95, 125, 3,136 …) were not re-measured.

### Security review

The overall shape holds: positive-only rules, one statement, fail closed at the node limit, the same `not_found` for missing and hidden, and tuples written in the same batch as the row. Concerns, most serious first:

1. **Context tuples can leak to other subjects.** The SQL matches them on object and relation only. Checking any user other than the actor in the same request credits them with the actor's membership. Fix it in the SQL, and test it.
2. **The proof doesn't cover writes.** It can be forged by a cast, isn't bound to the row or tuples written, and `writeRelationships` needs none. A bug in `create` or `share` could write `owner` tuples anywhere. Bind the proof to what's written, give writes a proof, and fix relations in code.
3. **Userset subjects in `check` are silently mis-answered** (the relation is dropped). Reject them in the port.
4. **Revocation lag.** Clerk tokens live 60 s. With D1 read replicas, `withSession()` can read stale tuples. Say so in the security policy; use the primary for checks.
5. **Check, then write.** `share` runs `authorize` and the write as two calls, so a grant revoked in between still lets one write through. It's small; accept it, but put the audit row in the same batch as the tuple write.
6. **Cycles.** Safe on SQLite and D1 (`UNION` removes repeats). Unsafe on Postgres with a depth column unless the cap throws. Folder-in-folder data still needs a write-time cycle check.
7. **The node limit is shared** across `checkMany` items: big batches fail closed (safe, but list pages may break).
8. **Clean-up gaps.** Deleting an object must also delete userset tuples that point at it (`subject_relation <> ''`). Deleting a Clerk organization leaves stored tuples that name it.

`not_found` versus `forbidden` is sound as written: `forbidden` only reaches someone who can already see the object, both answers come from one statement, and a row missing behind a stale tuple still ends in `not_found`.

### Does the recommendation change?

No. Build the small engine behind the port. Before building, fix concerns 1 to 3 and add them to the contract suite. They are cheap now and hard to retrofit.
