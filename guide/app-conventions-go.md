# App conventions for a Go backend

The server-side half of [app-conventions.md](app-conventions.md), in Go. An app that needs a backend and doesn't run on Cloudflare Workers gets a Go API with a TypeScript web app that calls it (decision 344-1).

Section numbers match `app-conventions.md`, so "rule 13" means the same thing in both. Only the rules that touch a server are here: 5, 8, 10 to 16 and 18. The rest (issues, no barrel files, state, loading and error screens, UI layers, text) hold as written, and the web app follows them. Section 9's list holds too: request IDs, the logger, the event registry, the typed config and an `/api/health` endpoint come in slice 0.

The Go pack picked the tools (decisions 340-1 and 342-1): huma on `net/http`'s ServeMux, Postgres on Neon through pgx, goose for migrations, sqlc for queries, Clerk's Go SDK for sign-in, Cloud Run as the host. This page names no version. The pack pins them.

Shared code lives under `internal/platform/<name>/` (`apperror`, `money`, `clock`, `logger`, `events`, `authz`, `config`). Each feature is a module under `internal/modules/<module>/`, with its handler, service and repository layers in its own `internal/` folder. Go's compiler refuses an import across that wall. The architecture file sets the final names.

## 5. One error system from day one

- **Typed errors with a code from one list.** One `apperror.Error` with a `Code`, a `Message` and a wrapped cause. The codes are constants in one file. They are the web app's codes: `validation`, `unauthenticated`, `forbidden`, `not_found`, `conflict`, `too_large`, `rate_limited`, `internal`, `unavailable`. Add a code there, never a one-off string.
- **Expected errors get a specific message** that says what happened and what to do next: "That email is already used. Sign in instead?"
- **Unexpected errors get a short message and a request ID:** "Something broke on our side. Reference: 7f3a9c." No stack, SQL or internal name reaches the caller.
- **One request ID, end to end.** The first middleware takes `X-Request-Id` from the caller or makes one. It goes in the context, the response header, the log line and the error body. The web app shows it as the reference ID.
- **One error envelope,** the web app's own: `{"ok": false, "error": {"code", "message", "requestId"}}`. huma answers with RFC 9457 problem details by default. The pack replaces that once, in huma's `NewError` hook, so the TypeScript client parses one shape.
- **Wrap, don't replace.** Add context with `fmt.Errorf("create note: %w", err)`. Test with `errors.Is` and `errors.As`, never on the message text. Never `_ = err`.
- **Logged once, at the boundary:** the error middleware, or the job runner. A recover middleware turns a panic into `internal` and logs it once, with the stack in the log only.

```go
var ErrEmailTaken = apperror.New(apperror.Conflict, "That email is already used. Sign in instead?")

func (s *Service) Create(ctx context.Context, in Input) (Note, error) {
	note, err := s.repo.Insert(ctx, in)
	if err != nil {
		return Note{}, fmt.Errorf("create note: %w", err) // the boundary maps an unknown error to internal
	}
	return note, nil
}
```

**Why:** an error system added late means every old error is fixed by hand. A request ID turns "it broke" into one log search.

## 8. A versioned API from day one

- Public routes live under `/api/v1`. A breaking change adds `/api/v2` next to it, on the same services. Only the handlers and their request and response types are per version.
- The old version sends `Deprecation` and `Sunset` headers from one middleware. Its retirement date goes in `docs/decisions.md`.
- Contract tests run per version.
- **The web app is a caller like any other.** It calls `/api/v1` through the generated client. No call to the API goes unversioned.
- A breaking change is one an old client can't survive: a removed or renamed field, a new required field, a changed type or meaning. An optional field is not breaking.

```go
huma.Register(api, huma.Operation{
	OperationID: "create-note", Method: http.MethodPost, Path: "/api/v1/notes",
}, h.create)
```

**Why:** once a mobile app or a script calls the API, you can't update every caller the day you ship.

## 10. Money

- **Integer minor units plus an ISO 4217 currency code.** $12.34 is `Money{AmountMinor: 1234, Currency: "USD"}`. The decimals come from the currency (JPY 0, USD 2, KWD 3), never an assumed 2.
- **One `money.Money` type** in `internal/platform/money`. Every amount is a `Money`, never a bare number. The amount is an `int64`.
- **Never `float64` for money.** No `price * 1.2`, no `strconv.ParseFloat` on a price. Arithmetic runs through the package's functions. Adding two currencies returns an error, never a silent sum.
- **Half-even rounding** (banker's) for splitting and tax, unless the person decides otherwise. Write the rule in `docs/decisions.md`.
- **Allocate remainders.** Split 100 cents three ways: 34, 33, 33. The parts add up to the whole.
- **Format at the edge.** The API sends `{"amountMinor": 1234, "currency": "USD"}`. The web app formats it with `Intl`. Keep amounts under 2^53 so JavaScript reads them exactly. An email formats through one function in the package.
- **The currency is stored next to every amount:** a `bigint` column named `amount_minor` (or `*_cents`; one style per project) and a `currency` text column beside it.
- **Table tests** for rounding, a split with a remainder, a zero-decimal currency, a negative amount (a refund) and mixed currencies.

```go
type Money struct {
	AmountMinor int64  `json:"amountMinor"`
	Currency    string `json:"currency"`
}

func (m Money) Add(o Money) (Money, error) {
	if m.Currency != o.Currency {
		return Money{}, apperror.New(apperror.Validation, "Amounts in different currencies can't be added.")
	}
	return Money{AmountMinor: m.AmountMinor + o.AmountMinor, Currency: m.Currency}, nil
}
```

**Why:** floats lose cents, and lost cents show up in invoices, refunds and tax reports. An amount without its currency is a guess.

## 11. Time

- **Instants are `time.Time` in UTC.** Call `.UTC()` where a time enters the program. The database column is `timestamptz`, never `timestamp`. The API sends RFC 3339 with a `Z`.
- **Three different types, never mixed:**

  | Type | Example | In Go and in Postgres |
  |---|---|---|
  | Instant | when a note was created | `time.Time` in UTC, `timestamptz` |
  | Calendar date | a birthday, a due date | a small `Date` type over `YYYY-MM-DD`, `date` |
  | Wall-clock time plus a zone | "9:00 every Monday in Europe/Paris" | the local time and the IANA zone name, as two columns |

  The standard library has no date-only type. A birthday stored as midnight UTC shows the day before for anyone west of London.
- **Show times in the user's zone** at the edge, in the web app. The server converts with `t.In(loc)` only for what it sends itself, such as an email.
- **Never parse an ambiguous string.** An instant goes through `time.Parse(time.RFC3339, s)`, a date through `time.DateOnly`. No layout like `"01/02/2006"` on user text.
- **A test clock.** Services get a `clock.Clock` from the composition root. `time.Now()` is called in one place, the system clock in `cmd/api`. Tests pass a fixed one.
- **Calendar days and hours differ.** `t.AddDate(0, 0, 1)` is the next calendar day, `t.Add(24 * time.Hour)` is 24 hours. Pick by what the words mean.
- **Daylight saving cases:** a day with 23 hours and one with 25, a local time that doesn't exist (2:30 on the spring-forward night), one that happens twice, and a repeating event across the change. For a time that doesn't exist or happens twice, `time.Date` picks one answer and its docs don't say which, so test what the app expects.

```go
type Clock interface{ Now() time.Time }

type systemClock struct{}

func (systemClock) Now() time.Time { return time.Now().UTC() }
```

**Why:** time bugs hide until a user in another zone, or the one night a year the clocks change, finds them.

## 12. A standard database

Postgres through pgx. Migrations are goose SQL files. Queries are sqlc: SQL in `.sql` files, typed Go generated from it. Only a module's repository package talks to the database.

- **Names:** snake_case plural tables, snake_case columns.
- **Primary key `id`:** a time-sortable UUIDv7 or ULID (one per project), made in Go by one helper. Never by the client, never a serial number.
- **`created_at` and `updated_at`** on every table, `timestamptz`, set in Go from the injected clock. Every write updates `updated_at`.
- **Foreign keys** are named `<table_singular>_id` and every one has an index.
- **Enums** are text with a check constraint, or a lookup table when the list changes often.
- **Booleans** start with `is_` or `has_`.
- **Soft delete only where `docs/decisions.md` says so,** with `deleted_at`. Every sqlc query on that table filters it out.
- **An audit table** (`audit_events`): `actor_user_id`, `action`, `object_type`, `object_id`, `created_at`, `request_id`. No personal data.
- **Migrations go forward only.** One SQL file each, with an `Up` section and no `Down`. Never edited after it has run. Never `goose down` on test or production.
- **Safe to roll out:** expand, then contract. Add a nullable column, ship the code, backfill, then make it required in a later migration. Never rename or drop a column in the deploy that stops using it.
- **Money columns** follow rule 10. **Time columns** follow rule 11.

```sql
-- +goose Up
CREATE TABLE notes (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id),
  title       text NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);
CREATE INDEX notes_user_id_idx ON notes (user_id);
```

**Why:** one naming style means nobody guesses a column. A foreign key without an index turns every join into a full scan. An unsafe migration takes the app down mid-deploy.

## 13. Logging

- **One JSON line per event,** written by `log/slog`'s JSON handler. No multi-line text, no string building.
- **Levels:** `debug` (off in production), `info` (a normal thing worth knowing, sampled if noisy), `warn` (the app coped: a retry, a fallback), `error` (a request or job failed and a person must look; never sampled).
- **Standard fields,** the same as the web app's: `ts` (UTC), `level`, `event` (an `object_action` name like `note_created`), `request_id`, `user_id` (an internal ID only, never an email or a name), `route`, `duration_ms` and `error_code` (on warn and error).
- **One logger package,** `internal/platform/logger`. Its `ReplaceAttr` renames `time` to `ts`, `msg` to `event` and lowercases the level. Nothing else calls `fmt.Print*`, `log.Print*` or the global `slog` functions. The context carries the logger with `request_id` already on it.
- **Redaction by default.** A secret is a type that logs as `[redacted]`. Passwords, tokens, cookies, auth headers, emails and personal data are masked before the line is written.
- **No log lines in loops.** Log once, after the loop, with a count. Sample noisy info such as health checks. Never sample `warn` or `error`.
- **An error is logged once, at the boundary** (rule 5). Code below it wraps the error and returns it.
- **Where logs go:** standard output, which Cloud Run collects. Read them with `gcloud run services logs read`. Whether the viewer reads `level` as severity is for the Go pack to check. How long logs are kept goes in `docs/stack.md`.

```go
type Secret string

func (Secret) LogValue() slog.Value { return slog.StringValue("[redacted]") }

func New(w io.Writer, level slog.Level) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			switch a.Key {
			case slog.TimeKey:
				return slog.Time("ts", a.Value.Time().UTC())
			case slog.MessageKey:
				a.Key = "event"
			case slog.LevelKey:
				a.Value = slog.StringValue(strings.ToLower(a.Value.String()))
			}
			return a
		},
	}))
}
```

**Why:** JSON lines with the same fields can be searched and counted. A token in a log is a leaked token.

## 14. Analytics events

- **One typed registry file,** `internal/platform/events/registry.go`. Each event is a struct type. Its name is `object_action` in the past tense. It sits in the registry's table with an owner and the date added.
- **One `track()` function,** `events.Track`. It takes only a registry type, because the interface has an unexported method, so no other package can make an event. Nothing else calls the analytics tool.
- **No personal data in fields:** no emails, names, free text or IP addresses. An internal ID at most.
- **Server-side events for important facts** (sign-up, payment, a plan change). The web app sends its own UI events through its own registry.
- **The same names in logs and analytics.** `note_created` is the log `event` and the analytics event.
- **A test** that every event's name matches `object_action` and has a registry entry. Review checks that a removed event is removed there too.

```go
type Event interface{ name() string }

type NoteCreated struct {
	NoteID  string `json:"note_id"`
	HasTags bool   `json:"has_tags"`
}

func (NoteCreated) name() string { return "note_created" }

var registry = map[string]Meta{"note_created": {Owner: "notes", Added: "2026-11-23"}}

func Track(ctx context.Context, e Event) { /* log the event, then send it */ }
```

**Why:** event names typed by hand drift, and the charts split three ways. A registry with an owner tells you who to ask before you delete one.

## 15. OpenAPI for every public route

- Every public route is in the OpenAPI document: each `/api/v1` and `/api/v2` path, the health endpoint and every webhook we receive. huma writes OpenAPI 3.1.
- **Code first.** The document is built from the same Go types the handlers use, and huma validates requests from them. The struct tags (`minLength`, `maximum`) are the rules. Never a second, hand-written copy.
- **Every public route goes through huma.** A route added with a plain `mux.HandleFunc` isn't in the document, and `check` can't see it. Only `cmd/api` touches the mux.
- **One file per version,** `api/openapi.v1.yaml`, printed by `cmd/openapi` and committed. `typecheck` regenerates it and the TypeScript client, then compares with git. A changed Go type fails `check` until both files are regenerated.
- The pack sets huma's array and `$schema` defaults once, so the generated client types stay clean.

```sh
go run ./cmd/openapi > api/openapi.v1.yaml
```

**Why:** a hand-written spec is wrong within a week. Built from the types the code runs, it can't drift.

## 16. Environment variables

The full convention is in [environments.md](environments.md). The short version:

- Four environments: local, test, preview and production. Each developer has their own `.env.local`, never shared, never committed.
- Settings that aren't secret live in committed deploy config per environment. Secrets live only in the host's secret store. The Go pack says which.
- **Set every variable on every deploy.** A Cloud Run revision keeps the values of the one before it, so a preview that points at its own Neon branch would leave that URL for the next deploy.
- **One typed `Config` struct,** loaded once in `cmd/api`. `config.Load` takes a lookup function, so only `main` calls `os.Getenv`. A missing variable stops startup with its name, never its value.
- Secrets in the struct are the `Secret` type from rule 13.
- Every variable is in `.env.example` with the `secrets` skill's metadata line. A test checks that the file and the struct list the same names. Adding one updates `.env.example`, the struct and the docs in the same pull request.

```go
func Load(get func(string) string) (Config, error) {
	var missing []string
	need := func(name string) string {
		if v := get(name); v != "" {
			return v
		}
		missing = append(missing, name)
		return ""
	}
	cfg := Config{DatabaseURL: logger.Secret(need("DATABASE_URL")), ClerkSecretKey: logger.Secret(need("CLERK_SECRET_KEY"))}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing environment variables: %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}
```

**Why:** a variable that only lives in one person's head breaks the next deploy and the next teammate's first day.

## 18. Access control

- **Simple apps:** "a user owns their own rows." The sign-in middleware (Clerk's Go SDK, in the pack) puts the user's ID in the context. Services take it as an argument, never from the request body. Every sqlc query filters by the owner, in the repository. Someone else's row returns `not_found`.
- **Anything more** (sharing, teams, roles, folders): relationship-based access control, as in `app-conventions.md` rule 18.
  - One `check(user, action, object)` function, behind a port: the `authz.Checker` interface. `cmd/api` injects the adapter, like a repository. Services call it. Nothing else decides access.
  - No role checks scattered in code. No `user.Role == "admin"` in a service or a handler.
  - The default adapter is the kit's small built-in engine: a tuples table in Postgres and the schema of relations as Go code in one file (until `research/authorization.md` confirms). SpiceDB, OpenFGA or another service can replace it without touching a service.
  - If `Check` returns an error, deny. Never fail open.
- The tech grill asks: *"Will people share things, have teams, or have roles?"* The answer goes in `docs/security-policy.md`.

```go
type Checker interface {
	Check(ctx context.Context, user UserID, action string, object Object) (bool, error)
}
```

**Why:** role checks copied into every handler drift, and one missed copy is a data leak. One `check()` is one place to test and one place to fix.

## What tools enforce

The pack turns what it can into lint: `internal/` folders and go-arch-lint hold the layers, and depguard keeps `net/http` and huma out of services and can ban `log`. Until a rule has a lint, `pr-review` checks it by hand, one line each. Rules 5, 10, 11 and 18 need judgement.
