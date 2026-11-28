# Code style for a Go backend

The Go version of the rules in [code-style.md](code-style.md) that name a TypeScript tool. An app that needs a backend and doesn't run on Cloudflare Workers gets a Go API with a TypeScript web app that calls it (decision 344-1).

Section numbers match `code-style.md`, so "rule 4" means the same thing in both. Only the rules that name a TypeScript tool, or that a tool checks differently in Go, are here: 3, 4, 5, 11, 12, 14 and 15. The rest hold as written, and the web app follows the TypeScript page: 1, 2, 6 (the web app's UI), 7 (the `dependencies` skill has the Go commands), 8, 9, 10 and 13.

The money, time, logs, events, access and env conventions are in [app-conventions-go.md](app-conventions-go.md). This page only says which rule keeps each one. The Go pack picked the tools (decision 342-1) and pins their versions. This page names none.

## The rules

### 3. No leftover junk

None of these in a pull request:
- unused files, functions or modules. The compiler already refuses an unused import or local variable, and `go mod tidy -diff` shows a module nothing imports;
- `fmt.Print*` or `log.Print*` of any kind. Use the one logger, `internal/platform/logger`;
- commented-out code;
- a TODO without an issue number (`// TODO(#42): ...`).

```go
// The logger comes in with the service, never fmt.Println.
s.log.InfoContext(ctx, "note_created", "note_id", note.ID)
```

**Kept by:** depguard bans the `log` package. A call to `fmt.Print*` has no rule in the pack's picks yet, so `pr-review` checks it by hand.

**Why:** the same as the TypeScript page. Junk costs every reader a moment of "is this used?", and a `fmt.Println` skips the redaction and the standard fields.

### 4. No escape hatches

No `any` or `interface{}` in the parameters or results of an exported function or type, and no `//nolint`. When one is truly unavoidable, it gets a reason and an issue number on the same line, and the reviewer flags it.

- Use a named type, an interface with methods, or a generic with a constraint. `map[string]any` at an edge, such as decoding JSON into an unknown shape, stays inside the function that does it. It never appears in a signature.
- Name the linter: `//nolint:funlen`, never a bare `//nolint`.
- A call into the standard library that takes an `any` (`json.Unmarshal`) is fine. Rule 4 is about what you export.

```go
//nolint:funlen // one table of routes, nothing to split. #512
func routes(api huma.API, h *Handler) {
```

**Kept by:** `nolintlint` with `require-explanation` and `require-specific` stops a bare `//nolint` or one with no reason. The small script `scripts/check-file-size.mjs` stops one with no `#<issue>`. An `any` in a signature has no rule in the pack's picks yet, so `pr-review` checks it by hand.

**Why:** each one turns off the checker exactly where the code is hardest to get right. The reason and the issue make it a decision someone can revisit, not a quiet hole.

### 5. Small files and functions

Warn at 300 lines a file. 500 is the hard cap. Keep functions under about 60 lines. Split by responsibility, not by line count: in Go, a file per thing the package does (`create.go`, `list.go`), not `part1.go` and `part2.go`.

```go
package service

// Create makes a note for the signed-in user and returns it.
func (s *Service) Create(ctx context.Context, in Input) (Note, error) {
	// ...
}
```

**Kept by:** revive's `file-length-limit` at `max: 500` is the stop. It runs inside golangci-lint with both skip options off, so it counts lines the way `AGENTS.md` does. `scripts/check-file-size.mjs` prints the 300-line warning. `funlen` is set to 60 lines. Its statement limit (40 by default) can fire first.

**Why:** the same as the TypeScript page. A file an agent can't hold in view is a file it edits blind.

### 11. No swallowed errors

No empty `if err != nil {}`. No `_ = err`, and no `_` in place of an error result. No `if err != nil` that logs the error and carries on as if nothing happened. Handle it, or wrap it with `%w` and return it. The boundary turns it into an `apperror.Error` (rule 5 in [app-conventions-go.md](app-conventions-go.md)).

- Wrap with `%w`, never `%v` or `err.Error()`. A `%v` cuts the chain, and the code is lost with it.
- Test with `errors.Is` and `errors.As`, never on the message text.
- A `defer f.Close()` on something you wrote to ignores a write error. Check the error from `Close` there.

```go
note, err := s.repo.Insert(ctx, in)
if err != nil {
	return Note{}, fmt.Errorf("create note: %w", err)
}
```

**Kept by:** no linter in the pack's picks checks for an ignored error yet, so `pr-review` checks it by hand. The Go pack's lint config (#349, #350) is where one gets switched on.

**Why:** a swallowed error turns a loud bug into a silent wrong answer, found weeks later by a user.

### 12. Comments say why, not what

No comments that narrate the code (`// loop over the users`). Write comments for the reason a reader can't see: a workaround, a business rule, a trap. Each exported name gets a one-line doc comment that starts with the name, so `go doc` shows it.

```go
// Add refuses two currencies: a silent sum of dollars and euros is a wrong invoice.
func (m Money) Add(o Money) (Money, error) {
```

**Kept by:** `pr-review`, by hand. No tool in the pack's picks can tell a reason from a narration.

**Why:** the same as the TypeScript page. The code already says what it does, and narration goes stale.

### 14. Naming and imports

- Files are lowercase with underscores: `user_profile.go`. Don't end a name in a word Go reads as a build tag, such as `_linux` or `_arm64`. `_test.go` is for tests only.
- A package is one short lowercase word that says what it gives: `money`, `clock`, `apperror`. No `util`, `common`, `helpers` or `base`. A name like `util` says nothing, so every stray function ends up there.
- Imports use the full module path (`example.com/app/internal/platform/money`). Go has no path alias and refuses a relative import.
- Group imports in three blocks, with a blank line between: the standard library, outside packages, then this module. `gofmt` sorts each block.
- No `init()` that does work: no registering, no reading the environment, no opening a connection. Build things in `cmd/api` and pass them in. An import should never change what the program does.
- No package that only re-exports another package's names. Import the package that owns the name. A module's one public door (`notes.go` with its `Mount`) is not a re-export: it holds the function.

```go
import (
	"context"
	"fmt"

	"github.com/danielgtaylor/huma/v2"

	"example.com/app/internal/platform/apperror"
)
```

**Kept by:** the compiler refuses a relative import and an import across an `internal/` folder. `gofmt` formats the file and sorts each import block. go-arch-lint holds the layers (controller, service, repository) and each module's one door. The rest (`util` names, `init()`, re-export packages and the three-block grouping) has no rule in the pack's picks yet, so `pr-review` checks it by hand.

**Why:** one naming and import style makes files easy to find and diffs easy to read. An `init()` runs on import, in an order nobody wrote down, and a re-export package hides where code lives.

### 15. Money, time and access go through their one package

- Money goes through `internal/platform/money`. No `float64` arithmetic on an amount, no `strconv.ParseFloat` on a price.
- Time goes through the injected `clock.Clock` from `internal/platform/clock`. No `time.Now()` in a service. No `time.Parse` with a hand-made layout on user text.
- Logs go through `internal/platform/logger`, events through `events.Track`, env values through `config.Load` (only `main` calls `os.Getenv`), and access decisions through `authz.Checker`'s `Check`.

The rules behind each are 10 to 18 in [app-conventions-go.md](app-conventions-go.md).

```go
// A service takes the clock, so a test can pass a fixed one.
func (s *Service) expired(t Token) bool { return s.clock.Now().After(t.ExpiresAt) }
```

**Kept by:** depguard keeps `net/http` and huma out of services, and can ban `log`. It bans a package, not a call, so `time.Now()`, `os.Getenv` and `strconv.ParseFloat` have no rule in the pack's picks yet. `pr-review` checks them by hand.

**Why:** each of these has a trap that one package handles once: floats losing cents, time zones, leaked tokens, typo'd event names, a missing role check. Code that goes around the package brings the trap back.

## What tools enforce

The Go pack turns what it can into lint (decision 342-1), so the reviewer only judges what a tool can't:

| Rule | A tool can check |
|---|---|
| 3 | the compiler (unused imports and variables), `go mod tidy -diff` (unused modules), depguard (the `log` package) |
| 4 | `nolintlint` (a bare `//nolint`, no reason), `scripts/check-file-size.mjs` (no `#<issue>`) |
| 5 | revive's `file-length-limit` (500, run by golangci-lint), `scripts/check-file-size.mjs` (the 300 warning), `funlen` (60 lines) |
| 11 | nothing in the pack's picks yet |
| 12 | nothing in the pack's picks yet |
| 14 | the compiler and `internal/` folders (the module wall), `gofmt` (format, import order), go-arch-lint (layers and each module's door) |
| 15 | depguard (`net/http` and huma out of services, `log` banned) |

Rules 3, 4, 11, 12, 14 and 15 keep a part that needs judgement. `pr-review` checks it by hand until the pack's lint config (#349, #350) adds a rule. Never loosen a lint rule to pass: that is a test weakened, and it gets the weakening review.
