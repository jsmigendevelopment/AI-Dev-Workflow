# Experiment: The contract: spec-first (oapi-codegen) against code-first (huma), and what fails when they drift

Run on 2026-11-28 on Linux x86-64 with Node 22.23.5. Go 1.24.7 was installed; its toolchain switch (GOTOOLCHAIN=auto) fetched 1.26.x for the tools that need it. The same two-operation notes API built both ways, each with a TypeScript client made from its OpenAPI document and a `client.ts` that reads `title`. Drift is simulated by renaming `Note.title` to `Note.name` in the source of truth, with and without regenerating.

Paths are shortened to `<tmp>`. A step's output is cut when it is long, and the cut says how many lines are missing.

## Spec-first scratch app: openapi.yaml, oapi-codegen strict std-http server, openapi-typescript

Script `setup-spec.sh`:

```bash
#!/bin/bash
# Spec-first scratch app: openapi.yaml -> oapi-codegen strict std-http server, and -> openapi-typescript client.
set -eu
D=$TMPDIR/exp/spec
rm -rf $D; mkdir -p $D/api $D/internal/api $D/cmd/api $D/web/src/api; cd $D
cat > go.mod <<'EOF'
module example.com/spec
go 1.26
EOF
cp ../demo/tools.mod ../demo/tools.sum . ; sed -i 's#^module .*#module example.com/spec/tools#' tools.mod
go get -modfile=tools.mod -tool github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.9.0 2>&1 | tail -1
cat > api/openapi.yaml <<'EOF'
openapi: 3.1.0
info: {title: Notes, version: 1.0.0}
paths:
  /api/v1/notes:
    get:
      operationId: listNotes
      responses:
        "200":
          description: all notes
          content:
            application/json:
              schema: {$ref: "#/components/schemas/NoteList"}
    post:
      operationId: createNote
      requestBody:
        required: true
        content:
          application/json:
            schema: {$ref: "#/components/schemas/NewNote"}
      responses:
        "201":
          description: created
          content:
            application/json:
              schema: {$ref: "#/components/schemas/Note"}
components:
  schemas:
    Note:
      type: object
      required: [id, title]
      properties:
        id: {type: string}
        title: {type: string}
    NewNote:
      type: object
      required: [title]
      properties:
        title: {type: string}
    NoteList:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items: {$ref: "#/components/schemas/Note"}
EOF
cat > api/cfg.yaml <<'EOF'
package: api
output: internal/api/api.gen.go
generate:
  models: true
  std-http-server: true
  strict-server: true
EOF
cat > internal/api/server.go <<'EOF'
package api
import "context"
// Server implements the strict server interface.
type Server struct{}
// ListNotes answers GET /api/v1/notes.
func (Server) ListNotes(_ context.Context, _ ListNotesRequestObject) (ListNotesResponseObject, error) {
	return ListNotes200JSONResponse{Items: []Note{{Id: "1", Title: "first"}}}, nil
}
// CreateNote answers POST /api/v1/notes.
func (Server) CreateNote(_ context.Context, r CreateNoteRequestObject) (CreateNoteResponseObject, error) {
	return CreateNote201JSONResponse{Id: "2", Title: r.Body.Title}, nil
}
EOF
cat > cmd/api/main.go <<'EOF'
// Command api serves the notes API.
package main
import (
	"log"
	"net/http"
	"example.com/spec/internal/api"
)
func main() {
	mux := http.NewServeMux()
	api.HandlerFromMux(api.NewStrictHandler(api.Server{}, nil), mux)
	log.Fatal(http.ListenAndServe(":8081", mux))
}
EOF
cat > web/package.json <<'EOF'
{ "name": "web", "private": true, "type": "module" }
EOF
cat > web/tsconfig.json <<'EOF'
{ "compilerOptions": { "strict": true, "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "noEmit": true, "skipLibCheck": false, "types": [] }, "include": ["src"] }
EOF
cat > web/src/client.ts <<'EOF'
import createClient from "openapi-fetch";
import type { paths } from "./api/schema";
const client = createClient<paths>({ baseUrl: "http://localhost:8081" });
export async function firstTitle(): Promise<string | undefined> {
  const { data } = await client.GET("/api/v1/notes");
  return data?.items[0]?.title;
}
export async function add(title: string): Promise<string | undefined> {
  const { data } = await client.POST("/api/v1/notes", { body: { title } });
  return data?.id;
}
EOF
cd web
npm install --save-dev --legacy-peer-deps --no-audit --no-fund typescript@6.0.3 openapi-typescript@7.13.0 openapi-fetch@0.17.0 2>&1 | tail -8
```

Output:

```
go: upgraded golang.org/x/tools v0.52.0 => v0.53.0
added 35 packages in 2s
```

## npm against TypeScript 6.0.3 and openapi-typescript 7.13.0 (the install above used `--legacy-peer-deps` after this)

Script `exp8.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/exp/spec/web
rm -rf node_modules package-lock.json
echo '{ "name": "web", "private": true, "type": "module" }' > package.json
echo "=== plain install (TS 6.0.3 + openapi-typescript 7.13.0)"
npm install --save-dev --no-audit --no-fund typescript@6.0.3 openapi-typescript@7.13.0 openapi-fetch@0.17.0 2>&1 | grep -i "ERESOLVE\|peer\|Found\|Could not" | head -8
echo "=== with TS 5.9 for comparison"
npm view typescript@5 version 2>/dev/null | tail -2
echo "=== legacy-peer-deps"
rm -rf node_modules package-lock.json
npm install --save-dev --legacy-peer-deps --no-audit --no-fund typescript@6.0.3 openapi-typescript@7.13.0 openapi-fetch@0.17.0 2>&1 | tail -3
```

Output:

```
=== plain install (TS 6.0.3 + openapi-typescript 7.13.0)
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error Found: typescript@6.0.3
npm error Could not resolve dependency:
npm error peer typescript@"^5.x" from openapi-typescript@7.13.0
npm error this command with --force or --legacy-peer-deps
npm error <tmp>/npm-logs/2026-11-28T05_45_37_366Z-eresolve-report.txt
npm error A complete log of this run can be found in: <tmp>/npm-logs/2026-11-28T05_45_37_366Z-debug-0.log
=== with TS 5.9 for comparison
typescript@5.9.2 '5.9.2'
typescript@5.9.3 '5.9.3'
=== legacy-peer-deps
added 35 packages in 2s
```

## Spec-first drift: what fails at each step

Script `exp9.sh`:

```bash
#!/bin/bash
# Drift experiment for the spec-first pick: rename Note.title to Note.name in the spec only.
set -u
cd $TMPDIR/exp/spec
OAPI="go tool -modfile=tools.mod oapi-codegen"
gen() {
  $OAPI -config api/cfg.yaml api/openapi.yaml || return 1
  (cd web && ./node_modules/.bin/openapi-typescript ../api/openapi.yaml -o src/api/schema.d.ts) 2>&1 | tail -1
}
step() { echo "--- $1"; shift; "$@" > $TMPDIR/step.out 2>&1; echo "exit $?"; head -${LINES_SHOWN:-4} $TMPDIR/step.out | cut -c1-220; }
gencheck() {
  rm -rf $TMPDIR/ref; mkdir -p $TMPDIR/ref
  cp internal/api/api.gen.go $TMPDIR/ref/api.gen.go; cp web/src/api/schema.d.ts $TMPDIR/ref/schema.d.ts
  gen > /dev/null 2>&1
  diff -q $TMPDIR/ref/api.gen.go internal/api/api.gen.go && diff -q $TMPDIR/ref/schema.d.ts web/src/api/schema.d.ts
}
echo "=== A: baseline"
gen >/dev/null; go mod tidy 2>&1 | tail -2
time gen
echo "go.mod lines: $(wc -l < go.mod)"; grep -c "^tool" go.mod
step "go build" go build ./...
step "go vet" go vet ./...
step "tsc" bash -c 'cd web && ./node_modules/.bin/tsc --noEmit -p .'
step "gen:check" gencheck
wc -l internal/api/api.gen.go web/src/api/schema.d.ts
echo "=== B: spec edited (Note.title -> Note.name), nothing regenerated"
cp api/openapi.yaml $TMPDIR/openapi.orig
awk '/^    Note:/{n=1} /^    NewNote:/{n=0} {if(n){gsub(/title/,"name")} print}' $TMPDIR/openapi.orig > api/openapi.yaml
diff $TMPDIR/openapi.orig api/openapi.yaml
step "go build (stale generated code)" go build ./...
step "tsc (stale generated types)" bash -c 'cd web && ./node_modules/.bin/tsc --noEmit -p .'
step "gen:check" gencheck
echo "=== C: regenerated (gen:check wrote the new files)"
step "go build" go build ./...
step "go vet" go vet ./...
step "tsc" bash -c 'cd web && ./node_modules/.bin/tsc --noEmit -p .'
```

Output:

```
=== A: baseline
go: finding module for package github.com/oapi-codegen/runtime
go: found github.com/oapi-codegen/runtime in github.com/oapi-codegen/runtime v1.9.1
🚀 ../api/openapi.yaml → src/api/schema.d.ts [30.6ms]
real	0m0.640s
user	0m0.659s
sys	0m0.139s
go.mod lines: 10
0
--- go build
exit 0
--- go vet
exit 0
--- tsc
exit 0
--- gen:check
exit 0
  357 internal/api/api.gen.go
   90 web/src/api/schema.d.ts
  447 total
=== B: spec edited (Note.title -> Note.name), nothing regenerated
30c30
<       required: [id, title]
---
>       required: [id, name]
33c33
<         title: {type: string}
---
>         name: {type: string}
--- go build (stale generated code)
exit 0
--- tsc (stale generated types)
exit 0
--- gen:check
exit 1
Files <tmp>/ref/api.gen.go and internal/api/api.gen.go differ
=== C: regenerated (gen:check wrote the new files)
--- go build
exit 1
# example.com/spec/internal/api
internal/api/server.go:10:58: unknown field Title in struct literal of type Note
internal/api/server.go:15:44: unknown field Title in struct literal of type CreateNote201JSONResponse
--- go vet
exit 1
# example.com/spec/internal/api
internal/api/server.go:10:58: unknown field Title in struct literal of type Note
internal/api/server.go:15:44: unknown field Title in struct literal of type CreateNote201JSONResponse
--- tsc
exit 2
src/client.ts(8,26): error TS2339: Property 'title' does not exist on type '{ id: string; name: string; }'.
```

## Spec-first request validation: the strict server alone (this step also tried to build a second server before its dependency was added; the next step adds it)

Script `exp11.sh`:

```bash
#!/bin/bash
# Spec-first: does the generated strict server check a constraint (minLength) on its own?
set -u
cd $TMPDIR/exp/spec
OAPI="go tool -modfile=tools.mod oapi-codegen"
cp $TMPDIR/openapi.orig api/openapi.yaml
# constraint: NewNote.title minLength 1
awk '/^    NewNote:/{n=1} /^    NoteList:/{n=0} {if(n && /title: \{type: string\}/){sub(/\{type: string\}/,"{type: string, minLength: 1}")} print}' api/openapi.yaml > $TMPDIR/o.yaml && cp $TMPDIR/o.yaml api/openapi.yaml
grep -n "minLength" api/openapi.yaml
cat > api/cfg.yaml <<'EOF'
package: api
output: internal/api/api.gen.go
generate:
  models: true
  std-http-server: true
  strict-server: true
  embedded-spec: true
EOF
$OAPI -config api/cfg.yaml api/openapi.yaml
go get github.com/oapi-codegen/nethttp-middleware@v1.3.1 2>&1 | tail -1
go mod tidy 2>&1 | tail -1
mkdir -p cmd/api2
cat > cmd/api2/main.go <<'EOF'
// Command api2 serves the notes API with request validation from the spec.
package main
import (
	"log"
	"net/http"
	middleware "github.com/oapi-codegen/nethttp-middleware"
	"example.com/spec/internal/api"
)
func main() {
	spec, err := api.GetSwagger()
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	api.HandlerFromMux(api.NewStrictHandler(api.Server{}, nil), mux)
	log.Fatal(http.ListenAndServe(":8083", middleware.OapiRequestValidator(spec)(mux)))
}
EOF
go build -o $TMPDIR/spec-api ./cmd/api && go build -o $TMPDIR/spec-api2 ./cmd/api2 && echo BUILT
$TMPDIR/spec-api > $TMPDIR/spec-api.log 2>&1 &
P1=$!
$TMPDIR/spec-api2 > $TMPDIR/spec-api2.log 2>&1 &
P2=$!
sleep 1
curl -s -o $TMPDIR/b1 -w "strict server alone, empty title -> HTTP %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"title":""}' localhost:8081/api/v1/notes
cat $TMPDIR/b1; echo
curl -s -o $TMPDIR/b2 -w "strict server + nethttp-middleware, empty title -> HTTP %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"title":""}' localhost:8083/api/v1/notes
cat $TMPDIR/b2; echo
curl -s -o /dev/null -w "with middleware, good title -> HTTP %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"title":"x"}' localhost:8083/api/v1/notes
kill $P1 $P2; wait 2>/dev/null
ls -la $TMPDIR/spec-api $TMPDIR/spec-api2 $TMPDIR/code-api | awk '{print $5, $9}'
```

Output:

```
38:        title: {type: string, minLength: 1}
go: added golang.org/x/text v0.40.0
cmd/api2/main.go:8:2: no required module provides package github.com/oapi-codegen/nethttp-middleware; to add it:
	go get github.com/oapi-codegen/nethttp-middleware
strict server alone, empty title -> HTTP 201
{"id":"2","title":""}
strict server + nethttp-middleware, empty title -> HTTP 400
error at "/title": at '/title': minLength: got 0, want 1
Schema:
  null
Value:
  ""
with middleware, good title -> HTTP 201
10453490 <tmp>/code-api
11295814 <tmp>/spec-api
12902908 <tmp>/spec-api2
```

## Spec-first request validation: with nethttp-middleware

Script `exp12.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/exp/spec
go get github.com/oapi-codegen/nethttp-middleware@v1.3.1 2>&1 | tail -1
go mod tidy 2>&1 | tail -1
go build -o $TMPDIR/spec-api2 ./cmd/api2 && echo BUILT
$TMPDIR/spec-api2 > $TMPDIR/s2.log 2>&1 &
P=$!
sleep 1
curl -s -w " -> HTTP %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"title":""}' localhost:8083/api/v1/notes
curl -s -w " -> HTTP %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"title":"x"}' localhost:8083/api/v1/notes
kill $P; wait 2>/dev/null
cat go.mod
ls -la $TMPDIR/spec-api2 | awk '{print $5}'
```

Output:

```
go: added github.com/oapi-codegen/nethttp-middleware v1.3.1
BUILT
error at "/title": at '/title': minLength: got 0, want 1
Schema:
  null
Value:
  ""
 -> HTTP 400
{"id":"2","title":"x"}
 -> HTTP 201
module example.com/spec
go 1.26.0
require (
	github.com/getkin/kin-openapi v0.152.0
	github.com/oapi-codegen/nethttp-middleware v1.3.1
	github.com/oapi-codegen/runtime v1.9.1
)
require (
	github.com/apapsch/go-jsonmerge/v2 v2.0.0 // indirect
	github.com/go-openapi/jsonpointer v1.0.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/gorilla/mux v1.8.1 // indirect
	github.com/oasdiff/yaml v0.1.1 // indirect
	github.com/oasdiff/yaml3 v0.0.14 // indirect
	github.com/rogpeppe/go-internal v1.9.0 // indirect
	github.com/santhosh-tekuri/jsonschema/v6 v6.0.3 // indirect
	golang.org/x/text v0.40.0 // indirect
)
12902908
```

## Schemathesis against both servers, from the spec

Script `exp14.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/exp/spec
export PIP_CACHE_DIR=$TMPDIR/pipcache
$TMPDIR/spec-api > $TMPDIR/s1.log 2>&1 &
P1=$!
$TMPDIR/spec-api2 > $TMPDIR/s2.log 2>&1 &
P2=$!
sleep 1
for port in 8081 8083; do
  echo "=== schemathesis against :$port"
  ( time $TMPDIR/venv/bin/schemathesis run api/openapi.yaml --url http://localhost:$port --max-examples 50 --no-color ) > $TMPDIR/st-$port.out 2>&1
  echo "exit $?"
  grep -v "^$" $TMPDIR/st-$port.out | cut -c1-200 | head -45
done
kill $P1 $P2; wait 2>/dev/null
```

Output:

```
=== schemathesis against :8081
exit 1
Schemathesis v4.34.4
━━━━━━━━━━━━━━━━━━━━
 ✅  Loaded specification from api/openapi.yaml (in 0.20s)
     Base URL:         http://localhost:8081
     Specification:    Open API 3.1.0
     Operations:       2 selected / 2 total
 ✅  API capabilities:
     Supports NULL byte in headers:                            ✘
     Accepts backslash and control characters in URL paths:    ✓
 ⏭   Examples (in 0.00s)
     ⏭  2 skipped
 ❌  Coverage (in 1.04s)
     ✅ 1 passed  ❌ 1 failed
 ❌  Fuzzing (in 0.19s)
     ✅ 1 passed  ❌ 1 failed
=================================== FAILURES ===================================
______________________________ POST /api/v1/notes ______________________________
1. Test Case ID: YScUvb
- ST103 Undocumented status code
    Received: 400
    Documented: 201
[400] Bad Request:
    `can't decode JSON body: EOF`
Reproduce with:
    curl -X POST http://localhost:8081/api/v1/notes
    st replay YScUvb
2. Test Case ID: jinRvE
- ST201 Schema-violating request accepted
    Invalid data should have been rejected
    Expected: 400, 401, 403, 404, 405, 406, 409, 415, 422, 428, 429, 5xx
    Invalid component: in body - violates `minLength` at /properties/title (was "0", became "")
[201] Created:
    `{"id":"2","title":""}`
Reproduce with:
    curl -X POST -H 'Content-Type: application/json' -d '{"title": ""}' http://localhost:8081/api/v1/notes
    st replay jinRvE
=================================== SUMMARY ====================================
API Operations:
  Selected: 2/2
  Tested: 2
Test Phases:
  ⏭  Examples
  ❌ Coverage
  ❌ Fuzzing
  ⏭  Stateful (not applicable)
=== schemathesis against :8083
exit 1
Schemathesis v4.34.4
... (44 more lines cut)
```

## Code-first scratch app: huma on ServeMux, spec written by a small `cmd/openapi`

Script `setup-code.sh`:

```bash
#!/bin/bash
# Code-first scratch app: Go types -> huma -> openapi.yaml (OpenAPI 3.1) -> openapi-typescript.
set -eu
D=$TMPDIR/exp/code
rm -rf $D; mkdir -p $D/api $D/internal/api $D/cmd/api $D/cmd/openapi $D/web/src/api; cd $D
cat > go.mod <<'EOF'
module example.com/code
go 1.26
EOF
cat > internal/api/api.go <<'EOF'
// Package api registers the notes operations on a huma API.
package api
import (
	"context"
	"github.com/danielgtaylor/huma/v2"
)
// Note is one note.
type Note struct {
	ID    string `json:"id"`
	Title string `json:"title" minLength:"1"`
}
// NoteList is the list answer.
type NoteList struct {
	Items []Note `json:"items" nullable:"false"`
}
// ListOutput is the list operation's response.
type ListOutput struct{ Body NoteList }
// CreateInput is the create operation's request.
type CreateInput struct {
	Body struct {
		Title string `json:"title" minLength:"1"`
	}
}
// CreateOutput is the create operation's response.
type CreateOutput struct {
	Body   Note
}
// Register adds the operations.
func Register(a huma.API) {
	huma.Register(a, huma.Operation{OperationID: "listNotes", Method: "GET", Path: "/api/v1/notes"},
		func(_ context.Context, _ *struct{}) (*ListOutput, error) {
			return &ListOutput{Body: NoteList{Items: []Note{{ID: "1", Title: "first"}}}}, nil
		})
	huma.Register(a, huma.Operation{OperationID: "createNote", Method: "POST", Path: "/api/v1/notes", DefaultStatus: 201},
		func(_ context.Context, in *CreateInput) (*CreateOutput, error) {
			return &CreateOutput{Body: Note{ID: "2", Title: in.Body.Title}}, nil
		})
}
EOF
cat > cmd/api/main.go <<'EOF'
// Command api serves the notes API.
package main
import (
	"log"
	"net/http"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	"example.com/code/internal/api"
)
func main() {
	mux := http.NewServeMux()
	api.Register(humago.New(mux, huma.DefaultConfig("Notes", "1.0.0")))
	log.Fatal(http.ListenAndServe(":8082", mux))
}
EOF
cat > cmd/openapi/main.go <<'EOF'
// Command openapi prints the OpenAPI document of the notes API, without starting a server.
package main
import (
	"fmt"
	"net/http"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	"example.com/code/internal/api"
)
func main() {
	a := humago.New(http.NewServeMux(), huma.DefaultConfig("Notes", "1.0.0"))
	api.Register(a)
	y, err := a.OpenAPI().YAML()
	if err != nil {
		panic(err)
	}
	fmt.Print(string(y))
}
EOF
cp ../spec/web/tsconfig.json ../spec/web/package.json web/
mkdir -p web/src; cp ../spec/web/src/client.ts web/src/client.ts
sed -i 's#8081#8082#' web/src/client.ts
cd web
npm install --save-dev --legacy-peer-deps --no-audit --no-fund typescript@6.0.3 openapi-typescript@7.13.0 openapi-fetch@0.17.0 2>&1 | tail -2
cd ..
go get github.com/danielgtaylor/huma/v2@v2.41.0 2>&1 | tail -2
go mod tidy 2>&1 | tail -2
go build ./... && echo BUILD-OK
go run ./cmd/openapi > api/openapi.yaml
(cd web && ./node_modules/.bin/openapi-typescript ../api/openapi.yaml -o src/api/schema.d.ts)
(cd web && ./node_modules/.bin/tsc --noEmit -p . && echo TSC-OK)
echo "go.mod lines: $(wc -l < go.mod)"
```

Output:

```

added 35 packages in 2s
go: upgraded go 1.26 => 1.26.10
go: added github.com/danielgtaylor/huma/v2 v2.41.0
BUILD-OK
✨ openapi-typescript 7.13.0
🚀 ../api/openapi.yaml → src/api/schema.d.ts [33.4ms]
TSC-OK
... (1 more lines cut)
```

## Code-first drift and request validation

Script `exp10.sh`:

```bash
#!/bin/bash
# Code-first drift (huma) and request validation in both styles.
set -u
cd $TMPDIR/exp/code
gen() {
  go run ./cmd/openapi > api/openapi.yaml || return 1
  (cd web && ./node_modules/.bin/openapi-typescript ../api/openapi.yaml -o src/api/schema.d.ts) 2>&1 | tail -1
}
step() { echo "--- $1"; shift; "$@" > $TMPDIR/step.out 2>&1; echo "exit $?"; head -4 $TMPDIR/step.out | cut -c1-200; }
gencheck() {
  rm -rf $TMPDIR/ref; mkdir -p $TMPDIR/ref
  cp api/openapi.yaml $TMPDIR/ref/openapi.yaml; cp web/src/api/schema.d.ts $TMPDIR/ref/schema.d.ts
  gen > /dev/null 2>&1
  diff -q $TMPDIR/ref/openapi.yaml api/openapi.yaml && diff -q $TMPDIR/ref/schema.d.ts web/src/api/schema.d.ts
}
echo "=== code-first A: baseline"
step "go build" go build ./...
step "tsc" bash -c 'cd web && ./node_modules/.bin/tsc --noEmit -p .'
step "gen:check" gencheck
echo "=== code-first B: Go type renamed (Note.Title -> Note.Name) with its handler, nothing regenerated"
sed -i '0,/Title string `json:"title" minLength:"1"`/s//Name string `json:"name" minLength:"1"`/' internal/api/api.go
sed -i 's/{ID: "1", Title:/{ID: "1", Name:/; s/Note{ID: "2", Title:/Note{ID: "2", Name:/' internal/api/api.go
step "go build (spec and client stale, server consistent)" go build ./...
step "tsc (stale types)" bash -c 'cd web && ./node_modules/.bin/tsc --noEmit -p .'
step "gen:check" gencheck
echo "=== code-first C: regenerated"
step "tsc" bash -c 'cd web && ./node_modules/.bin/tsc --noEmit -p .'
echo "=== validation: huma, POST empty title"
go build -o $TMPDIR/code-api ./cmd/api
$TMPDIR/code-api > $TMPDIR/code-api.log 2>&1 &
PID=$!
sleep 1
curl -s -o $TMPDIR/body.out -w "huma POST empty title -> HTTP %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"title":""}' localhost:8082/api/v1/notes
head -c 300 $TMPDIR/body.out; echo
curl -s -o /dev/null -w "huma POST good title -> HTTP %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"title":"x"}' localhost:8082/api/v1/notes
kill $PID; wait $PID 2>/dev/null
cat $TMPDIR/code-api.log | head -5
```

Output:

```
=== code-first A: baseline
--- go build
exit 0
--- tsc
exit 0
--- gen:check
exit 0
=== code-first B: Go type renamed (Note.Title -> Note.Name) with its handler, nothing regenerated
--- go build (spec and client stale, server consistent)
exit 0
--- tsc (stale types)
exit 0
--- gen:check
exit 1
Files <tmp>/ref/openapi.yaml and api/openapi.yaml differ
=== code-first C: regenerated
--- tsc
exit 2
src/client.ts(8,26): error TS2339: Property 'title' does not exist on type '{ readonly $schema?: string | undefined; id: string; name: string; }'.
=== validation: huma, POST empty title
huma POST empty title -> HTTP 422
{"$schema":"http://localhost:8082/schemas/ErrorModel.json","title":"Unprocessable Entity","status":422,"detail":"validation failed","errors":[{"message":"expected length >= 1","location":"body.title","value":""}]}
huma POST good title -> HTTP 201
```

## huma arrays are nullable by default

Script `exp23.sh`:

```bash
#!/bin/bash
# huma arrays are nullable by default: what the generated TypeScript says, and the one-line fix.
set -u
cd $TMPDIR/exp/code
cp internal/api/api.go $TMPDIR/api.go.keep
sed -i 's/ nullable:"false"//' internal/api/api.go
go run ./cmd/openapi > api/openapi.yaml
(cd web && ./node_modules/.bin/openapi-typescript ../api/openapi.yaml -o src/api/schema.d.ts > /dev/null)
echo "--- default: the items field in the generated types"
grep -n "items" web/src/api/schema.d.ts | head -3
(cd web && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | head -3 | cut -c1-200)
echo "--- huma.DefaultArrayNullable = false (one line in main) instead of a tag on every slice"
sed -i 's|^func Register(a huma.API) {|func Register(a huma.API) {\n\thuma.DefaultArrayNullable = false|' internal/api/api.go
go run ./cmd/openapi > api/openapi.yaml
(cd web && ./node_modules/.bin/openapi-typescript ../api/openapi.yaml -o src/api/schema.d.ts > /dev/null)
grep -n "items" web/src/api/schema.d.ts | head -3
(cd web && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | head -3 | cut -c1-200; echo "tsc exit ${PIPESTATUS[0]}")
cp $TMPDIR/api.go.keep internal/api/api.go
```

Output:

```
--- default: the items field in the generated types
37:            /** @description Where the error occurred, e.g. 'body.items[3].tags' or 'path.thing-id' */
100:            items: components["schemas"]["Note"][] | null;
src/client.ts(8,10): error TS18047: 'data.items' is possibly 'null'.
--- huma.DefaultArrayNullable = false (one line in main) instead of a tag on every slice
37:            /** @description Where the error occurred, e.g. 'body.items[3].tags' or 'path.thing-id' */
100:            items: components["schemas"]["Note"][];
tsc exit 0
```
