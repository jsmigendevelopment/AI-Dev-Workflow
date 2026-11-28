# Experiment: Routers and end-to-end candidates

Run on 2026-11-28 on Linux x86-64 with Node 22.23.5. Go 1.24.7 was installed; its toolchain switch (GOTOOLCHAIN=auto) fetched 1.26.x for the tools that need it. Four routers with the same two routes, and three ways to run `test:e2e` against the built Go binary.

Paths are shortened to `<tmp>`. A step's output is cut when it is long, and the cut says how many lines are missing.

## ServeMux, chi, echo v4 and echo v5: binary size, third-party packages, wrong method, unknown path

Script `exp15.sh`:

```bash
#!/bin/bash
# Router comparison: same two routes on ServeMux, chi and echo. Size, dependencies, behaviour on a wrong method.
set -u
R=$TMPDIR/exp/routers
rm -rf $R; mkdir -p $R/mux $R/chi $R/echo $R/echo5; cd $R
cat > mux/main.go <<'EOF'
package main
import (
	"fmt"
	"log"
	"net/http"
)
func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /notes/{id}", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, r.PathValue("id")) })
	mux.HandleFunc("POST /notes", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(201) })
	log.Fatal(http.ListenAndServe(":8091", mux))
}
EOF
cat > chi/main.go <<'EOF'
package main
import (
	"fmt"
	"log"
	"net/http"
	"github.com/go-chi/chi/v5"
)
func main() {
	r := chi.NewRouter()
	r.Get("/notes/{id}", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, chi.URLParam(r, "id")) })
	r.Post("/notes", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(201) })
	log.Fatal(http.ListenAndServe(":8092", r))
}
EOF
cat > echo/main.go <<'EOF'
package main
import (
	"net/http"
	"github.com/labstack/echo/v4"
)
func main() {
	e := echo.New()
	e.GET("/notes/:id", func(c echo.Context) error { return c.String(200, c.Param("id")) })
	e.POST("/notes", func(c echo.Context) error { return c.NoContent(201) })
	_ = http.StatusOK
	e.Logger.Fatal(e.Start(":8093"))
}
EOF
cat > echo5/main.go <<'EOF'
package main
import (
	"log"
	"github.com/labstack/echo/v5"
)
func main() {
	e := echo.New()
	e.GET("/notes/:id", func(c *echo.Context) error { return c.String(200, c.Param("id")) })
	e.POST("/notes", func(c *echo.Context) error { return c.NoContent(201) })
	log.Fatal(e.Start(":8094"))
}
EOF
cat > go.mod <<'EOF'
module example.com/routers
go 1.26
EOF
go get github.com/go-chi/chi/v5@v5.5.0 github.com/labstack/echo/v4@v4.16.6 github.com/labstack/echo/v5@v5.4.7 2>&1 | tail -3
go mod tidy 2>&1 | tail -2
for n in mux chi echo echo5; do
  go build -trimpath -ldflags="-s -w" -o $TMPDIR/r-$n ./$n || continue
  size=$(stat -c %s $TMPDIR/r-$n)
  deps=$(go list -deps ./$n | grep -c '\.' )
  third=$(go list -deps -f '{{if not .Standard}}{{.ImportPath}}{{end}}' ./$n | grep -v "^example.com" | wc -l)
  echo "$n: binary $size bytes, third-party packages $third"
done
echo "--- behaviour"
port=8091
for n in mux chi echo echo5; do
  case $n in mux) p=8091;; chi) p=8092;; echo) p=8093;; echo5) p=8094;; esac
  $TMPDIR/r-$n > /dev/null 2>&1 &
  PID=$!
  sleep 0.7
  echo "[$n] GET /notes/7: $(curl -s -w ' -> %{http_code}' localhost:$p/notes/7)"
  echo "[$n] DELETE /notes/7 (wrong method): $(curl -s -i -X DELETE localhost:$p/notes/7 | tr -d '\r' | grep -i '^HTTP\|^allow' | tr '\n' ' ')"
  echo "[$n] GET /nope: $(curl -s -w ' -> %{http_code}' localhost:$p/nope | head -c 80)"
  kill $PID; wait $PID 2>/dev/null
done
```

Output:

```
go: added golang.org/x/net v0.60.0
go: added golang.org/x/sys v0.48.0
go: added golang.org/x/text v0.42.0
mux: binary 5812489 bytes, third-party packages 0
chi: binary 6070537 bytes, third-party packages 1
echo: binary 6394121 bytes, third-party packages 21
echo5: binary 6422793 bytes, third-party packages 1
--- behaviour
[mux] GET /notes/7: 7 -> 200
[mux] DELETE /notes/7 (wrong method): HTTP/1.1 405 Method Not Allowed Allow: GET, HEAD
[mux] GET /nope: 404 page not found
 -> 404
[chi] GET /notes/7: 7 -> 200
[chi] DELETE /notes/7 (wrong method): HTTP/1.1 405 Method Not Allowed Allow: GET
[chi] GET /nope: 404 page not found
 -> 404
[echo] GET /notes/7: 7 -> 200
[echo] DELETE /notes/7 (wrong method): HTTP/1.1 405 Method Not Allowed Allow: OPTIONS, GET
[echo] GET /nope: {"message":"Not Found"}
 -> 404
[echo5] GET /notes/7: 7 -> 200
[echo5] DELETE /notes/7 (wrong method): HTTP/1.1 405 Method Not Allowed Allow: OPTIONS, GET
[echo5] GET /nope: {"message":"Not Found"}
 -> 404
```

## go test -race, a Go black-box test of the built binary, Playwright API testing against it

Script `exp22.sh`:

```bash
#!/bin/bash
# test:e2e candidates against the built Go binary: Playwright API testing, and a plain Go test. Plus go test -race.
set -u
cd $TMPDIR/exp/code
echo "=== go test -race (one unit test)"
mkdir -p internal/api
cat > internal/api/api_test.go <<'EOF'
package api_test
import (
	"net/http"
	"net/http/httptest"
	"testing"
	"github.com/danielgtaylor/huma/v2/humatest"
	"example.com/code/internal/api"
)
func TestListNotes(t *testing.T) {
	_, a := humatest.New(t)
	api.Register(a)
	resp := a.Get("/api/v1/notes")
	if resp.Code != http.StatusOK {
		t.Fatalf("status %d", resp.Code)
	}
	_ = httptest.NewRecorder
}
EOF
( time go test -race ./internal/... ) 2>&1 | tail -6
echo "=== Go black-box e2e against the built binary"
mkdir -p e2e
cat > e2e/e2e_test.go <<'EOF'
//go:build e2e
package e2e
import (
	"net/http"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)
func TestBuiltBinary(t *testing.T) {
	cmd := exec.Command(os.Getenv("API_BIN"))
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill() })
	var resp *http.Response
	var err error
	for i := 0; i < 50; i++ {
		resp, err = http.Get("http://localhost:8082/api/v1/notes")
		if err == nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 || !strings.Contains(resp.Header.Get("Content-Type"), "json") {
		t.Fatalf("status %d type %s", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
}
EOF
go build -o $TMPDIR/code-api ./cmd/api
( time API_BIN=$TMPDIR/code-api go test -tags e2e ./e2e/... ) 2>&1 | tail -5
echo "=== Playwright API testing against the same binary (no browser)"
rm -rf $TMPDIR/pw; mkdir -p $TMPDIR/pw/e2e; cd $TMPDIR/pw
echo '{ "name": "pw", "private": true, "type": "module" }' > package.json
npm install --save-dev --no-audit --no-fund @playwright/test@1.65.1 2>&1 | tail -1
cat > playwright.config.ts <<EOF
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  webServer: { command: "$TMPDIR/code-api", url: "http://localhost:8082/api/v1/notes", reuseExistingServer: false },
  use: { baseURL: "http://localhost:8082" },
});
EOF
cat > e2e/api.spec.ts <<'EOF'
import { expect, test } from "@playwright/test";
test("AC-1: WHEN the list is read THEN it answers 200 with items", async ({ request }) => {
  const res = await request.get("/api/v1/notes");
  expect(res.status()).toBe(200);
  expect((await res.json()).items.length).toBeGreaterThan(0);
});
EOF
( time ./node_modules/.bin/playwright test 2>&1 | tail -5 ) 2>&1 | tail -9
```

Output:

```
=== go test -race (one unit test)
ok  	example.com/code/internal/api	(cached)
real	0m0.194s
user	0m0.107s
sys	0m0.063s
=== Go black-box e2e against the built binary
ok  	example.com/code/e2e	(cached)
real	0m0.167s
user	0m0.113s
sys	0m0.057s
=== Playwright API testing against the same binary (no browser)
added 3 packages in 765ms
Running 1 test using 1 worker
  ✓  1 e2e/api.spec.ts:3:1 › AC-1: WHEN the list is read THEN it answers 200 with items (37ms)
  1 passed (546ms)
real	0m0.991s
user	0m0.782s
sys	0m0.130s
```
