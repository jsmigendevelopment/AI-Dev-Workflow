# Experiment: Boundary rules: depguard, go-arch-lint, arch-go and Go's own internal folders

Run on 2026-11-28 on Linux x86-64 with Node 22.23.5. Go 1.24.7 was installed; its toolchain switch (GOTOOLCHAIN=auto) fetched 1.26.x for the tools that need it. A scratch Go app with two modules (`notes`, `tags`), each with `handler`, `service` and `repository` packages. Each step adds one bad import, runs the check, and removes the file again. The app, the tools and the rules are scratch files, not part of the repo.

Go as installed, checked again at the end of the session (`/usr/local/go/bin/go version`): `go version go1.24.7 linux/amd64`. The scratch folder of the first runs was deleted by the machine during the session, so the logs below are the copies kept in this file.

Paths are shortened to `<tmp>`. A step's output is cut when it is long, and the cut says how many lines are missing.

## Make the scratch app (flat layout: layers directly under each module)

Script `setup-demo.sh`:

```bash
#!/bin/bash
# Makes the scratch Go app used to measure the boundary rules. Everything lives under $TMPDIR/exp/demo.
set -eu
D=$TMPDIR/exp/demo
rm -rf $D; mkdir -p $D/tools; cd $D
cat > go.mod <<'EOF'
module example.com/demo
go 1.26
EOF
for m in notes tags; do
  mkdir -p internal/modules/$m/{handler,service,repository}
  cat > internal/modules/$m/repository/repository.go <<EOF
// Package repository holds the $m data access.
package repository
// Repo stores $m.
type Repo struct{}
// Count returns how many $m exist.
func (Repo) Count() int { return 0 }
EOF
  cat > internal/modules/$m/service/service.go <<EOF
// Package service holds the $m rules.
package service
import "example.com/demo/internal/modules/$m/repository"
// Service holds the $m rules.
type Service struct{ Repo repository.Repo }
// Count asks the repository.
func (s Service) Count() int { return s.Repo.Count() }
EOF
  cat > internal/modules/$m/handler/handler.go <<EOF
// Package handler is the $m HTTP edge.
package handler
import (
	"net/http"
	"example.com/demo/internal/modules/$m/service"
)
// Handler serves $m.
type Handler struct{ Svc service.Service }
// ServeHTTP answers.
func (h Handler) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	_, _ = w.Write([]byte{byte(h.Svc.Count())})
}
EOF
done
mkdir -p cmd/api
cat > cmd/api/main.go <<'EOF'
// Command api starts the demo server.
package main
import (
	"log"
	"net/http"
	notesH "example.com/demo/internal/modules/notes/handler"
	tagsH "example.com/demo/internal/modules/tags/handler"
)
func main() {
	mux := http.NewServeMux()
	mux.Handle("GET /notes", notesH.Handler{})
	mux.Handle("GET /tags", tagsH.Handler{})
	log.Fatal(http.ListenAndServe(":8080", mux))
}
EOF
go build ./... && echo BUILD-OK
```

Output:

```
BUILD-OK
```

## Pin the tools in their own modfile with `go get -tool`, run them with `go tool -modfile`

Script `exp2.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/exp/demo
cp go.mod tools.mod
sed -i 's#^module .*#module example.com/demo/tools#' tools.mod
go get -modfile=tools.mod -tool github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0 2>&1 | tail -3
go get -modfile=tools.mod -tool github.com/fe3dback/go-arch-lint@v1.19.2 2>&1 | tail -3
echo "--- go.mod after:"; cat go.mod
echo "--- tools.mod lines:"; wc -l tools.mod; grep -n "^tool\|^go " tools.mod
ls
echo "--- run"
time go tool -modfile=tools.mod golangci-lint version 2>&1 | tail -2
time go tool -modfile=tools.mod go-arch-lint version 2>&1 | tail -2
```

Output:

```
go: added honnef.co/go/tools v0.8.2
go: added mvdan.cc/gofumpt v0.12.0
go: added mvdan.cc/unparam v0.0.0-20260823230713-2fa3d841b0c8
go: added gonum.org/v1/plot v0.12.0
go: added oss.terrastruct.com/d2 v0.5.1
go: added oss.terrastruct.com/util-go v0.0.0-20230604222829-11c3c60fec14
--- go.mod after:
module example.com/demo
go 1.26
--- tools.mod lines:
249 tools.mod
3:go 1.26.0
5:tool (
cmd
go.mod
internal
tools
tools.mod
tools.sum
--- run
golangci-lint has version 2.15.0 built with go1.26.0 from (unknown, modified: ?, mod sum: "h1:w94zf8HAYI7hm3164kwKsvZRuqXvY+YxeFoTbu1OLg8=") on (unknown)
real	0m0.434s
user	0m0.486s
sys	0m0.184s
Build time: unknown
Commit hash: unknown
real	0m0.229s
user	0m0.249s
sys	0m0.084s
```

## depguard inside golangci-lint: a glob in `pkg` and per-module rules, funlen

Script `exp3.sh`:

```bash
#!/bin/bash
# Boundary rule experiments: depguard (generic glob and per-module), go-arch-lint, in the scratch app.
set -u
cd $TMPDIR/exp/demo
GL="go tool -modfile=tools.mod golangci-lint"
AL="go tool -modfile=tools.mod go-arch-lint"
cat > .golangci.yml <<'EOF'
version: "2"
linters:
  default: none
  enable: [depguard, funlen]
  settings:
    funlen: {lines: 60, statements: 40}
    depguard:
      rules:
        handler-skips-service:
          files: ["**/internal/modules/*/handler/**"]
          deny:
            - pkg: example.com/demo/internal/modules/*/repository
              desc: a handler goes through its service
        service-not-http:
          files: ["**/internal/modules/*/service/**"]
          deny:
            - pkg: net/http
              desc: a service knows no HTTP
        notes-is-alone:
          files: ["**/internal/modules/notes/**"]
          deny:
            - pkg: example.com/demo/internal/modules/tags
              desc: modules do not import each other
EOF
echo "=== baseline"; $GL run ./... ; echo "exit $?"
echo "=== V1 cross-module: notes/service imports tags/service"
cat > internal/modules/notes/service/v1.go <<'EOF'
package service
import _ "example.com/demo/internal/modules/tags/service"
EOF
$GL run ./... ; echo "exit $?"; rm internal/modules/notes/service/v1.go
echo "=== V2 handler skips service"
cat > internal/modules/notes/handler/v2.go <<'EOF'
package handler
import _ "example.com/demo/internal/modules/notes/repository"
EOF
$GL run ./... ; echo "exit $?"; rm internal/modules/notes/handler/v2.go
echo "=== V3 service imports net/http"
cat > internal/modules/tags/service/v3.go <<'EOF'
package service
import _ "net/http"
EOF
$GL run ./... ; echo "exit $?"; rm internal/modules/tags/service/v3.go
echo "=== V4 cross-module from tags (no rule for tags)"
cat > internal/modules/tags/service/v4.go <<'EOF'
package service
import _ "example.com/demo/internal/modules/notes/service"
EOF
$GL run ./... ; echo "exit $?"; rm internal/modules/tags/service/v4.go
echo "=== V5 a function over 60 lines"
{ echo 'package service'; echo 'func Long() int {'; echo '  x := 0'; for i in $(seq 1 70); do echo "  x += $i"; done; echo '  return x'; echo '}'; } > internal/modules/tags/service/v5.go
$GL run ./... ; echo "exit $?"; rm internal/modules/tags/service/v5.go
```

Output:

```
=== baseline
0 issues.
exit 0
=== V1 cross-module: notes/service imports tags/service
internal/modules/notes/service/v1.go:3:8: import 'example.com/demo/internal/modules/tags/service' is not allowed from list 'notes-is-alone': modules do not import each other (depguard)
import _ "example.com/demo/internal/modules/tags/service"
       ^
1 issues:
* depguard: 1
exit 1
=== V2 handler skips service
0 issues.
exit 0
=== V3 service imports net/http
internal/modules/tags/service/v3.go:3:8: import 'net/http' is not allowed from list 'service-not-http': a service knows no HTTP (depguard)
import _ "net/http"
       ^
1 issues:
* depguard: 1
exit 1
=== V4 cross-module from tags (no rule for tags)
0 issues.
exit 0
=== V5 a function over 60 lines
internal/modules/tags/service/v5.go:2:6: Function 'Long' has too many statements (72 > 40) (funlen)
func Long() int {
     ^
1 issues:
* funlen: 1
exit 1
```

## depguard with explicit per-module prefixes

Script `exp3b.sh`:

```bash
#!/bin/bash
# depguard again, with explicit per-module prefixes in place of the glob that did not match.
set -u
cd $TMPDIR/exp/demo
GL="go tool -modfile=tools.mod golangci-lint"
cat > .golangci.yml <<'EOF'
version: "2"
linters:
  default: none
  enable: [depguard]
  settings:
    depguard:
      rules:
        notes-handler:
          files: ["**/internal/modules/notes/handler/**"]
          deny:
            - pkg: example.com/demo/internal/modules/notes/repository
              desc: a handler goes through its service
        tags-is-alone:
          list-mode: lax
          files: ["**/internal/modules/tags/**"]
          allow:
            - example.com/demo/internal/modules/tags
          deny:
            - pkg: example.com/demo/internal/modules
              desc: modules do not import each other
EOF
echo "--- baseline"; $GL run ./... ; echo "exit $?"
echo "--- V2 handler skips service (explicit prefix)"
cat > internal/modules/notes/handler/v2.go <<'EOF'
package handler
import _ "example.com/demo/internal/modules/notes/repository"
EOF
$GL run ./... 2>&1 | head -3 | cut -c1-200; rm internal/modules/notes/handler/v2.go
echo "--- V4 cross-module from tags (lax rule: own prefix allowed, siblings denied)"
cat > internal/modules/tags/service/v4.go <<'EOF'
package service
import _ "example.com/demo/internal/modules/notes/service"
EOF
$GL run ./... 2>&1 | head -3 | cut -c1-200; rm internal/modules/tags/service/v4.go
echo "--- the tags module may import itself (baseline above passes: tags/service imports tags/repository)"
```

Output:

```
--- baseline
0 issues.
exit 0
--- V2 handler skips service (explicit prefix)
internal/modules/notes/handler/v2.go:3:8: import 'example.com/demo/internal/modules/notes/repository' is not allowed from list 'notes-handler': a handler goes through its service (depguard)
import _ "example.com/demo/internal/modules/notes/repository"
       ^
--- V4 cross-module from tags (lax rule: own prefix allowed, siblings denied)
internal/modules/tags/service/v4.go:3:8: import 'example.com/demo/internal/modules/notes/service' is not allowed from list 'tags-is-alone': modules do not import each other (depguard)
import _ "example.com/demo/internal/modules/notes/service"
       ^
--- the tags module may import itself (baseline above passes: tags/service imports tags/repository)
```

## go-arch-lint with generic layer components, flat layout

Script `exp5.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/exp/demo
AL="go tool -modfile=tools.mod go-arch-lint"
cat > .go-arch-lint.yml <<'EOY'
version: 3
workdir: internal
allow:
  depOnAnyVendor: true
components:
  handler:    { in: modules/*/handler }
  service:    { in: modules/*/service }
  repository: { in: modules/*/repository }
deps:
  handler:
    mayDependOn: [service]
    anyVendorDeps: true
  service:
    mayDependOn: [repository]
    anyVendorDeps: true
  repository:
    anyVendorDeps: true
EOY
cat > internal/modules/notes/service/v1.go <<'EOY'
package service
import _ "example.com/demo/internal/modules/tags/service"
EOY
$AL check --output-color=false 2>&1 | tail -12; rm internal/modules/notes/service/v1.go
cat > internal/modules/notes/handler/v2.go <<'EOY'
package handler
import _ "example.com/demo/internal/modules/notes/repository"
EOY
$AL check --output-color=false 2>&1 | tail -12; rm internal/modules/notes/handler/v2.go
echo "--- same-module handler imports its own service (allowed)? and handler->other module's service"
cat > internal/modules/notes/handler/v6.go <<'EOY'
package handler
import _ "example.com/demo/internal/modules/tags/service"
EOY
$AL check --output-color=false 2>&1 | tail -6; echo "exit $?"; rm internal/modules/notes/handler/v6.go
```

Output:

```
linters:
   On | Base: component imports # always on
  Off | Advanced: vendor imports # switch 'allow.depOnAnyVendor = false' (or delete) to on
   On | Advanced: method calls and dependency injections # switch 'allow.deepScan = true' (or delete) to on
Component service shouldn't depend on example.com/demo/internal/modules/tags/service in <tmp>/exp/demo/internal/modules/notes/service/v1.go:3
--
total notices: 1
linters:
   On | Base: component imports # always on
  Off | Advanced: vendor imports # switch 'allow.depOnAnyVendor = false' (or delete) to on
   On | Advanced: method calls and dependency injections # switch 'allow.deepScan = true' (or delete) to on
Component handler shouldn't depend on example.com/demo/internal/modules/notes/repository in <tmp>/exp/demo/internal/modules/notes/handler/v2.go:3
--
total notices: 1
--- same-module handler imports its own service (allowed)? and handler->other module's service
linters:
   On | Base: component imports # always on
  Off | Advanced: vendor imports # switch 'allow.depOnAnyVendor = false' (or delete) to on
   On | Advanced: method calls and dependency injections # switch 'allow.deepScan = true' (or delete) to on
OK - No warnings found
exit 0
```

## Go's own `internal/` rule: each module keeps its layers under `modules/<m>/internal/`

Script `exp6.sh`:

```bash
#!/bin/bash
# Go's own internal/ rule as the module boundary: each module keeps its layers under modules/<m>/internal/.
set -u
D=$TMPDIR/exp/demo2
rm -rf $D; mkdir -p $D; cd $D
cp ../demo/go.mod ../demo/tools.mod ../demo/tools.sum . 2>/dev/null
for m in notes tags; do
  mkdir -p internal/modules/$m/internal/{handler,service,repository}
  cat > internal/modules/$m/internal/repository/repository.go <<EOF
// Package repository holds the $m data access.
package repository
// Repo stores $m.
type Repo struct{}
EOF
  cat > internal/modules/$m/internal/service/service.go <<EOF
// Package service holds the $m rules.
package service
import "example.com/demo/internal/modules/$m/internal/repository"
// Service holds the rules.
type Service struct{ Repo repository.Repo }
EOF
  cat > internal/modules/$m/$m.go <<EOF
// Package $m is the only door into the $m module: the composition root calls Mount.
package $m
import (
	"net/http"
	"example.com/demo/internal/modules/$m/internal/service"
)
// Mount registers the $m routes.
func Mount(mux *http.ServeMux) { _ = service.Service{}; _ = mux }
EOF
done
mkdir -p cmd/api
cat > cmd/api/main.go <<'EOF'
// Command api starts the demo server.
package main
import (
	"net/http"
	"example.com/demo/internal/modules/notes"
	"example.com/demo/internal/modules/tags"
)
func main() {
	mux := http.NewServeMux()
	notes.Mount(mux)
	tags.Mount(mux)
}
EOF
echo "--- baseline"; go build ./... && echo BUILD-OK
echo "--- X1: tags service imports notes/internal/service"
cat > internal/modules/tags/internal/service/x1.go <<'EOF'
package service
import _ "example.com/demo/internal/modules/notes/internal/service"
EOF
go build ./... ; echo "exit $?"; rm internal/modules/tags/internal/service/x1.go
echo "--- X2: tags service imports the notes facade"
cat > internal/modules/tags/internal/service/x2.go <<'EOF'
package service
import _ "example.com/demo/internal/modules/notes"
EOF
go build ./... ; echo "exit $?"; rm internal/modules/tags/internal/service/x2.go
echo "--- X3: cmd/api imports notes/internal/repository"
cat > cmd/api/x3.go <<'EOF'
package main
import _ "example.com/demo/internal/modules/notes/internal/repository"
EOF
go build ./... ; echo "exit $?"; rm cmd/api/x3.go
```

Output:

```
--- baseline
BUILD-OK
--- X1: tags service imports notes/internal/service
package example.com/demo/internal/modules/tags/internal/service
	internal/modules/tags/internal/service/x1.go:3:8: use of internal package example.com/demo/internal/modules/notes/internal/service not allowed
exit 1
--- X2: tags service imports the notes facade
exit 0
--- X3: cmd/api imports notes/internal/repository
package example.com/demo/cmd/api
	cmd/api/x3.go:3:8: use of internal package example.com/demo/internal/modules/notes/internal/repository not allowed
exit 1
```

## go-arch-lint on that layout, with a component for the module's public door

Script `exp7.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/exp/demo2
AL="go tool -modfile=tools.mod go-arch-lint"
cat > .go-arch-lint.yml <<'EOF'
version: 3
workdir: internal
allow:
  depOnAnyVendor: true
components:
  facade:     { in: modules/* }
  handler:    { in: modules/*/internal/handler }
  service:    { in: modules/*/internal/service }
  repository: { in: modules/*/internal/repository }
deps:
  facade:
    mayDependOn: [handler, service, repository]
    anyVendorDeps: true
  handler:
    mayDependOn: [service]
    anyVendorDeps: true
  service:
    mayDependOn: [repository]
    anyVendorDeps: true
  repository:
    anyVendorDeps: true
EOF
echo "--- baseline"; $AL check --output-color=false 2>&1 | tail -3
echo "--- X2: tags service imports notes facade"
cat > internal/modules/tags/internal/service/x2.go <<'EOF'
package service
import _ "example.com/demo/internal/modules/notes"
EOF
$AL check --output-color=false 2>&1 | grep -i "shouldn\|notice\|OK"; rm internal/modules/tags/internal/service/x2.go
echo "--- V2: handler imports repository"
mkdir -p internal/modules/notes/internal/handler
cat > internal/modules/notes/internal/handler/handler.go <<'EOF'
// Package handler is the HTTP edge.
package handler
EOF
cat > internal/modules/notes/internal/handler/v2.go <<'EOF'
package handler
import _ "example.com/demo/internal/modules/notes/internal/repository"
EOF
$AL check --output-color=false 2>&1 | grep -i "shouldn\|notice\|OK"; rm internal/modules/notes/internal/handler/v2.go
echo "--- the facade imports a handler (allowed)"
cat > internal/modules/notes/internal/handler/handler.go <<'EOF'
// Package handler is the HTTP edge.
package handler
import _ "example.com/demo/internal/modules/notes/internal/service"
EOF
$AL check --output-color=false 2>&1 | grep -i "shouldn\|notice\|OK"
```

Output:

```
--- baseline
   On | Advanced: method calls and dependency injections # switch 'allow.deepScan = true' (or delete) to on
OK - No warnings found
--- X2: tags service imports notes facade
Component service shouldn't depend on example.com/demo/internal/modules/notes in <tmp>/exp/demo2/internal/modules/tags/internal/service/x2.go:3
total notices: 1
--- V2: handler imports repository
Component handler shouldn't depend on example.com/demo/internal/modules/notes/internal/repository in <tmp>/exp/demo2/internal/modules/notes/internal/handler/v2.go:3
total notices: 1
--- the facade imports a handler (allowed)
OK - No warnings found
```

## arch-go on the same layout

Script `exp16.sh`:

```bash
#!/bin/bash
set -u
cd $TMPDIR/exp/demo2
cp go.mod tools-arch.mod; sed -i 's#^module .*#module example.com/demo/toolsarch#' tools-arch.mod
go get -modfile=tools-arch.mod -tool github.com/arch-go/arch-go/v2@v2.1.2 2>&1 | tail -2
cat > arch-go.yml <<'EOF'
version: 1
threshold:
  compliance: 100
  coverage: 0
dependenciesRules:
  - package: "**.internal.handler"
    shouldNotDependsOn:
      internal: ["**.internal.repository"]
  - package: "**.internal.service"
    shouldNotDependsOn:
      internal: ["**.internal.handler"]
EOF
AG="go tool -modfile=tools-arch.mod arch-go"
echo "--- baseline"; $AG 2>&1 | tail -6 | cut -c1-200; echo "exit ${PIPESTATUS[0]}"
mkdir -p internal/modules/notes/internal/handler
cat > internal/modules/notes/internal/handler/handler.go <<'EOF'
// Package handler is the HTTP edge.
package handler
EOF
cat > internal/modules/notes/internal/handler/v2.go <<'EOF'
package handler
import _ "example.com/demo/internal/modules/notes/internal/repository"
EOF
echo "--- V2 handler imports repository"; $AG 2>&1 | tail -8 | cut -c1-200; echo "exit ${PIPESTATUS[0]}"
rm internal/modules/notes/internal/handler/v2.go
```

Output:

```
go: added golang.org/x/tools v0.41.0
go: added gopkg.in/yaml.v3 v3.0.1
--- baseline
Total Rules: 	2
Succeeded: 	2
Failed: 	0
--------------------------------------
Compliance:      100% (PASS)
Coverage:         37% (PASS)
exit 0
--- V2 handler imports repository
	Execution Summary
--------------------------------------
Total Rules: 	2
Succeeded: 	1
Failed: 	1
--------------------------------------
Compliance:       50% (FAIL)
Coverage:         37% (PASS)
exit 1
```

## One modfile per tool: sizes, and that `go.mod` stays untouched

Script `exp17.sh`:

```bash
#!/bin/bash
# One modfile per tool: size of each, and that go tool runs from it.
set -u
D=$TMPDIR/exp/pertool; rm -rf $D; mkdir -p $D/tools; cd $D
printf 'module example.com/pertool\n\ngo 1.26\n' > go.mod
for spec in "golangci-lint github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0" "go-arch-lint github.com/fe3dback/go-arch-lint@v1.19.2" "arch-go github.com/arch-go/arch-go/v2@v2.1.2" "oapi-codegen github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.9.0"; do
  name=${spec%% *}; pkg=${spec#* }
  printf 'module example.com/pertool/tools/%s\n\ngo 1.26\n' $name > tools/$name.mod
  go get -modfile=tools/$name.mod -tool $pkg > /dev/null 2>&1
  echo "$name: $(wc -l < tools/$name.mod) lines in tools/$name.mod, $(wc -l < tools/$name.sum) in .sum, indirect: $(grep -c indirect tools/$name.mod)"
done
ls tools
go tool -modfile=tools/oapi-codegen.mod oapi-codegen -version 2>&1 | tail -2
echo "go.mod untouched:"; cat go.mod
```

Output:

```
golangci-lint: 219 lines in tools/golangci-lint.mod, 926 in .sum, indirect: 211
go-arch-lint: 49 lines in tools/go-arch-lint.mod, 219 in .sum, indirect: 41
arch-go: 35 lines in tools/arch-go.mod, 62 in .sum, indirect: 27
oapi-codegen: 20 lines in tools/oapi-codegen.mod, 24 in .sum, indirect: 12
arch-go.mod
arch-go.sum
go-arch-lint.mod
go-arch-lint.sum
golangci-lint.mod
golangci-lint.sum
oapi-codegen.mod
oapi-codegen.sum
github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen
v2.9.0
go.mod untouched:
module example.com/pertool
go 1.26
```

## The picked lint on the picked layout: go vet, golangci-lint (depguard, funlen, nolintlint) and go-arch-lint, one after the other

Script `exp24.sh`:

```bash
#!/bin/bash
# The picked lint on the picked layout: golangci-lint (depguard, funlen, nolintlint), go-arch-lint, go vet, one after the other.
set -u
cd $TMPDIR/exp/demo2
GL="go tool -modfile=tools.mod golangci-lint"
AL="go tool -modfile=tools.mod go-arch-lint"
# the layout from the earlier step, with a handler package that calls its service
cat > internal/modules/notes/internal/handler/handler.go <<'EOF'
// Package handler is the HTTP edge of the notes module.
package handler
import "example.com/demo/internal/modules/notes/internal/service"
// Handler serves notes.
type Handler struct{ Svc service.Service }
EOF
cat > .golangci.yml <<'EOF'
version: "2"
linters:
  default: standard
  enable: [depguard, funlen, nolintlint]
  settings:
    funlen: {lines: 60, statements: 40}
    nolintlint: {require-explanation: true, require-specific: true}
    depguard:
      rules:
        service-knows-no-http:
          files: ["**/internal/modules/*/internal/service/**"]
          deny:
            - pkg: net/http
              desc: a service holds rules, not HTTP
EOF
all() {
  echo "go vet:        $(go vet ./... 2>&1 | head -2 | tr '\n' ' ') exit ${PIPESTATUS[0]}"
  $GL run ./... 2>&1 | head -4 | cut -c1-200; echo "golangci-lint: exit ${PIPESTATUS[0]}"
  $AL check --output-color=false 2>&1 | grep -i "shouldn\|notice\|OK -" | head -3 | cut -c1-200; echo "go-arch-lint:  exit ${PIPESTATUS[0]}"
}
echo "=== baseline"; all
echo "=== service imports net/http"
cat > internal/modules/tags/internal/service/bad.go <<'EOF'
package service
import _ "net/http"
EOF
all; rm internal/modules/tags/internal/service/bad.go
echo "=== a nolint comment with no reason"
cat > internal/modules/tags/internal/service/nolint.go <<'EOF'
package service
import "os"
func Leak() { os.Setenv("A", "b") } //nolint:errcheck
EOF
$GL run ./... 2>&1 | head -4 | cut -c1-200; echo "golangci-lint: exit ${PIPESTATUS[0]}"; rm internal/modules/tags/internal/service/nolint.go
echo "=== a handler imports a repository (go-arch-lint)"
cat > internal/modules/notes/internal/handler/bad.go <<'EOF'
package handler
import _ "example.com/demo/internal/modules/notes/internal/repository"
EOF
all; rm internal/modules/notes/internal/handler/bad.go
```

Output:

```
=== baseline
go vet:         exit 0
0 issues.
golangci-lint: exit 0
OK - No warnings found
go-arch-lint:  exit 0
=== service imports net/http
go vet:         exit 0
internal/modules/tags/internal/service/bad.go:3:8: import 'net/http' is not allowed from list 'service-knows-no-http': a service holds rules, not HTTP (depguard)
import _ "net/http"
       ^
1 issues:
golangci-lint: exit 1
OK - No warnings found
go-arch-lint:  exit 0
=== a nolint comment with no reason
internal/modules/tags/internal/service/nolint.go:5:37: directive `//nolint:errcheck` should provide explanation such as `//nolint:errcheck // this is why` (nolintlint)
func Leak() { os.Setenv("A", "b") } //nolint:errcheck
                                    ^
1 issues:
golangci-lint: exit 1
=== a handler imports a repository (go-arch-lint)
go vet:         exit 0
0 issues.
golangci-lint: exit 0
Component handler shouldn't depend on example.com/demo/internal/modules/notes/internal/repository in <tmp>/exp/demo2/internal/modules/notes/internal/handler/bad.go:3
total notices: 1
go-arch-lint:  exit 1
```

## Which Go check files the agent-file guard treats as check code today

Script `guard.mjs`:

```js
// Which Go check files does the agent-file guard treat as check code today?
const { CHECK_FILES } = await import(`${process.argv[2]}/.agents/skills/coordinate/scripts/agent-files.mjs`);
const paths = [".golangci.yml", ".golangci.yaml", ".go-arch-lint.yml", "Makefile", "Taskfile.yml", "tools/golangci-lint.mod", "tools.mod",
  "package.json", "api/cfg.yaml", "api/openapi.yaml", "scripts/check-boundaries.mjs", "scripts/check-file-size.mjs", "scripts/gen-check.mjs", "scripts/gen.mjs", "eslint.config.js", "tsconfig.json", "playwright.config.ts", "go.mod"];
for (const p of paths) console.log(CHECK_FILES.test(p) ? "check code " : "not covered", p);
```

Output:

```
not covered .golangci.yml
not covered .golangci.yaml
not covered .go-arch-lint.yml
not covered Makefile
not covered Taskfile.yml
not covered tools/golangci-lint.mod
not covered tools.mod
not covered package.json
not covered api/cfg.yaml
not covered api/openapi.yaml
check code  scripts/check-boundaries.mjs
check code  scripts/check-file-size.mjs
not covered scripts/gen-check.mjs
not covered scripts/gen.mjs
check code  eslint.config.js
check code  tsconfig.json
check code  playwright.config.ts
not covered go.mod
```
