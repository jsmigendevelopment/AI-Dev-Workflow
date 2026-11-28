// Preflight looks at a Go toolchain and the module proxy when the repo has a go.mod (#538). The rows run against a fake
// session or a fake `go` on PATH, never the real go or the network. A folder with no go.mod prints the table it always did.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, main, probe, render } from "../src/preflight.mjs";
import { ladder } from "../src/preflight-output.mjs";
import { logger, put } from "./helpers.mjs";
import { fakeSys, HEALTHY, project, runScript, status, temp } from "./preflight-fakes.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const posixOnly = { skip: process.platform === "win32" ? "the fake go is a POSIX shell script" : false };
const row = (report, id) => report.results.find((r) => r.id === id);
const MOD = (go) => `module example.com/app\n\ngo ${go}\n`;
const GO_OK = { "go version": { ok: true, out: "go version go1.26.11 linux/amd64" }, "go list": { ok: true, out: "golang.org/x/sync v0.1.0 v0.2.0" } };
const REFUSED = { ok: false, out: "go: golang.org/x/sync: reading https://proxy.golang.org/golang.org/x/sync/@v/list: 403 Forbidden" };

// A fake go that logs the GOTOOLCHAIN it was given and each call, answers `version`, and refuses `list` when a file named
// "refuse" sits beside it (the fake proxy saying no).
function fakeGo(version = "1.26.11") {
  const bin = temp("onrails-go-bin-");
  put(bin, "go", `#!/bin/sh\nhere="\${0%/*}"\necho "toolchain=$GOTOOLCHAIN $*" >> "$here/go-calls"\ncase "$1" in\n`
    + `  version) echo "go version go${version} linux/amd64";;\n`
    + `  list) if [ -f "$here/refuse" ]; then echo "reading https://proxy.golang.org/x: 403 Forbidden" >&2; exit 1; fi; echo "golang.org/x/sync v0.1.0";;\n`
    + `  env) echo "https://proxy.golang.org,direct";;\nesac\n`);
  chmodSync(join(bin, "go"), 0o755);
  return { bin, calls: () => (existsSync(join(bin, "go-calls")) ? readFileSync(join(bin, "go-calls"), "utf8").trim().split("\n") : []) };
}

test("AC-538-1: WHEN preflight runs in a folder with a go.mod and a fake go on PATH THEN the table has a Go row against go.mod's go line and a module-proxy row", posixOnly, () => {
  const go = fakeGo("1.26.11");
  const report = runScript(project({ "go.mod": MOD("1.26.10") }), go.bin, "--json");
  const ids = report.results.map((r) => r.id);
  assert.deepEqual(ids, ["repo", "git", "registry", "github", "loopback", "browser", "versions", "go", "goproxy", "model"]);
  assert.equal(row(report, "go").label, "Go toolchain");
  assert.equal(row(report, "go").status, "ok");
  assert.match(row(report, "go").detail, /Go 1\.26\.11 \(go\.mod needs 1\.26\.10\)/);
  assert.equal(row(report, "goproxy").label, "Go module proxy");
  assert.equal(row(report, "goproxy").status, "ok");
  assert.match(row(report, "goproxy").detail, /proxy\.golang\.org answered/);
  // Never let go fetch a toolchain: every call runs with GOTOOLCHAIN=local.
  assert.ok(go.calls().length >= 2 && go.calls().every((c) => c.startsWith("toolchain=local ")), go.calls().join("\n"));
});

test("AC-538-1: the table prints both rows in order, after the Node row and before the model row", async () => {
  const dir = project({ "go.mod": MOD("1.26.10"), "package.json": "{}" });
  const log = logger();
  await main([dir], { sys: fakeSys({ answers: { ...HEALTHY, ...GO_OK } }), log });
  const labels = [...log.text().matchAll(/^\| ([^|]+?) \| [✓✗–] \|/gm)].map((m) => m[1]);
  assert.deepEqual(labels.slice(labels.indexOf("Node and package manager")), ["Node and package manager", "Go toolchain", "Go module proxy", "Model and effort"]);
});

test("AC-538-1: a Go older than go.mod's go line blocks the row, with the install ladder, and the proxy row waits", async () => {
  const dir = project({ "go.mod": MOD("1.26.10") });
  const report = await probe(dir, fakeSys({ answers: { ...HEALTHY, "go version": { ok: true, out: "go version go1.24.7 linux/amd64" } } }));
  assert.equal(status(report, "go"), "blocked");
  assert.match(row(report, "go").detail, /Go 1\.24\.7, go\.mod needs 1\.26\.10/);
  assert.match(row(report, "go").ladder.at(-1).text, /Install Go 1\.26\.10 or newer \(https:\/\/go\.dev\/dl\/\)/);
  assert.equal(status(report, "goproxy"), "limited");
  assert.equal(report.ok, false);
});

test("AC-538-1: go.mod's go line is read in its plain forms, and anything else is never printed", async () => {
  const detail = async (text) => row(await probe(project({ "go.mod": text }), fakeSys({ answers: { ...HEALTHY, ...GO_OK } })), "go").detail;
  assert.match(await detail("module x\n\ngo 1.21 // keep\n"), /go\.mod needs 1\.21\)/);
  assert.match(await detail("module x\r\n\r\ngo 1.26rc1\r\n"), /go\.mod needs 1\.26\)/);
  assert.match(await detail("module x\n"), /go\.mod has no go line/);
  assert.match(await detail("module x\ngo $(curl evil)\n"), /go\.mod has no go line/);
  assert.doesNotMatch(await detail("module x\ngo 1.26.10\ntoolchain go9.9.9\n"), /9\.9\.9/);
});

test("AC-538-2: WHEN the fake proxy refuses THEN the proxy row is blocked, its ladder names a project-local GOMODCACHE and a mirror, installs are blocked, and the exit code is 1", async () => {
  const dir = project({ "go.mod": MOD("1.26.10") });
  const sys = fakeSys({ answers: { ...HEALTHY, ...GO_OK, "go list": REFUSED }, env: { CODEX_SANDBOX: "seatbelt" } });
  const log = logger();
  assert.equal(await main([dir], { sys, log }), 1);
  const text = log.text();
  assert.match(text, /^\| Go module proxy \| ✗ \| proxy\.golang\.org didn't answer/m);
  assert.match(text, /^\| Go toolchain \| ✓ \|/m);
  assert.match(text, /Installs are blocked: don't scaffold or build/);
  const steps = text.slice(text.indexOf("\nGo module proxy\n"));
  assert.match(steps, /1\. In the sandbox: .*GOMODCACHE=.*\.gomodcache/);
  assert.match(steps, /1\. In the sandbox: .*mirror.*GOPROXY=/);
  assert.match(steps, /Trust this project so `\.codex\/config\.toml` loads/);
  assert.equal(text.match(/^Setup step for you · /gm).length, 1);
  assert.match(text.slice(text.indexOf("Setup step for you · ")), /^1\. Go module proxy: /m);
});

test("AC-538-2: the ladder gives each tool its own last rung, and Windows its PowerShell form", () => {
  const blocked = (tool, platform) => render({ tool, checkedAt: "now", read: true, results: [{ id: "goproxy", label: "Go module proxy", status: "blocked",
    detail: "x", ladder: ladder("goproxy", tool, { host: "proxy.golang.org", platform }) }] });
  assert.match(blocked("claude-cloud"), /Allow proxy\.golang\.org in the cloud environment's network settings/);
  assert.match(blocked("claude"), /Allow network access to proxy\.golang\.org for this project, or run `go mod download` in your own terminal/);
  assert.match(blocked("claude", "win32"), /\$env:GOMODCACHE=/);
  assert.doesNotMatch(blocked("claude", "linux"), /\$env:GOMODCACHE/);
});

test("AC-538-2: a fake go that refuses the list gives the same blocked row and exit 1 when run for real", posixOnly, () => {
  const go = fakeGo();
  put(go.bin, "refuse", "");
  const r = runScript(project({ "go.mod": MOD("1.26.10") }), go.bin);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^\| Go module proxy \| ✗ \| proxy\.golang\.org didn't answer/m);
  assert.match(r.stdout, /Installs are blocked: don't scaffold or build/);
  assert.match(r.stdout, /GOMODCACHE/);
});

test("AC-538-2: the proxy host in the row is the one go says it uses, and only when it is a plain host", async () => {
  const dir = project({ "go.mod": MOD("1.26.10") });
  const run = async (out) => row(await probe(dir, fakeSys({ answers: { ...HEALTHY, ...GO_OK, "go list": REFUSED, "go env GOPROXY": { ok: true, out } } })), "goproxy").detail;
  assert.match(await run("https://goproxy.example.test,direct"), /^goproxy\.example\.test didn't answer/);
  assert.match(await run("https://user:token@goproxy.example.test"), /^proxy\.golang\.org didn't answer/);
  assert.match(await run("file:///srv/proxy"), /^proxy\.golang\.org didn't answer/);
});

test("AC-538-3: WHEN the folder has no go.mod THEN the rows are the eight checks, and no go command runs", async () => {
  const dir = project({ "package.json": "{}" });
  const sys = fakeSys({ answers: HEALTHY });
  const report = await probe(dir, sys);
  assert.deepEqual(report.results.map((r) => r.id), CHECKS);
  assert.equal(CHECKS.length, 8);
  assert.equal(sys.calls.some((c) => c.startsWith("go ")), false);
  assert.doesNotMatch(render(report), /Go toolchain|Go module proxy/);
  assert.equal(report.ok, true);
});

test("AC-538-3: a go.mod only moves the fingerprint, so --if-changed probes again when one appears", async () => {
  const dir = project({ "package.json": "{}" });
  const before = (await probe(dir, fakeSys({ answers: HEALTHY }))).fingerprint;
  put(dir, "go.mod", MOD("1.26.10"));
  const after = (await probe(dir, fakeSys({ answers: HEALTHY }))).fingerprint;
  assert.notEqual(before, after);
  put(dir, "go.mod", MOD("1.26.11"));
  assert.notEqual((await probe(dir, fakeSys({ answers: HEALTHY }))).fingerprint, after);
});

test("AC-538-1: go missing from the session blocks the Go row, and the proxy row waits for it", async () => {
  const dir = project({ "go.mod": MOD("1.26.10") });
  const report = await probe(dir, fakeSys({ answers: HEALTHY, missing: ["go"] }));
  assert.equal(status(report, "go"), "blocked");
  assert.equal(row(report, "go").detail, "go isn't installed");
  assert.equal(status(report, "goproxy"), "limited");
  assert.equal(report.ok, false);
});

test("AC-538-5: the kit's copies of the preflight files match their masters", () => {
  for (const file of ["preflight.mjs", "preflight-versions.mjs", "preflight-output.mjs"]) {
    const master = read(`scripts/${file}`);
    assert.equal(read(`.agents/skills/ask/scripts/${file}`), master, `ask skill: ${file}`);
    assert.equal(read(`cli/src/${file}`), master, `cli: ${file}`);
  }
});
