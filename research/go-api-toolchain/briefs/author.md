# Brief: author

Two parts, verbatim except that a session link is left out: the coordinator's brief to this build session, then the goal of issue #342.

## The coordinator's brief (2026-11-28)

> Build issue #342: "Research: the Go pack's toolchain: lint with a boundary rule, tests, end-to-end, and an OpenAPI contract with a generated TypeScript client".
>
> Use the `build` skill and the `research` skill. Follow both. Do the job yourself, except for the one sub-agent the research skill's own step names: the fact-check in a fresh session. Run that with its own fresh context, and give it only the dossier and the store.
>
> - Use web search and page fetches for current versions and docs. Label and date every source. If a site can't be fetched, say so and use another source. Never invent a version: if you can't confirm one, say "unconfirmed" and give the re-check command.
> - No GitHub Actions anywhere in the recommendations. The kit runs checks locally.
> - The owner's standing instruction is that worker agents run Sonnet 5.5 at high effort, so use that. Note it in the dossier's provenance. Skip any step that captures to a private research library outside this repo. Note that you skipped it.
> - Full automation: ask nothing. Every open choice becomes your recommended pick, recorded as "AI pick, not reviewed".
> - Copy the shape of the existing `research/go-api-platform.md` (#340) and its store, and `stacks/python-fastapi/PACK.md` for pinned versions and re-check commands.
> - Stay inside the fence: research docs, decision, README row and CHANGELOG. No pack code.

## Issue #342's goal (as filed 2026-11-27)

> Run the `research` skill on the tools the Go pack is built with:
> 1. **Lint and the boundary rule:** golangci-lint, and how to fail a build when one module under `internal/modules/` imports another, or a handler skips the service (depguard, go-arch-lint, a small `go list` script). Plus file and function size rules matching `AGENTS.md` (warn 300, stop 500 lines; functions about 60).
> 2. **The check contract for Go:** what `typecheck`, `test` and `build` run, and what `test:e2e` means for an API (Go tests against the built binary, Hurl, schemathesis, Playwright's API testing). Whether the scripts live in `package.json`, a `Makefile` or a Taskfile, given that the local gate reads `package.json` (`coordinate` step 6.1.3).
> 3. **The contract:** spec-first (oapi-codegen's strict server, ogen) against code-first (huma, swaggo), judged on one thing first: can the frontend drift from the server without `check` failing? Then the TypeScript client generator (openapi-typescript with openapi-fetch, orval, hey-api).
> 4. **The router:** `net/http`'s `ServeMux` (Go 1.22+) against chi and echo.
>
> Every pick gets its pinned version and a re-check command, like `stacks/python-fastapi/PACK.md`.

The owner's rule this serves (decision 344-1, the owner in #279, 2026-11-27): an app that needs a backend and isn't on Cloudflare Workers gets a Go backend with a TypeScript web frontend that calls it.

## What good looks like (the author's bar)

- Vendor docs, registries and release pages read on 2026-11-28, each with its page date or "no date on the page".
- At least three options per question, compared on the same columns.
- Where a claim can be tested here, test it: the Go toolchain, Node and Python were installed, so the boundary rules, the drift cases, the validation gap, the generators and the routers were run on small scratch apps, and every output is kept in `experiments/`.
- The kit's constraints: no GitHub Actions (every check and deploy runs from the session), the local gate reads `package.json`, the web pack pins TypeScript 6.0.3 and runs on pnpm, the owner is a beginner.
- A recommendation and a confidence per question, what would change it, and a re-check date of 3 months: versions move weekly.
