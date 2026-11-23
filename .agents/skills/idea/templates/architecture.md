# Architecture

Every agent follows this. If the code needs to break a rule here, stop and ask first.

## Shape

- **Modular monolith.** One app built from feature modules. Any module could later be lifted out into its own service without a rewrite.
- **Modules never import each other.** Routes and the app layer wire them together.
- A module may import shared code (`components/`, `hooks/`, `lib/`, `db/`). Shared code never imports a module.
- The boundary check in lint enforces both rules.

## Folder structure

Module-based, in the style of the code-with-antonio app repos. A feature's UI, hooks, server code and schemas live together in one folder.

> **This layout is for a single full-stack web app** (TanStack Start, React Router, Next.js-style apps, and similar). It doesn't fit a monorepo, a native iOS, Android or Windows app, a game engine project like Unity, or a CLI. For those, the `stack` step picks that platform's usual layout. The rules above still apply: features stay decoupled, and shared code never imports a feature.

```
src/
  routes/                  file-based routes. Thin: load data, check auth, render a module's view
  modules/
    <feature>/
      ui/
        views/             one view per page: <feature>-view.tsx, <feature>-id-view.tsx
        components/        UI used only by this feature
      hooks/               use-<feature>-*.ts
      server/
        <feature>.functions.ts         the route table: one short entry per server function, calling the controller
        <feature>.controller.ts        validate input, call one service method, map the result
        <feature>.service.ts           business rules. No HTTP, no SQL
        <feature>.repository.ts        the interface the service depends on
        <feature>.repository.drizzle.ts  the database adapter
        <feature>.repository.memory.ts   the test fake
        <feature>.table.ts             the Drizzle table
      schemas.ts           Zod schemas shared by client and server
      types.ts
  components/
    ui/                    shadcn/ui primitives. Generated, don't hand-edit
                           shared app components (empty-state, error-state, data-table)
  hooks/                   shared hooks
  lib/                     shared helpers, config, the error type
  db/                      database client and migrations config
  server/
    composition.ts         the one place that builds repositories and clients and wires them into services
    auth.ts                resolves the signed-in user. Only *.functions.ts imports it
```

- **Files are kebab-case.** Views end in `-view.tsx` and export a PascalCase component. Hooks are `use-*.ts`.
- Every view handles its loading, empty and error states.

## API layers

```
request → <feature>.functions.ts → <feature>.controller.ts → <feature>.service.ts → <feature>.repository.ts → adapter
```

| Layer | Does | Never does |
|---|---|---|
| Route table (`.functions.ts`) | declare each server function, attach auth, call the controller | anything else. Keep entries to a few lines. |
| Controller (`.controller.ts`) | parse input with the module's schema, call one service method, map errors to responses | business rules, SQL |
| Service | business rules | touch HTTP, SQL or an SDK directly |
| Repository (interface + adapter) | read and write the database | business rules |
| Client (if any) | talk to an outside API | business rules |

- **Why two files for the controller:** the route table is what the browser bundle sees, so it stays tiny. The controller is a plain function, so its tests run without a server.
- **One composition root** (`src/server/composition.ts`) builds the adapters and passes them in. That's what lets a service be tested with the memory fake.
- **Validate at every boundary,** and reject unknown fields.
- **One error shape** for every route. Never send stack traces, SQL or internal names to the client.
- **Someone else's data returns "not found"**, never "forbidden".

## UI

- Use shadcn/ui components. Don't hand-roll a button, dialog or form control the kit already has.
- One component does one job. Split anything past ~300 lines.

## Data

- Migrations only go forward. Never edit one that has already run.
- Schema changes follow the risk dial in `docs/stack.md`.

## References

The layering takes ideas from Bulletproof React and from ports and adapters. The folder layout follows the module style above, not Bulletproof's.
