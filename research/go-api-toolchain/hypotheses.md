# Hypotheses

What I expected before running each check, one line each, with what would prove it wrong. This session did not commit the list before its first search, so the order rests on my word. The dossier's "Hypotheses, checked" section says how each held up.

- **H1.** depguard's `pkg` setting takes globs, so one rule can cover every module. *Wrong if* a glob rule lets a bad import through.
- **H2.** go-arch-lint can say "modules don't import each other" and "handler, service, repository in one direction" for every module with no per-module rule. *Wrong if* some cross-module import still passes.
- **H3.** Spec-first and code-first both fail `check` on drift, but only if `check` regenerates the generated files and compares them. *Wrong if* either fails with no regenerate step, or passes with one.
- **H4.** openapi-typescript with openapi-fetch is the community default and fits the web pack's TypeScript. *Wrong if* it won't install or run on the pack's TypeScript.
- **H5.** oapi-codegen's strict server enforces the spec's request constraints. *Wrong if* a body that breaks `minLength` gets a 2xx.
- **H6.** golangci-lint has a linter for file length. *Wrong if* its list has none.
- **H7.** `net/http`'s ServeMux is enough as the router. *Wrong if* it lacks 405 handling or path parameters, or the contract tools need chi or echo.
- **H8.** A Makefile or Taskfile is the natural home for the Go commands. *Wrong if* the local gate and the agent-file guard only read `package.json`.
