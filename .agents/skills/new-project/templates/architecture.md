# Architecture

Every agent follows this. If the code needs to break a rule here, stop and ask first.

## Shape

- **Modular monolith.** One app, built from decoupled feature modules. Any module could later be lifted out into its own service without a rewrite.
- **Feature modules don't import each other.** The app layer on top wires them together.
- Each module exposes one public entry point (`index.ts`). Nothing outside the module imports its internals.

## Folder structure

```
src/
  app/            routes, layouts, providers: wires the features together
  features/
    <feature>/
      api/        client calls for this feature
      components/ UI for this feature only
      hooks/
      server/     controller, service, repository for this feature
      types/
      index.ts    the only thing other code may import
  components/     shared UI (wrappers around the UI kit)
  lib/            shared helpers, config, clients
  testing/
```

Adjust for the platform, but keep the rule: grouped by feature, not by file type.

## API layers

```
request → controller → service → repository / client
```

| Layer | Does | Never does |
|---|---|---|
| Controller | parse and validate input, check auth, call a service, map the result to a response | business rules, SQL |
| Service | the business rules | touch HTTP, SQL or an SDK directly |
| Repository | read and write the database | business rules |
| Client | talk to an outside API or SaaS | business rules |

- One **composition root** creates the repositories and clients and passes them in. That's dependency injection, and it's what makes services easy to test with fakes.
- Validate input with a schema at every boundary, and reject unknown fields.

## UI

- Use the chosen UI kit's components. Don't hand-roll a button, modal or form control the kit already has.
- One component does one job. Split anything that grows past ~300 lines.

## Data

- Migrations go forward only. Never edit one that has already run.
- Schema changes follow the risk dial in `docs/stack.md`.
