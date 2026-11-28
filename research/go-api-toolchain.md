# Go API toolchain: research dossier

<!-- From the research skill. The store lives in research/go-api-toolchain/ (references/desk-research.md).
     Each claim carries its ID from claims.csv and its label. Opinion says "I think". -->

**Date:** 2026-11-28. The status and the re-check date live in the index, `README.md`. Re-check in 3 months: tool versions move weekly, and two of the four picks turned on a TypeScript release that is a few months old.

## The question

Which tools should the Go pack (#279's children) be built with: the lint and boundary check, the check contract, the API contract with its generated TypeScript client, and the router?

**Why it matters:** decision 344-1 (the owner, 2026-11-27, in #279) says an app with a backend that isn't on Workers gets a Go backend with a TypeScript web frontend. The pack will bake in these tools, and every app made from it inherits them. Each is expensive to change once projects stand on it. The platform questions (host, database, sign-in) are settled in [Go API platform](go-api-platform.md) (decision 340-1) and are out of scope here.

**Constraints:** no GitHub Actions: every check runs from the agent's session. The local gate reads `package.json`. The web pack pins TypeScript 6.0.3 and pnpm 12.21.0 [c28 · read]. `AGENTS.md` says files warn at 300 lines and stop at 500, functions stay under about 60 lines, and feature modules never import each other [c25 · read]. The owner is a beginner. The full bar is in `go-api-toolchain/briefs/author.md`.

**What good looks like:** primary sources read on 2026-11-28 with their page dates; at least three options per question compared on the same columns; where a claim could be tested here, a test; a pick with its confidence, its pinned version and the command that re-checks it.

**How to read the labels.** Each claim has an ID and a label, like `[c12 · measured]`. The ID is its row in `go-api-toolchain/claims.csv`, which names its sources.

| Label | Means |
|---|---|
| `measured` | I ran it on a scratch app and kept the output in `go-api-toolchain/experiments/` (`measured`). |
| `read` | Read in the vendor's docs, README, source, a registry or a release page (`read-in-source`). |
| `vendor` | The vendor says so about its own product, and I did not test it (`vendor-claim`). |
| `summary` | I only read a search summary (`summary-only`). |
| `[inferred]` | My own reasoning from the claims next to it. Not a finding, and not in `claims.csv`. |

## Summary

| Question | Pick | Confidence |
|---|---|---|
| 1. Lint and the boundary rule | **golangci-lint 2.15.0** (with its depguard, funlen and nolintlint), **go-arch-lint 1.19.2** for the layers, and **Go's own `internal/` folders** for the module wall. File size: revive's `file-length-limit` (in golangci-lint) as the 500-line stop, and a short script for the 300-line warning. | **Medium** |
| 2. The check contract | Root **`package.json` scripts** (a shim) call `go tool`, `go vet`, `go test -race`, `go build` and the web pack's own scripts. `test:e2e` is **Playwright API testing** against the built binary. | **Medium-high** |
| 3. The contract and the client | **Code-first: huma 2.41.0** on ServeMux, its OpenAPI 3.1 file committed, and **orval 8.49.0** to make the TypeScript client. A regenerate-and-compare step inside `typecheck` is what makes drift fail `check`. | **Medium** for huma, **medium** for orval |
| 4. The router | **`net/http` ServeMux**, through huma's `humago` adapter. chi 5.5.0 is the runner-up. | **High** |

**The main reasons:**
- Drift is not what separates spec-first from code-first. Both fail `check` on a rename, and both need the same regenerate step to fail it [c41, c42 · measured]. What separates them is what each leaves out: oapi-codegen's strict server accepted a body that breaks the spec [c43 · measured], and huma refused the same body [c44 · measured].
- depguard can't wildcard a module name [c7, c8 · measured]. A file-length cap exists, in revive, but with one limit per rule [c69 · measured]. Go's compiler can: a module's layers under `internal/` can't be imported from outside it [c13 · measured].
- The local gate and the agent-file guard read `package.json`, not a Makefile [c22, c23, c26 · read, measured].
- openapi-typescript, the usual pick, stops working on the TypeScript 7.0.2 that npm now calls `latest`; so does Hey API's latest release (its pre-release runs). orval is the one stable release that runs on both 6 and 7 [c53, c73 · measured].

## 1. Lint and the boundary rule

The issue asks two things: fail the build when one module imports another or a handler skips the service, and size rules like `AGENTS.md`'s.

### What each option did on a scratch app

Two modules (`notes`, `tags`), each with `handler`, `service` and `repository`. Each row adds one bad import and runs the check. Output: `go-api-toolchain/experiments/boundaries.md`.

| Option | Module imports a sibling | Handler skips the service | Needs a rule per module? | Cost |
|---|---|---|---|---|
| **A. depguard** (inside golangci-lint) | Caught, with a rule for that module. A module with no rule was not checked [c8 · measured] | Caught, with a prefix per module. A glob in `pkg` matched nothing [c7 · measured] | **Yes** | Nothing extra: it is part of golangci-lint [c6 · read] |
| **B. go-arch-lint** 1.19.2 | Caught for service to service. **Not** caught for a handler importing another module's service [c12 · measured] | Caught, one rule for all modules [c12 · measured] | No | A second tool; 49-line modfile [c11, c17]; its go.mod says Go 1.26.0 [c70] |
| **C. arch-go** 2.1.2 | Not run for a sibling | Caught, one rule for all modules [c15 · measured] | No | 35-line modfile [c17]; prints a coverage figure beside each run [c15] |
| **D. Go's `internal/` folders** | **Caught by `go build`**, with no config [c13 · measured] | Not its job: inside one module the compiler can't tell layers apart | No | A folder layout |
| **E. A small `go list` script** | Not built here | Not built here | No | Code to keep. Left out: B and D cover what it would |

### The pick (AI pick, not reviewed)

**D plus B for the boundaries, A for banned imports and function size, revive for the file-size stop, a short script for the rest.** One layout:

```
cmd/api/                         builds the server; the composition root
cmd/openapi/                     prints the OpenAPI file (question 3)
internal/modules/notes/notes.go  the module's one public door (Mount)
internal/modules/notes/internal/handler/    controller: huma operations, no rules
internal/modules/notes/internal/service/    rules: no net/http, no huma, no SDK
internal/modules/notes/internal/repository/ data access
tools/golangci-lint.mod, tools/go-arch-lint.mod, tools/oapi-codegen.mod ...
```

- **The module wall is the compiler's.** Another module importing `notes/internal/service` fails `go build` with "use of internal package ... not allowed", and so does `cmd/api` importing `notes/internal/repository` [c13 · measured].
- **go-arch-lint holds the layers and the public door.** Its one config for every module caught a handler importing a repository, and a module importing another module's door [c14 · measured]:

  ```yaml
  version: 3
  workdir: internal
  allow: { depOnAnyVendor: true }
  components:
    facade:     { in: modules/* }
    handler:    { in: modules/*/internal/handler }
    service:    { in: modules/*/internal/service }
    repository: { in: modules/*/internal/repository }
  deps:
    facade:     { mayDependOn: [handler, service, repository], anyVendorDeps: true }
    handler:    { mayDependOn: [service], anyVendorDeps: true }
    service:    { mayDependOn: [repository], anyVendorDeps: true }
    repository: { anyVendorDeps: true }
  ```
- **golangci-lint holds the rest.** `funlen` at 60 lines (its default) flagged a long function, though its 40-statement default fires first [c5, c10 · read, measured]. A depguard rule with a `files` glob stopped a service importing `net/http` [c9 · measured]. `nolintlint` with `require-explanation` and `require-specific` stops a bare `//nolint` [c21 · read, c68 · measured]. The three lints and `go vet` passed on a clean tree of this layout and failed on each bad import [c68 · measured].
- **File size: revive's `file-length-limit`, plus a script.** golangci-lint's revive linter has a `file-length-limit` rule with `max`, `skip-comments` and `skip-blank-lines`; with `max: 300` it flagged a 355-line file, and with `max: 500` it passed [c69 · measured]. Revive takes one limit per rule [c69]. So revive is the **500-line stop**, set with both skip options off so it counts lines the way `AGENTS.md` does [inferred: I ran it with both on], and `scripts/check-file-size.mjs` does the rest: the **300-line warning**, and a `//nolint` with no `#<issue>` number, which nolintlint can't check [c21 · read]. A file named `scripts/check-*` is check code to the agent-file guard [c22 · measured], which is what you want. My first draft said no linter caps a file; the fresh-session fact-check found the revive rule, and the first search missed it (the search found none, c4) [c3, c4 are corrected by c69]. arch-go counts function lines only [c16 · read].
- **Pin each tool in its own modfile.** `go get -modfile=tools/<name>.mod -tool <module>@<version>` pins it, and `go tool -modfile=tools/<name>.mod <name>` runs it [c19 · read, c17 · measured]. One file per tool, because two tools in one modfile moved each other's dependencies: adding oapi-codegen to a file with golangci-lint and go-arch-lint made go print "upgraded golang.org/x/tools v0.52.0 => v0.53.0" [c18 · measured]. golangci-lint's own install page says tool directives are not guaranteed to work and recommends its binary [c2 · read], and then documents a dedicated modfile, run with `go tool -modfile=golangci-lint.mod golangci-lint run`, to keep its dependencies apart from the project's [c75 · read]. That is the method this pick uses, one file per tool. If the pack's builder sees a failure that only the tool-built binary has, switch that one tool to the official binary.

**Confidence: medium.** Every part ran on a scratch app and caught what it should [c68 · measured]; they ran as three commands, not as the pack's single `lint`, and Go 1.27 was not tried (below). golangci-lint and depguard are GPL-3.0 [c1 · read]. I think that doesn't touch the product, because they only read the code and are not linked into it, but that is a licence call for the person.

**What would change it:** revive dropping or changing `file-length-limit` (then the script covers the stop too); go-arch-lint going quiet (arch-go does the layer rule too [c15 · measured]); the pack choosing a layout without `internal/` nesting (then go-arch-lint plus a depguard rule per module).

**Pin:** golangci-lint 2.15.0 and go-arch-lint 1.19.2, on Go 1.26.11 (both need Go 1.26 [c20, c70]). **Re-check:** `curl -s https://proxy.golang.org/github.com/golangci/golangci-lint/v2/@latest` and the same for `github.com/fe3dback/go-arch-lint`.

## 2. The check contract for Go

### Where the commands live

| Option | Local gate | Agent-file guard | Cross-platform | Verdict |
|---|---|---|---|---|
| **A. `package.json` scripts** | Reads `check`, then `test:e2e` if main's `package.json` has it [c26 · read] | `scripts` is check code, and a change needs the weakening review [c23 · read] | pnpm is already needed for the web side [c28 · read] | **Pick** |
| **B. Makefile** | Not read: the gate takes `test:e2e` from `package.json` [c26 · read] | Not covered: a change goes unreviewed [c22 · measured] | `make` is not on Windows by default [inferred] | No |
| **C. Taskfile** (go-task 3.54.0) | Same as B | Not covered [c22 · measured] | One more binary to install [inferred] | No |

The Python pack made the same call: poe tasks plus a `package.json` shim of six scripts [c27 · read].

### The six commands (AC-342-3)

A root `package.json` in the Go repo, with the web app in `web/`. Every command runs locally; none calls GitHub Actions. golangci-lint's, Schemathesis's and Hurl's docs show a workflow; none is used.

| Command | Exact script |
|---|---|
| `lint` | `go tool -modfile=tools/golangci-lint.mod golangci-lint run ./... && go tool -modfile=tools/go-arch-lint.mod go-arch-lint check && node scripts/check-file-size.mjs && pnpm --dir web lint` |
| `typecheck` | `pnpm gen:check && go vet ./... && pnpm --dir web typecheck` |
| `test` | `go test -race ./... && pnpm --dir web test` |
| `build` | `go build -trimpath -ldflags="-s -w" -o bin/api ./cmd/api && pnpm --dir web build` |
| `test:e2e` | `pnpm build && pnpm --dir web exec playwright test` |
| `check` | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |

Two helpers feed `typecheck`: `gen` is `go run ./cmd/openapi > api/openapi.yaml && pnpm --dir web gen` (orval), and `gen:check` is `pnpm gen && git diff --exit-code -- api web/src/api`. My runs compared copies with `diff` and not with `git diff`, so the git form is [inferred], not run. `go test -race` needs a C compiler; it ran here, where gcc is installed [c30 · measured].

### What `test:e2e` means for an API

| Option | What it did | Cost |
|---|---|---|
| **Playwright API testing** (pick) | A test using the `request` fixture, with `webServer` starting the built binary, passed with no browser installed [c31 · measured] | Nothing new: the web pack pins Playwright 1.65.1 and already tests its HTTP API this way [c28, c29 · read] |
| A Go test on the built binary | Passed, with a `//go:build e2e` tag [c31 · measured] | No new tool, but a second e2e style beside the web pack's |
| Schemathesis 4.34.4 | Found a request that breaks `minLength` accepted, and an undocumented 400, in about a second [c32 · measured] | Python on the machine that runs the gate [inferred] |
| Hurl 8.1.0 | Not run [c34 · read] | A binary or an npm install, and a new file format |

**Pick:** Playwright API testing, because the pack already has the tool and the pattern. **Schemathesis as an optional `test:contract` script** is worth the pack's builder trying: it found real gaps in seconds [c32 · measured]. I did not put it in the six names, because it adds Python to a Go and Node repo.

**Confidence: medium-high.** The mapping follows the gate's own reading. The scripts were run as separate commands on scratch apps, not as a pack.

**What would change it:** the gate learning to read a Makefile; a Go-only pack with no `web/` (then the shim holds Go commands only).

**Pin:** Playwright 1.65.1 (the web pack's), Go 1.26.11. **Re-check:** `grep -n "package.json" .agents/skills/coordinate/SKILL.md`, and the guard's `CHECK_FILES` with `experiments/boundaries.md`'s `guard.mjs`.

## 3. The contract and the TypeScript client

Judged first on: can the frontend drift from the server without `check` failing?

### Drift, measured (AC-342-2)

The same API built both ways, with a TypeScript client. Then `Note.title` renamed to `Note.name`. Output: `go-api-toolchain/experiments/contract.md`.

| Step of the rename | Spec-first (oapi-codegen) | Code-first (huma) |
|---|---|---|
| Source changed, nothing regenerated: `go build` | passes (stale generated Go) | passes (handler and type agree) |
| same: web `tsc` | passes (stale types) | passes (stale types) |
| same: regenerate and compare | **fails** | **fails** |
| After regenerating: `go build` | **fails**: unknown field Title | passes |
| After regenerating: web `tsc` | **fails**: Property 'title' does not exist | **fails**: Property 'title' does not exist |

[c41, c42 · measured]. So **neither style lets the client drift once `check` regenerates and compares**, and **both let it drift without that step**: the stale files typecheck. That is why `gen:check` leads `typecheck` in question 2.

**Which step of `check` fails, for the pick:**

| What changed | Fails in | By |
|---|---|---|
| A Go type or struct tag changed, spec and client not regenerated | `typecheck` | `gen:check`: the regenerated file differs from the committed one |
| Regenerated, but the web code reads an old field | `typecheck` | the web `tsc` |
| A handler stops fitting its types | `typecheck` and `build` | `go vet`, `go build` |
| Someone edits a generated file by hand | `typecheck` | `gen:check` |
| A route added outside huma with a plain `mux.HandleFunc` | **nothing in `check`** | it is not in the spec at all. Schemathesis would not see it either. A review rule, or a lint rule on `HandleFunc` outside `cmd/`, closes it [inferred] |

### Spec-first against code-first

| Option | Request validation | OpenAPI | Code to commit | Fit |
|---|---|---|---|---|
| **huma 2.41.0** (code-first, MIT) | **Built in**: 422 on an empty title with no extra setup [c44 · measured] | 3.1 [c36 · read] | No Go code; the YAML [c47 · measured] | Same style as the web pack, whose spec is built from its schemas [c49 · read]; ServeMux through `humago` [c36 · read] |
| **oapi-codegen 2.9.0** (spec-first, Apache-2.0) | **None by default**: 201 on a body that breaks `minLength`. With nethttp-middleware 1.3.1: 400 with a plain-text body [c43 · measured]. Response validation by middleware "not currently possible" [c38 · read] | 3.0 and 3.1 [c37 · read] | A 357-line Go file for two operations [c47 · measured] | Strict server compiles handlers against the spec [c41 · measured]; needs Go 1.26 [c37 · read] |
| **ogen 1.25.0** (spec-first, Apache-2.0) | Generated into the code [c39 · read] | Not confirmed for 3.1 | Not run | Its own router and JSON library; mounts into ServeMux [c39 · read]. Not run here |
| **swaggo/swag 1.16.6** (code-first, MIT) | Not run | **Swagger 2.0** [c40 · read] | Not run | v2 is a release candidate [c40 · read]. openapi-typescript's Swagger 2 line is a 5.4.2 tag [c55 · read] |

**Pick: huma, code-first (AI pick, not reviewed).** I think the deciding points are: it checks requests by itself [c44 · measured]; agents write one language and the YAML is output; and it matches how the web pack builds its contract [c49 · read]. The cost is that handlers are written against huma, where oapi-codegen leaves plain `net/http`. Three things the pack must set once, all measured:
- **Slices come out as `T[] | null`**, and strict `tsc` then rejects `data.items[0]`. One line fixes it: `huma.DefaultArrayNullable = false` [c45 · measured].
- **Bodies gain a `$schema` property** in the TypeScript types [c46 · measured]. It is harmless noise; the pack can turn it off in huma's config.
- **Its error body is RFC 9457** (`title`, `status`, `detail`), while the web pack's API errors are `{ ok: false, error: { code, message } }` [c48 · measured, read]. One `huma.NewError` override makes the Go API answer the way the web pack does.

**What would change the pick:** a need for a language-neutral spec reviewed by someone who doesn't read Go (then oapi-codegen, with the validation middleware and a custom error handler); huma going quiet (its latest release is 2.41.0 on 2026-11-17, with 119 open issues [c36 · read]).

**Pin:** huma 2.41.0. **Re-check:** `curl -s https://proxy.golang.org/github.com/danielgtaylor/huma/v2/@latest`.

### The TypeScript client generator

Same spec, three generators, on TypeScript 6.0.3 (the web pack's) and 7.0.2 (npm's `latest`). Output: `go-api-toolchain/experiments/generators.md`.

| Option | On TypeScript 6.0.3 | On TypeScript 7.0.2 | Install | Size of output | Activity |
|---|---|---|---|---|---|
| **openapi-typescript 7.13.0 + openapi-fetch 0.17.0** | Works; failed `tsc` after the rename [c52 · measured] | **Crashes on start** [c53 · measured] | npm **refuses** (peer `typescript ^5.x`); pnpm warns and installs [c51 · measured] | 90 lines of types plus a 6 kB client [c52 · measured, c56 · vendor] | Last release 2026-02-11; open issues for TypeScript 6 and 7 (as the author read them on 2026-11-28) [c54, c74] |
| **orval 8.49.0** | Works; failed `tsc` after the rename [c52 · measured] | **Works**; its output passes `tsc` 7.0.2 [c53 · measured] | Installs clean; Node 22.18 or newer, 26 dependencies [c57 · read] | One 116-line file [c52 · measured] | Releases weekly (8.44.0 on 2026-10-21, 8.49.0 on 2026-11-22) [c57 · read] |
| **Hey API 0.99.0** | Works; failed `tsc` after the rename [c52 · measured] | **0.99.0 crashes on start** [c53 · measured]; its `next` pre-release (0.0.0-next-20260930190945) ran, exit 0 [c73 · measured] | Installs clean [c58 · read] | 4 files, 2,026 lines with its client and core [c52 · measured] | 0.x, 683 open issues (as the author read them on 2026-11-28), a migration note per breaking release [c58 · read] |

**Pick: orval 8.49.0, with its `fetch` client (AI pick, not reviewed).** It is the only one of the three whose stable release runs on both TypeScript lines [c53 · measured]; Hey API's pre-release does too, but it is a pre-release [c73 · measured]. The web pack is on 6.0.3 today, and 7.0.2 is what npm calls `latest`, so the pack would otherwise break on its next TypeScript bump [c50 · read]. Its README also lists React Query output [c57 · read], which the web pack already uses (TanStack Query 5.108.3 [c28 · read]); the pack can switch to hooks later. Its docs site refused the fetch (HTTP 403), so I read its README and tested it instead [c59 · read]. It moves fast: pin the exact version.

**Confidence: medium.** All three work today on 6.0.3. The pick rests on one measured fact (TypeScript 7), and openapi-typescript may ship support before the pack upgrades [c54, c74 · read]; the small types-only client is still attractive.

**What would change it:** openapi-typescript releasing TypeScript 6 and 7 support (issues 2818, 2841 and 2872 were open on 2026-11-28, as the author read them [c74 · read]); orval breaking on a spec the scratch one didn't have (a real API has more shapes than two operations).

**Pin:** orval 8.49.0. **Re-check:** `npm view orval version` and `npm view openapi-typescript version peerDependencies`.

## 4. The router

| Option | Patterns and parameters | Wrong method and unknown path | Size and dependencies | Contract tools |
|---|---|---|---|---|
| **`net/http` ServeMux** (Go 1.22 and newer) | `GET /posts/{id}`, read with `PathValue`; the more specific pattern wins [c60 · read] | 405 with an Allow list; unknown path is plain text 404 [c63 · measured] | 5.81 MB, 0 third-party packages, the router included [c61, c62 · measured] | huma has an adapter (`humago`) [c36 · read]; oapi-codegen has `std-http-server` [c66 · read]; ogen mounts in it [c39 · read] |
| **chi 5.5.0** (MIT) | Not tested beyond a route and a parameter | 405 with Allow; plain text 404 [c63 · measured] | 6.07 MB, 1 package [c61, c62 · measured] | All three have an adapter [c66 · read] |
| **echo 5.4.7** (MIT; 4.16.6 is also current) | Not tested beyond a route and a parameter | 405 with Allow; JSON 404 [c63 · measured] | v5 6.42 MB, 1 package; v4 6.39 MB, **21** packages [c61, c62 · measured] | oapi-codegen has both (`echo-server`, `echo5-server`) [c66 · read] |

**Pick: ServeMux (AI pick, not reviewed).** It gives method and parameter patterns, 405 with Allow and no dependency, and every contract tool above accepts it [c60, c63, c62, c36, c66]. What it lacks is route groups and a middleware stack; a 10-line helper that wraps a handler in a list of `func(http.Handler) http.Handler` does it [inferred]. A sign-in check such as the one in decision 340-1 is, I think, the usual `func(http.Handler) http.Handler` shape, so it wraps ServeMux the same way [inferred]. I did not time the routers: for a CRUD API I think routing cost is lost in the database call, and I found no source that says otherwise.

Echo is the one to avoid, but not for its weight: v5 pulls in only itself [c62 · measured], so this rests on the version split and the paid layer. It has two current majors, with v4 on bug fixes until 2026-12-31 [c64 · read], an agent trained on v4 code will write v4 [inferred], and LabStack sells a commercial layer on top [c64 · read].

**Confidence: high** that ServeMux is enough; **medium** that nobody will want chi's route groups later. Moving from ServeMux to chi later is small, because huma and oapi-codegen both have a chi adapter [c66, c36 · read].

**What would change it:** a need for per-group middleware on dozens of routes (chi).

**Pin:** the router is the Go standard library: **Go 1.26.11**, the older of the two stable lines on purpose (1.27.4 is current and was not tried with these tools). **Re-check:** `curl -s 'https://go.dev/dl/?mode=json' | grep -o '^  "version": "go[0-9.]*"' | head -3`.

## Pinned versions

Re-check any row with the command shown. Versions are those on 2026-11-28. Every Go tool below needs Go 1.26: golangci-lint, go-arch-lint and oapi-codegen say `go 1.26.0`, and **huma says `go 1.26.10`** [c20, c70, c71 · measured, read]. The tools were run on 1.26.x toolchains, and **Go 1.27.4 is unconfirmed** with them [c24 · read].

| Piece | Version | Re-check with |
|---|---|---|
| Go | 1.26.11 (the older stable line on purpose; 1.27.4 is current, unconfirmed with these tools; 1.26.10 is the least huma accepts) | `curl -s 'https://go.dev/dl/?mode=json' \| grep -o '^  "version": "go[0-9.]*"' \| head -3` |
| golangci-lint (with depguard, funlen, nolintlint, revive) | 2.15.0 | `curl -s https://proxy.golang.org/github.com/golangci/golangci-lint/v2/@latest` |
| go-arch-lint | 1.19.2 | `curl -s https://proxy.golang.org/github.com/fe3dback/go-arch-lint/@latest` |
| huma | 2.41.0 | `curl -s https://proxy.golang.org/github.com/danielgtaylor/huma/v2/@latest` |
| orval | 8.49.0 | `npm view orval version` |
| TypeScript (the web pack's pin; 7.0.2 is npm's latest) | 6.0.3 | `grep typescript stacks/tanstack-start/package.json` and `npm view typescript version` |
| Playwright (the web pack's pin) | 1.65.1 | `grep playwright stacks/tanstack-start/package.json` |
| Schemathesis (optional `test:contract`) | 4.34.4 | `curl -s https://pypi.org/pypi/schemathesis/json \| grep -o '"version":"[0-9.]*"' \| head -1` |
| Runner-ups, not picked: oapi-codegen / ogen / arch-go / chi | 2.9.0 / 1.25.0 / 2.1.2 / 5.5.0 | `curl -s https://proxy.golang.org/<module>/@latest` for each |
| Runner-ups, not picked: openapi-typescript / openapi-fetch / Hey API | 7.13.0 / 0.17.0 / 0.99.0 | `npm view <name> version` |

ServeMux, `go vet` and `go test` ship with Go. The tools ran on the 1.26.0 and 1.26.10 toolchains; 1.26.11 is the same line, and I did not run it.

## Hypotheses, checked

- **H1 (depguard globs): wrong.** The glob in `pkg` matched nothing; prefixes worked [c7 · measured].
- **H2 (go-arch-lint, no per-module rule): partly wrong.** It missed a handler importing another module's service [c12 · measured]. With Go's `internal/` folders added, nothing got through [c14 · measured].
- **H3 (drift needs a regenerate step): held** for both styles [c41, c42 · measured].
- **H4 (openapi-typescript fits): partly wrong.** It runs on 6.0.3, npm refuses the install, and it crashes on 7.0.2 [c51, c53 · measured].
- **H5 (strict server validates): wrong.** 201 on a body that breaks the spec [c43 · measured].
- **H6 (a file-length linter): partly wrong.** I expected none and wrote that none existed; revive's `file-length-limit` is one, with a single limit per rule [c69 · measured]. A script is still needed for a second limit.
- **H7 (ServeMux is enough): held** [c60, c63, c36, c66].
- **H8 (a Makefile is the natural home): wrong for this kit.** The gate and the guard read `package.json` [c22, c23, c26].

## What I could not check

- **The pack as a whole.** No `pnpm check` ran on a real Go pack. The pieces ran as separate commands on scratch apps.
- **Go 1.27.** The tools ran on 1.26.x toolchains.
- **The git form of `gen:check`.** Copies were compared with `diff`.
- **The gate's clean-home run.** The gate runs each command with an empty home [c26 · read]. I think the Go module cache then starts empty, so a first run downloads every module, and a `go.mod` that names a newer toolchain makes the `go` command fetch it unless `GOTOOLCHAIN=local` is set [inferred from s15]. With `GOTOOLCHAIN=local` the installed Go must be 1.26.10 or newer, or huma will not build [c71 · read]. Not run.
- **GitHub-only counts.** The open-issue counts (huma 119, Hey API 683), openapi-typescript's issues 2818, 2841 and 2872 and its last push date come from the GitHub REST API on 2026-11-28; the fresh fact-check could not reach GitHub and did not confirm them. The npm side (no openapi-typescript release since 2026-02-11) was confirmed.
- **ogen, swaggo, Hurl, Taskfile and echo's and chi's route groups.** Read, not run.
- **Windows.** Nothing ran there.
- **Router speed.** Size and dependencies only.
- **A larger API.** The scratch apps have two operations. Real specs have unions, uploads and auth that could trip orval or huma.

## For the pack's issues (#349 and after)

Not built here, because the issue's fence is research only:
1. **Add the Go check config to the agent-file guard.** `.golangci.yml`, `.go-arch-lint.yml` and `tools/*.mod` are not check code today [c22 · measured]. An agent could loosen a lint rule with no weakening review.
2. **Gate environment for Go.** Install Go 1.26.10 or newer, set `GOTOOLCHAIN=local`, and give `GOMODCACHE` and `GOCACHE` a cache folder like the pnpm store [inferred].
3. **huma's three settings** above: nullable arrays, `$schema`, the error body.
4. **revive's `file-length-limit` at 500 in `.golangci.yml`, `scripts/check-file-size.mjs` for the 300 warning and the `#<issue>` check**, and a rule that bans a plain `mux.HandleFunc` outside `cmd/`.

## Fact-check

**Status: current.** A fresh sub-agent with no earlier context ran the fact-check on 2026-11-28 against branch head 7daf213, from `go-api-toolchain/briefs/fact-check.md`, on Sonnet 5.5 at high effort. GitHub could not be reached from its session, so it used the module proxy and npm timestamps for release dates. It reported 38 findings: 28 confirmed, 7 wrong and 3 unconfirmed. They are in `go-api-toolchain/fact-check.csv` as the rows that start 'Fresh session', each with a disposition and a reason; the confirmed ones are grouped.

Every pinned version matched. The oapi-codegen validation gap, the router sizes and package counts (byte for byte), and the TypeScript 7 crashes of openapi-typescript and Hey API 0.99.0 all reproduced. The pick for each of the four questions held. Confidence for question 1 stays medium: the part that changed is the file-size rule.

**What it found and what changed:**
- **A file-length linter exists.** revive's `file-length-limit` in golangci-lint 2.15.0 caps a file; the first draft said none did. The pick now uses it as the 500-line stop and keeps a script for the 300-line warning (c69; c3 and c4 are corrected by it; H6 is now partly wrong).
- **Hey API's pre-release runs on TypeScript 7.** Only the stable 0.99.0 crashes. The pick's wording now says "the one stable release" (c73).
- **go-arch-lint needs Go 1.26.0, not 1.25** (c70), and **huma needs Go 1.26.10 or newer** (c71): the pins, the gate item and the follow-ups say so.
- **The Go re-check command printed 1.27.4 three times.** It now matches top-level lines only, and the pin says it is the older stable line on purpose.
- **The depguard list-mode sentence was wrong** (c72); the issue list for openapi-typescript missed 2872 (c74); GitHub-only counts are labelled as read by the author; the router table says "the router included"; the echo advice says what it rests on.
- **Unconfirmed, accepted:** the GitHub-only numbers, and the `measured` claims no second run backed. The fresh pass re-ran some of them (the oapi-codegen validation, the router sizes, the TypeScript 7 crashes, revive) and they matched.

The fact-check also noted that golangci-lint's install page documents a dedicated modfile for running the tool, which is the method this pick uses (c75).

**Before it:** the author's own pass (first rows of `fact-check.csv`) re-opened the pages behind the riskiest claims and found the quoted phrases.

## Provenance

The model, effort, harness and dates for every role are in `go-api-toolchain/provenance.json`. The brief each role got is in `go-api-toolchain/briefs/`. The author ran on `claude-sonnet-5-5`, as the owner's standing instruction for worker agents asks; the research skill's step 2 asks for the strongest tier, and that was set aside. The step that captures a dossier to a private research library was skipped: it needs a repository outside this one, and on Full automation the skill says to skip it. The dossier is not saved to a library.
