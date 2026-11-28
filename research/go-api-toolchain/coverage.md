# Coverage

Options down the side, the questions across the top. Each cell names claims in `claims.csv`, or says `gap`.

## 1. Lint and the boundary rule

| Option | Cross-module import | Handler skips service | Banned imports per layer | Version, licence, activity | Cost to keep | File and function size |
|---|---|---|---|---|---|---|
| **A. depguard in golangci-lint** | c8 (needs a rule per module) | c7 (needs a prefix per module) | c9 | c1, c6, c67 | c2, c17, c20 | c3, c4, c5, c10, c21, c25 |
| **B. go-arch-lint** | c12 (misses handler to another module's service) | c12 | `gap`: its vendor rules were not run | c11 | c17 | `gap`: it has no size rule |
| **C. arch-go** | `gap`: not run for a sibling module | c15 | c9 is depguard's; arch-go's `shouldNotDependsOn` `external` was not run | c16 | c17 | c16 (function lines only) |
| **D. Go's `internal/` folders** | c13 | `gap`: the compiler can't tell layers apart inside one module | `gap`: not its job | c24 | none | not its job |
| **E. A small `go list` script** | `gap`: not built here | `gap`: not built here | `gap` | none | `gap` | `gap` |
| **B plus D together** | c14 | c14 | see A | c11, c24 | c17 | see A |

## 2. The check contract for Go

| Option | Read by the local gate | Read by the agent-file guard | Cross-platform | Runs the six names | Tests and e2e |
|---|---|---|---|---|---|
| **A. `package.json` scripts** | c26, c27, c28 | c23 | c28 (pnpm is already required by the web side) | c28 | c29, c30, c31 |
| **B. Makefile** | c26 (gate reads `package.json` for test:e2e) | c22 (Makefile not covered) | `gap`: no Windows `make` check | `gap` | `gap` |
| **C. Taskfile (go-task)** | c26 | c22 (Taskfile.yml not covered) | `gap`: extra binary, not run | `gap` | `gap` |
| **e2e: Go test on the binary** | n/a | c22 | c31 | n/a | c31 |
| **e2e: Playwright API testing** | c26 | c22 | c31, c33 | n/a | c29, c31 |
| **e2e: Schemathesis** | `gap`: Python on the gate's machine | c22 | c32, c35 | n/a | c32 |
| **e2e: Hurl** | `gap` | c22 | c34 | n/a | `gap`: not run |

## 3. The contract and the TypeScript client

| Option | Drift: what fails `check` | Request validation | Spec version | Code to commit | Fit with the web pack | Version, licence, activity |
|---|---|---|---|---|---|---|
| **oapi-codegen (spec-first)** | c41 | c43, c38 | c37 | c47 | c49 (the web pack is code-first) | c37 |
| **ogen (spec-first)** | `gap`: not run; same regenerate step would apply | c39 (generated) | `gap`: 3.1 not confirmed | `gap` | c39 (own router) | c39 |
| **huma (code-first)** | c42 | c44 | c36 | c47 | c49, c36, c48 | c36 |
| **swaggo (code-first)** | `gap`: not run | `gap` | c40 (Swagger 2.0) | `gap` | `gap` | c40 |
| **Client: openapi-typescript + openapi-fetch** | c41, c52 | n/a | c55 | c52 | c50, c51, c53, c54 | c54, c56 |
| **Client: orval** | c52 | n/a | `gap`: not tested against 3.1 specs beyond the scratch one | c52 | c50, c53, c57 | c57, c59 |
| **Client: Hey API** | c52 | n/a | `gap` | c52 | c50, c53, c58 | c58 |

## 4. The router

| Option | Patterns and parameters | 405 and 404 | Size and dependencies | Contract tools | Version, licence, activity |
|---|---|---|---|---|---|
| **ServeMux** | c60 | c63 | c61, c62 | c36, c66 | c24 |
| **chi** | `gap`: its docs were skimmed only | c63 | c61, c62 | c66 | c64 |
| **echo** | `gap`: its docs were skimmed only | c63 | c61, c62 | c66 | c64, c65 |
