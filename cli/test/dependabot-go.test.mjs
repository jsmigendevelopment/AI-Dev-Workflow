// Tests for Go modules in Dependabot's bumps through own-branch.mjs (#531, #581): the same gate as the npm bumps in
// dependabot-bump.test.mjs, with go.mod and go.sum for the manifest and the lockfile. A fake gh answers the API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unixOnly } from "./helpers.mjs";
import { BOT, BUMPED, HEAD, MERGE_BASE, ONLY, REPO, at, bump, changed, commit, pullOf, read, refused } from "./dependabot-helpers.mjs";

// Go modules (#531): the same gate, with go.mod and go.sum for the manifest and the lockfile.
const GO_BRANCH = "dependabot/go_modules/github.com/acme/lib-1.3.0";
/** A go.sum hash as Go writes it: "h1:" and the base64 of a 32-byte digest (44 characters, one "="). */
const h1 = (seed) => `h1:${Buffer.alloc(32, seed).toString("base64")}`;
/** go.sum's two lines for one module version, the way `go mod tidy` writes them. */
const sums = (mod, version) => `${mod} ${version} ${h1(`${mod}${version}`)}\n${mod} ${version}/go.mod ${h1(`${mod}${version}/go.mod`)}\n`;
// Lines: 1 module, 3 go, 5 require (, 6 lib, 7 text, 8 ), 10 the single require; a text appended starts at line 11.
const GO_MOD = (lib, text, single) => `module example.com/app

go 1.24.7

require (
\tgithub.com/acme/lib ${lib}
\tgolang.org/x/text ${text} // indirect
)

require github.com/other/single ${single}
`;
const MOD_OLD = GO_MOD("v1.2.0", "v0.20.0", "v0.4.1");
const MOD_NEW = GO_MOD("v1.3.0", "v0.21.0", "v0.4.2");
const GO_SUM = (lib, text, single) => sums("github.com/acme/lib", lib) + sums("github.com/other/single", single) + sums("golang.org/x/text", text);
const SUM_OLD = GO_SUM("v1.2.0", "v0.20.0", "v0.4.1");
const SUM_NEW = GO_SUM("v1.3.0", "v0.21.0", "v0.4.2");
const swap = (text, from, to) => {
  assert.ok(text.includes(from), `the fixture has ${JSON.stringify(from)}`);
  return text.replace(from, to);
};
const naming = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"));

/**
 * own-branch.mjs on Dependabot's pull request 7 for a Go app: go.mod and go.sum under `dir`, in one verified commit.
 * `mod` and `sum` are their texts at the head, `base` the go.mod at the merge base; the rest is bump()'s.
 */
function goBump({ mod = MOD_NEW, sum = SUM_NEW, base = MOD_OLD, dir = "", files = changed(`${dir}go.mod`, `${dir}go.sum`), pull = {}, ...more } = {}) {
  return bump({
    files, pull: { ref: GO_BRANCH, ...pull }, ...more,
    before: { [`${dir}go.mod`]: base, [`${dir}go.sum`]: SUM_OLD },
    after: { [`${dir}go.mod`]: mod, [`${dir}go.sum`]: sum },
  });
}

/** Each case exits 1 with no sha and names its line: `[more, text]`, where text is what stderr must show. */
function refusedGo(cases) {
  for (const [name, [more, text]] of Object.entries(cases)) {
    const r = goBump(more);
    assert.equal(r.status, 1, `${name}: ${r.stderr}`);
    assert.equal(r.stdout, "", name);
    assert.match(r.stderr, ONLY, name);
    assert.match(r.stderr, text instanceof RegExp ? text : naming(text), name);
  }
}

test("AC-531-1: WHEN a Dependabot pull request only bumps versions of existing require lines in go.mod and the matching go.sum lines THEN own-branch.mjs exits 0 for it", unixOnly, () => {
  const r = goBump();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${HEAD}: ${GO_BRANCH} is a Dependabot bump of dependency versions only\n`);
  assert.doesNotMatch(r.calls, /issues\/|collaborators\//, "no claim and no access check for the bot");
  assert.match(r.calls, new RegExp(`contents/go\\.mod\\?ref=${MERGE_BASE}`), "go.mod is read at the merge base");
  assert.match(r.calls, new RegExp(`contents/go\\.sum\\?ref=${HEAD}`), "go.sum is read at the head");
  // None of these paths is bumped below: a replace or exclude of a bumped path is refused (AC-581-1).
  const kept = "\nreplace github.com/acme/unused v1.0.0 => ../unused\n\nexclude github.com/acme/unused v1.2.5\n\nretract v0.1.0 // broken\n\nreplace (\n\tgolang.org/x/sys v0.1.0 => ../sys\n)\n";
  const single = (a, b, c) => `module example.com/app\n\ngo 1.24.7\n\nrequire github.com/acme/lib ${a}\nrequire golang.org/x/text ${b} // indirect\nrequire github.com/other/single ${c}\n`;
  const cases = {
    "one require of three": { mod: swap(MOD_OLD, "lib v1.2.0", "lib v1.3.0"), sum: sums("github.com/acme/lib", "v1.3.0") + SUM_OLD.split("\n").slice(2).join("\n") },
    "a pseudo-version and a +incompatible version": { mod: swap(swap(MOD_OLD, "lib v1.2.0", "lib v0.0.0-20241101120000-0123456789ab"), "single v0.4.1", "single v2.0.1+incompatible") },
    "a prerelease": { mod: swap(MOD_OLD, "single v0.4.1", "single v0.5.0-rc.1") },
    "go.mod alone": { mod: MOD_NEW, files: changed("go.mod"), sum: SUM_OLD },
    "go.sum alone, with the old lines kept": { mod: MOD_OLD, files: changed("go.sum"), sum: SUM_OLD + sums("github.com/acme/lib", "v1.3.0") },
    "single-line requires": { base: single("v1.2.0", "v0.20.0", "v0.4.1"), mod: single("v1.3.0", "v0.21.0", "v0.4.2") },
    "a require moved between blocks": { mod: swap(swap(MOD_NEW, "\nrequire github.com/other/single v0.4.2\n", ""), "\tgolang.org/x/text v0.21.0 // indirect\n", "\tgolang.org/x/text v0.21.0 // indirect\n\tgithub.com/other/single v0.4.2\n") },
    "a go.mod hash for a module go.mod doesn't require, and a new go.sum module": { sum: SUM_NEW + sums("golang.org/x/net", "v0.30.0") + `golang.org/x/sys v0.1.0/go.mod ${h1("sys")}\n` },
    "a service in a subfolder": { dir: "services/api/" },
    "a replace, exclude and retract the merge base already had": { base: MOD_OLD + kept, mod: MOD_NEW + kept },
    "go.sum in another order": { sum: `${SUM_NEW.trimEnd().split("\n").reverse().join("\n")}\n` },
    "a hash with a plus and a slash": { sum: `${SUM_NEW}github.com/acme/lib v1.3.1 h1:${"ab/+".repeat(10)}abc=\n` },
  };
  for (const [name, more] of Object.entries(cases)) {
    const run = goBump(more);
    assert.equal(run.status, 0, `${name}: ${run.stderr}`);
  }
});

test("AC-531-2: WHEN a bump adds a replace, exclude, retract or other directive, or changes the go, toolchain or module line THEN own-branch.mjs exits 1 and names the line", unixOnly, () => {
  const add = (text) => ({ mod: MOD_NEW + text });
  const withToolchain = swap(MOD_OLD, "go 1.24.7\n", "go 1.24.7\n\ntoolchain go1.24.9\n");
  refusedGo({
    "a replace line": [add("replace github.com/acme/lib => ../lib\n"), /go\.mod line 11\b.*replace github\.com\/acme\/lib => \.\.\/lib/],
    "a replace block": [add("replace (\n\tgithub.com/acme/lib v1.3.0 => github.com/evil/lib v1.3.0\n)\n"), /line 12\b.*replace github\.com\/acme\/lib v1\.3\.0 => github\.com\/evil\/lib v1\.3\.0/],
    "an exclude line": [add("exclude github.com/acme/lib v1.2.5\n"), /line 11\b.*exclude github\.com\/acme\/lib v1\.2\.5/],
    "an exclude block": [add("exclude (\n\tgithub.com/acme/lib v1.2.5\n)\n"), /line 12\b.*exclude github\.com\/acme\/lib v1\.2\.5/],
    "a retract line": [add("retract v1.0.0\n"), /line 11\b.*retract v1\.0\.0/],
    "a retract range": [add("retract [v1.0.0, v1.0.5] // oops\n"), /line 11\b.*retract \[v1\.0\.0, v1\.0\.5\]/],
    "a retract block": [add("retract (\n\tv1.0.0\n)\n"), /line 12\b.*retract v1\.0\.0/],
    "a go line": [{ mod: swap(MOD_NEW, "go 1.24.7", "go 1.25.0") }, /line 3\b.*go 1\.25\.0/],
    "a toolchain line added": [{ mod: swap(MOD_NEW, "go 1.24.7\n", "go 1.24.7\n\ntoolchain go1.25.1\n") }, /line 5\b.*toolchain go1\.25\.1/],
    "a toolchain line changed": [{ base: withToolchain, mod: swap(MOD_NEW, "go 1.24.7\n", "go 1.24.7\n\ntoolchain go1.25.1\n") }, /toolchain go1\.25\.1/],
    "a toolchain line dropped": [{ base: withToolchain, mod: MOD_NEW }, /toolchain go1\.24\.9/],
    "the module line": [{ mod: swap(MOD_NEW, "module example.com/app", "module example.com/other") }, /line 1\b.*module example\.com\/other/],
    "a godebug line": [add("godebug default=go1.21\n"), /line 11\b.*godebug default=go1\.21/],
    "a tool line": [add("tool github.com/acme/gen\n"), /line 11\b.*tool github\.com\/acme\/gen/],
    "an ignore line": [add("ignore ./generated\n"), /line 11\b.*ignore \.\/generated/],
    "a changed replace the merge base had": [{ base: `${MOD_OLD}replace github.com/acme/lib v1.0.0 => ../lib\n`, mod: `${MOD_NEW}replace github.com/acme/lib v1.0.0 => ../other\n` }, /replace github\.com\/acme\/lib v1\.0\.0 => \.\.\/other/],
    "an honest bump with a replace beside it": [add("replace golang.org/x/text => golang.org/x/text v0.1.0\n"), /replace golang\.org\/x\/text => golang\.org\/x\/text v0\.1\.0/],
  });
});

test("AC-531-2: WHEN a bump adds, removes or renames a require, or changes its comment THEN own-branch.mjs exits 1 and names the line", unixOnly, () => {
  refusedGo({
    "a new path in the block": [{ mod: swap(MOD_NEW, "\tgolang.org/x/text", "\tgolang.org/x/net v0.30.0 // indirect\n\tgolang.org/x/text") }, /line 7\b.*golang\.org\/x\/net/],
    "a new single require": [{ mod: `${MOD_NEW}require golang.org/x/net v0.30.0\n` }, /line 11\b.*golang\.org\/x\/net/],
    "a new block": [{ mod: `${MOD_NEW}require (\n\tgolang.org/x/net v0.30.0\n)\n` }, /line 12\b.*golang\.org\/x\/net/],
    "a require removed": [{ mod: swap(MOD_NEW, "\tgolang.org/x/text v0.21.0 // indirect\n", "") }, /golang\.org\/x\/text/],
    "a new major version of a path": [{ mod: swap(MOD_NEW, "github.com/acme/lib v1.3.0", "github.com/acme/lib/v2 v2.0.0") }, /github\.com\/acme\/lib\/v2/],
    "a look-alike path": [{ mod: swap(MOD_NEW, "github.com/acme/lib v1.3.0", "github.com/acme/1ib v1.3.0") }, /github\.com\/acme\/1ib/],
    "an indirect comment dropped": [{ mod: swap(MOD_NEW, " // indirect", "") }, /golang\.org\/x\/text v0\.21\.0/],
    "an indirect comment added": [{ mod: swap(MOD_NEW, "lib v1.3.0", "lib v1.3.0 // indirect") }, /github\.com\/acme\/lib v1\.3\.0 \/\/ indirect/],
    "a comment changed": [{ mod: swap(MOD_NEW, " // indirect", " // deprecated") }, /golang\.org\/x\/text v0\.21\.0 \/\/ deprecated/],
    "a comment line added": [{ mod: `${MOD_NEW}// replaced for a day\n` }, /line 11\b.*replaced for a day/],
    "a duplicate require": [{ mod: `${MOD_NEW}require github.com/acme/lib v1.3.0\n` }, /line 11\b.*github\.com\/acme\/lib/],
    "everything removed": [{ mod: "" }, /module example\.com\/app/],
  });
});

test("AC-531-2: WHEN go.mod has a line this gate can't read, at the head or the merge base, THEN own-branch.mjs exits 1 and names the line", unixOnly, () => {
  const lib = (line) => ({ mod: swap(MOD_NEW, "\tgithub.com/acme/lib v1.3.0", line) });
  const both = (line) => ({ base: swap(MOD_OLD, "\tgithub.com/acme/lib v1.2.0", line), mod: swap(MOD_NEW, "\tgithub.com/acme/lib v1.3.0", line) });
  refusedGo({
    "a quoted path": [lib('\t"github.com/acme/lib" v1.3.0'), /github\.com\/acme\/lib.* v1\.3\.0/],
    "a raw-quoted path": [lib("\t`github.com/acme/lib` v1.3.0"), /`github\.com\/acme\/lib` v1\.3\.0/],
    "a quoted path the merge base had too": [both('\t"github.com/acme/lib" v1.3.0'), /line 6\b/],
    "a branch name for a version": [lib("\tgithub.com/acme/lib master"), /github\.com\/acme\/lib master/],
    "latest for a version": [lib("\tgithub.com/acme/lib latest"), /github\.com\/acme\/lib latest/],
    "a version with two numbers": [lib("\tgithub.com/acme/lib v1.3"), /github\.com\/acme\/lib v1\.3\b/],
    "a version with no v": [lib("\tgithub.com/acme/lib 1.3.0"), /github\.com\/acme\/lib 1\.3\.0/],
    "a word after the digits": [lib("\tgithub.com/acme/lib v1.3.0abc"), /v1\.3\.0abc/],
    "a path in a version": [lib("\tgithub.com/acme/lib v1.3.0/../x"), /v1\.3\.0\/\.\.\/x/],
    "a leading zero": [lib("\tgithub.com/acme/lib v01.3.0"), /v01\.3\.0/],
    "a path with no dot in its first element": [{ base: swap(MOD_OLD, "github.com/acme/lib", "acme/lib"), mod: swap(MOD_NEW, "github.com/acme/lib", "acme/lib") }, /acme\/lib v1\.3\.0/],
    "a path with a dot-dot element": [{ base: swap(MOD_OLD, "github.com/acme/lib", "github.com/../lib"), mod: swap(MOD_NEW, "github.com/acme/lib", "github.com/../lib") }, /github\.com\/\.\.\/lib/],
    "three words": [lib("\tgithub.com/acme/lib v1.3.0 extra"), /v1\.3\.0 extra/],
    "an arrow in a require": [lib("\tgithub.com/acme/lib v1.3.0 => ../lib"), /=> \.\.\/lib/],
    "a comment stuck to the version": [lib("\tgithub.com/acme/lib v1.3.0//x"), /v1\.3\.0\/\/x/],
    "a block inside a block": [lib("\trequire (\n\tgithub.com/acme/lib v1.3.0"), /line 6\b.*require \(/],
    "a paren after a statement": [{ mod: swap(MOD_NEW, "single v0.4.2", "single v0.4.2 (") }, /v0\.4\.2 \(/],
    "a statement on the line of the paren": [{ mod: swap(MOD_NEW, "require (\n", "require ( github.com/x/y v1.0.0\n") }, /line 5\b/],
    "a statement outside a block": [{ mod: `${MOD_NEW}github.com/acme/lib v1.3.0\n` }, /line 11\b/],
    "an unknown directive": [{ mod: `${MOD_NEW}frobnicate github.com/acme/lib\n` }, /line 11\b.*frobnicate/],
    "a block that never closes": [{ mod: `${MOD_NEW}require (\n\tgolang.org/x/net v0.30.0\n` }, /line 11\b/],
    "a stray close": [{ mod: `${MOD_NEW})\n` }, /line 11\b/],
    "a byte order mark": [{ mod: `﻿${MOD_NEW}` }, /line 1\b/],
    "Windows line endings": [{ mod: MOD_NEW.replace(/\n/g, "\r\n") }, /line 1\b/],
    "a block comment": [{ mod: `${MOD_NEW}/* x */\n` }, /line 11\b.*\/\* x \*\//],
    "a control character": [lib("\tgithub.com/acme/lib v1.3.0\u0000"), /line 6\b/],
  });
});

test("AC-531-2: WHEN a bump adds a go.sum line that isn't <module> <version> h1:<hash> or <module> <version>/go.mod h1:<hash> THEN own-branch.mjs exits 1 and names the line", unixOnly, () => {
  const hash = h1("x");
  const line = (text) => [{ sum: `${SUM_NEW}${text}\n` }, new RegExp(`go\\.sum line 7\\b.*${text.split(/\s/)[0].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`)];
  refusedGo({
    "no hash": line("github.com/acme/lib v1.3.1"),
    "no hash on a go.mod line": line("github.com/acme/lib v1.3.1/go.mod"),
    "another hash kind": line(`github.com/acme/lib v1.3.1 h2:${hash.slice(3)}`),
    "a capital H": line(`github.com/acme/lib v1.3.1 H1:${hash.slice(3)}`),
    "a short hash": line("github.com/acme/lib v1.3.1 h1:abc="),
    "a hash with no padding": line(`github.com/acme/lib v1.3.1 ${hash.slice(0, -1)}`),
    "a hash that isn't base64": line(`github.com/acme/lib v1.3.1 h1:${"!".repeat(43)}=`),
    "two spaces": line(`github.com/acme/lib  v1.3.1 ${hash}`),
    "a tab": line(`github.com/acme/lib\tv1.3.1 ${hash}`),
    "a trailing space": line(`github.com/acme/lib v1.3.1 ${hash} `),
    "a fourth field": line(`github.com/acme/lib v1.3.1 ${hash} extra`),
    "a comment": line("// h1 is fine"),
    "a branch for a version": line(`github.com/acme/lib master ${hash}`),
    "a version with no v": line(`github.com/acme/lib 1.3.1 ${hash}`),
    "go.mod twice": line(`github.com/acme/lib v1.3.1/go.mod/go.mod ${hash}`),
    "go.mod misspelled": line(`github.com/acme/lib v1.3.1/go.mod2 ${hash}`),
    "go.mod with no slash": line(`github.com/acme/lib v1.3.1go.mod ${hash}`),
    "a path with a dot-dot element": line(`example.com/../x v1.0.0 ${hash}`),
    "a path with no dot in its first element": line(`acme/lib v1.0.0 ${hash}`),
    "a path with a scheme": line(`https://example.com/x v1.0.0 ${hash}`),
    "a carriage return": line(`github.com/acme/lib v1.3.1 ${hash}\r`),
    "a blank line in the middle": [{ sum: `${SUM_NEW}\n${sums("golang.org/x/net", "v0.30.0")}` }, /go\.sum line 7\b/],
  });
});

test("AC-531-2: WHEN a Go bump changes any other file, or adds, removes or renames go.mod or go.sum THEN own-branch.mjs exits 1, with no sha", unixOnly, () => {
  const status = (filename, s) => [{ filename, status: s }];
  refused({
    "a Go source file too": { files: changed("go.mod", "go.sum", "main.go") },
    "the workspace file": { files: changed("go.work") },
    "the workspace sum file": { files: changed("go.work.sum") },
    "the vendor list": { files: changed("go.mod", "go.sum", "vendor/modules.txt") },
    "a vendored file": { files: changed("go.mod", "vendor/github.com/acme/lib/lib.go") },
    "a look-alike name": { files: changed("go.mod.bak", "ago.mod", "go.sum.old", "go.summ") },
    "an added go.mod": { files: status("services/new/go.mod", "added") },
    "a removed go.sum": { files: status("go.sum", "removed") },
    "a rename into go.mod": { files: changed(["src/app.go", "go.mod"]) },
    "a rename of go.sum": { files: changed(["old/go.sum", "go.sum"]) },
    "a go.mod in an agent folder": { files: changed(".agents/tools/go.mod") },
    "a go.sum under .github": { files: changed(".github/go.sum") },
    "a go.mod in .claude": { files: changed(".claude/x/go.mod") },
  });
  assert.match(bump({ files: changed("go.mod", "main.go") }).stderr, /main\.go/, "it names the file");
});

test("AC-531-3: WHEN own-branch.mjs sees a Go bump on a dependabot/ branch of this repo THEN it gives the exit code it gives for the same npm bump", unixOnly, () => {
  const same = (name, go, npm) => {
    const [a, b] = [go, npm];
    assert.equal(a.status, b.status, `${name}: ${a.stderr} | ${b.stderr}`);
    assert.equal(a.stdout === "", b.stdout === "", name);
  };
  same("a bump that passes", goBump(), bump());
  same("a commit that isn't Dependabot's", goBump({ commits: [commit(HEAD, "builder", "builder")] }), bump({ commits: [commit(HEAD, "builder", "builder")] }));
  same("an unverified commit", goBump({ commits: [commit(HEAD, BOT, "web-flow", false)] }), bump({ commits: [commit(HEAD, BOT, "web-flow", false)] }));
  same("a fork", goBump({ pull: { from: "someone/app" } }), bump({ pull: { from: "someone/app" } }));
  same("a short file list", goBump({ pull: { files: 3 } }), bump({ pull: { files: 3 } }));
  same("a moved head", goBump({ api: { [`${REPO}/pulls/7`]: { sequence: [pullOf({ ref: GO_BRANCH }), pullOf({ ref: GO_BRANCH, sha: "d".repeat(40) })] } } }), bump({ api: { [`${REPO}/pulls/7`]: { sequence: [pullOf(), pullOf({ sha: "d".repeat(40) })] } } }));
  same("a refused contents read", goBump({ api: { [`${REPO}/contents/go.mod?ref=${HEAD}`]: { ghError: "HTTP 403: rate limit" } } }), bump({ api: { [`${REPO}/contents/package.json?ref=${HEAD}`]: { ghError: "HTTP 403: rate limit" } } }));
  same("a refused go.sum read", goBump({ api: { [`${REPO}/contents/go.sum?ref=${HEAD}`]: { ghError: "HTTP 502" } } }), bump({ api: { [`${REPO}/contents/pnpm-lock.yaml?ref=${HEAD}`]: { ghError: "HTTP 502" } } }));
  assert.equal(goBump({ api: { [`${REPO}/contents/go.mod?ref=${HEAD}`]: { ghError: "HTTP 403: rate limit" } } }).status, 2);
  assert.equal(goBump({ mod: `${MOD_NEW}replace a.b/c => ../c\n` }).status, bump({ after: { "package.json": { ...BUMPED, overrides: { vite: "8.4.0" } } } }).status, "a refusal gives the same exit code");
  const both = bump({ files: changed("package.json", "go.mod", "go.sum"), before: { "go.mod": MOD_OLD, "go.sum": SUM_OLD }, after: { "go.mod": MOD_NEW, "go.sum": SUM_NEW } });
  assert.equal(both.status, 0, `an npm and a Go file in one bump: ${both.stderr}`);
});

test("AC-531-5: WHEN dependencies is read THEN each rule that names an npm command has its Go command beside it, and the npm lines are as they were", () => {
  const skill = read(".agents/skills/dependencies/SKILL.md");
  const go = {
    "rule 2": ["`go list -m -versions <module>`", "pkg.go.dev", "github.com/gorilla/mux"],
    "rule 5": ["`GoVersion`", "`go mod graph`"],
    "rule 6": ["`go mod download -json <module>@<version>`", "LICENSE"],
    "rule 10": ["`go-licenses report <your module path>/...`"],
    "rule 11": ["`go get <module>@v1.2.3`", "`go mod tidy`", "`go mod verify`", "`go mod tidy -diff`", "`go build -mod=readonly ./...`", "`go.sum`", "`gomod`"],
    "the checklist": ["`govulncheck ./...`"],
  };
  for (const [where, words] of Object.entries(go)) for (const word of words) assert.ok(skill.includes(word), `${where}: ${word}`);
  const npm = ["`npm view <pkg>`", "`npm view <pkg>@<version> license`", "`pnpm check:merge`", '`license-checker-rseidelsohn --onlyAllow "..."`', "`pnpm licenses list --json`", "`pnpm add -E`", "`npm install -E`", "`npm ci`", "`pnpm install --frozen-lockfile`", "read `peerDependencies` and `engines`"];
  for (const word of npm) assert.ok(skill.includes(word), `npm: ${word}`);
});

test("AC-581-1: WHEN a Go bump changes the version of a module path on the left of a replace or exclude line at the merge base THEN own-branch.mjs exits 1 and names that path", unixOnly, () => {
  // Both ends carry the line, so it is no new line: the bump alone could switch it on or off.
  const had = (line) => ({ base: MOD_OLD + line, mod: MOD_NEW + line });
  refusedGo({
    "a replace of the version the bump moves to": [had("replace github.com/acme/lib v1.3.0 => github.com/other/lib v1.3.0\n"), /bumps github\.com\/acme\/lib\b.*line 11\b.*replace github\.com\/acme\/lib v1\.3\.0 => github\.com\/other\/lib/],
    "a replace of the version the bump moves from": [had("replace github.com/acme/lib v1.2.0 => ../lib\n"), /bumps github\.com\/acme\/lib\b.*line 11\b.*replace github\.com\/acme\/lib v1\.2\.0/],
    "a replace of every version": [had("replace github.com/acme/lib => ../lib\n"), /bumps github\.com\/acme\/lib\b.*replace github\.com\/acme\/lib => \.\.\/lib/],
    "an exclude of the version the bump moves to": [had("exclude github.com/acme/lib v1.3.0\n"), /bumps github\.com\/acme\/lib\b.*line 11\b.*exclude github\.com\/acme\/lib v1\.3\.0/],
    "an exclude block": [had("exclude (\n\tgithub.com/acme/lib v1.3.0\n)\n"), /bumps github\.com\/acme\/lib\b.*line 12\b.*exclude github\.com\/acme\/lib v1\.3\.0/],
    "a replace block of an indirect path": [had("replace (\n\tgolang.org/x/text v0.21.0 => golang.org/x/text v0.20.0\n)\n"), /bumps golang\.org\/x\/text\b.*line 12\b/],
    "a replace of the path in the single-line require": [had("replace github.com/other/single v0.4.2 => ../single\n"), /bumps github\.com\/other\/single\b.*line 11\b/],
  });
  const elsewhere = "replace github.com/acme/unused v1.0.0 => ../unused\nexclude github.com/acme/unused v1.2.5\n";
  assert.equal(goBump(had(elsewhere)).status, 0, "a replace and an exclude of paths the bump leaves alone still pass");
  const pinned = "replace github.com/acme/lib v1.2.0 => ../lib\n";
  const other = swap(MOD_OLD, "single v0.4.1", "single v0.4.2");
  assert.equal(goBump({ base: MOD_OLD + pinned, mod: other + pinned }).status, 0, "a bump of another module than the replaced one passes");
  assert.equal(goBump({ base: MOD_OLD + pinned, mod: MOD_OLD + pinned, sum: SUM_OLD }).status, 0, "a replaced path whose version stays passes");
});

test("AC-581-2: WHEN the gate refuses a line THEN the reason quotes at most about 200 characters of it", unixOnly, () => {
  const long = "x".repeat(5000);
  const lib = (line) => swap(MOD_NEW, "\tgithub.com/acme/lib v1.3.0", line);
  const cases = {
    "a go.mod line it can't read": { mod: lib(`\tgithub.com/acme/lib v1.3.0 ${long} (`) },
    "a go.mod line it can't read at the merge base": { base: lib(`\tgithub.com/acme/lib v1.3.0 ${long} (`) },
    "an added replace line": { mod: `${MOD_NEW}replace github.com/acme/${long} => ../lib\n` },
    "an added require of a very long path": { mod: `${MOD_NEW}require github.com/acme/${long} v1.0.0\n` },
    "a require twice": { mod: `${MOD_NEW}require github.com/acme/${long} v1.0.0\nrequire github.com/acme/${long} v1.0.0\n` },
    "a line of the merge base that is gone": { base: `${MOD_OLD}replace github.com/acme/other => ../${long}\n` },
    "a replace of a bumped path": { base: `${MOD_OLD}replace github.com/acme/lib v1.3.0 => ../${long}\n`, mod: `${MOD_NEW}replace github.com/acme/lib v1.3.0 => ../${long}\n` },
    "a long prerelease on a replaced, bumped path": {
      base: `${MOD_OLD}replace github.com/acme/lib => ../lib\n`,
      mod: `${swap(MOD_NEW, "v1.3.0", `v1.3.0-${long}`)}replace github.com/acme/lib => ../lib\n`,
    },
    "a long version of a replaced path at the merge base": {
      base: `${swap(MOD_OLD, "v1.2.0", `v1.2.0-${long}`)}replace github.com/acme/lib => ../lib\n`,
      mod: `${MOD_NEW}replace github.com/acme/lib => ../lib\n`,
    },
    "a go.sum line": { sum: `${SUM_NEW}github.com/acme/lib v1.3.1 ${h1("x")} ${long}\n` },
    "a go.sum line with a long path": { sum: `${SUM_NEW}github.com/acme/${long} v1.3.1 ${h1("x")} extra\n` },
  };
  for (const [name, more] of Object.entries(cases)) {
    const r = goBump(more);
    assert.equal(r.status, 1, `${name}: ${r.stderr.slice(0, 300)}`);
    assert.equal(r.stdout, "", name);
    assert.ok(r.stderr.length < 1000, `${name}: the reason is ${r.stderr.length} characters`);
    assert.ok(!r.stderr.includes("x".repeat(201)), `${name}: more than 200 characters of the line`);
    assert.ok(r.stderr.includes("x".repeat(100)), `${name}: the reason still shows the start of the line`);
    assert.match(r.stderr, ONLY, name);
  }
  const short = goBump({ mod: `${MOD_NEW}replace github.com/acme/lib => ../lib\n` });
  assert.match(short.stderr, /replace github\.com\/acme\/lib => \.\.\/lib"/, "a short line is quoted whole");
});

test("AC-581-3: WHEN a new go.sum line has a <module> <version> or <module> <version>/go.mod that the merge base has with a different hash THEN own-branch.mjs exits 1 and names the line", unixOnly, () => {
  const rows = SUM_OLD.trimEnd().split("\n");
  const rewritten = (i) => `${rows.map((row, n) => (n === i ? `${row.split(" ").slice(0, 2).join(" ")} ${h1("rewritten")}` : row)).join("\n")}\n`;
  refusedGo({
    "a version's hash rewritten, the old lines kept beside the new": [{ sum: SUM_NEW + rewritten(0) }, /go\.sum line 7\b.*github\.com\/acme\/lib v1\.2\.0 h1:/],
    "a go.mod hash rewritten": [{ sum: SUM_NEW + rewritten(1) }, /go\.sum line 8\b.*github\.com\/acme\/lib v1\.2\.0\/go\.mod h1:/],
    "a hash rewritten in place for a module the bump leaves alone": [{ sum: rewritten(2) }, /go\.sum line 3\b.*github\.com\/other\/single v0\.4\.1 h1:/],
    "a second hash beside the first": [{ sum: `${SUM_OLD}github.com/acme/lib v1.2.0 ${h1("second")}\n` }, /go\.sum line 7\b.*github\.com\/acme\/lib v1\.2\.0 h1:/],
    "a second go.mod hash beside the first": [{ sum: `${SUM_OLD}github.com/acme/lib v1.2.0/go.mod ${h1("second")}\n` }, /go\.sum line 7\b.*github\.com\/acme\/lib v1\.2\.0\/go\.mod h1:/],
  });
  assert.equal(goBump({ sum: SUM_OLD + sums("github.com/acme/lib", "v1.3.0") }).status, 0, "a new version beside lines kept with their hashes passes");
  assert.equal(goBump({ sum: `${SUM_NEW}github.com/acme/lib v1.2.0/go.mod ${h1("github.com/acme/libv1.2.0/go.mod")}\n` }).status, 0, "a line the merge base has, as it has it, passes");
});

test("AC-581-4: WHEN a bump changes a go.mod or go.sum under vendor/ or testdata/ THEN own-branch.mjs exits 1 and names the file", unixOnly, () => {
  const only = (path) => ({ files: changed(path) });
  const cases = {
    "a vendored go.mod": only("vendor/github.com/acme/lib/go.mod"),
    "a vendored go.sum": only("vendor/github.com/acme/lib/go.sum"),
    "a vendored go.mod beside the real ones": { files: changed("go.mod", "go.sum", "vendor/github.com/acme/lib/go.mod") },
    "a go.mod in testdata": only("testdata/app/go.mod"),
    "a go.sum in a nested testdata": only("services/api/testdata/mod/go.sum"),
    "a vendor folder inside a service": only("services/api/vendor/x/go.mod"),
    "a vendor folder in capitals": only("Vendor/x/go.mod"),
    "a testdata folder in capitals": only("TestData/x/go.sum"),
  };
  for (const [name, more] of Object.entries(cases)) {
    // Every file has an honest bump to read, so only the folder can make the gate refuse it.
    const file = more.files.at(-1).filename;
    const [old, now] = file.endsWith("go.mod") ? [MOD_OLD, MOD_NEW] : [SUM_OLD, SUM_NEW];
    const r = bump({ ...more, pull: { ref: GO_BRANCH }, before: { "go.mod": MOD_OLD, "go.sum": SUM_OLD, [file]: old }, after: { "go.mod": MOD_NEW, "go.sum": SUM_NEW, [file]: now } });
    assert.equal(r.status, 1, `${name}: ${r.stderr}`);
    assert.equal(r.stdout, "", name);
    assert.match(r.stderr, ONLY, name);
    assert.match(r.stderr, naming(file), `${name}: it names the file`);
  }
  for (const dir of ["services/vendors/api/", "vendored/", "mytestdata/", "services/api/"]) {
    assert.equal(goBump({ dir }).status, 0, `${dir}go.mod and go.sum pass`);
  }
});

// Go skips a folder whose name starts with "_" or "." as it skips vendor/ and testdata/, so a go.mod there is not the module's (#590).
const HIDDEN_DIRS = {
  "a go.mod in an underscore folder": "_vendor/go.mod",
  "a go.sum in a dot folder": ".hidden/go.sum",
  "a go.mod in a nested underscore folder": "services/api/_gen/go.mod",
  "a go.sum in a nested dot folder": "services/.cache/go.sum",
  "a go.mod deep in a dot folder": "a/b/.c/d/go.mod",
  "a go.sum below an underscore folder at the root": "_x/y/z/go.sum",
  "a go.mod in the .github folder": ".github/go.mod",
  "a go.mod in a folder named only _": "_/go.mod",
};

test("AC-590-1: WHEN a bump changes a go.mod or go.sum under a folder whose name starts with _ or ., at any depth THEN own-branch.mjs exits 1 and names the file", unixOnly, () => {
  for (const [name, file] of Object.entries(HIDDEN_DIRS)) {
    const [old, now] = file.endsWith("go.mod") ? [MOD_OLD, MOD_NEW] : [SUM_OLD, SUM_NEW];
    for (const [label, files] of [["alone", changed(file)], ["beside the real ones", changed("go.mod", "go.sum", file)]]) {
      // The file has an honest bump to read, so only the folder can make the gate refuse it.
      const r = bump({ files, pull: { ref: GO_BRANCH }, before: { "go.mod": MOD_OLD, "go.sum": SUM_OLD, [file]: old }, after: { "go.mod": MOD_NEW, "go.sum": SUM_NEW, [file]: now } });
      assert.equal(r.status, 1, `${name}, ${label}: ${r.stderr}`);
      assert.equal(r.stdout, "", `${name}, ${label}`);
      assert.match(r.stderr, ONLY, `${name}, ${label}`);
      assert.match(r.stderr, naming(file), `${name}, ${label}: it names the file`);
    }
  }
});

test("AC-590-2: WHEN a bump changes only the honest go.mod and go.sum, or they sit in a folder such as svc/ or my_vendor/ THEN it passes as before, and vendor/ and testdata/ are still refused", unixOnly, () => {
  for (const dir of ["", "svc/", "my_vendor/", "services/api_v2/", "a.b/", "svc.io/", "x_/", "services/api/"]) {
    assert.equal(goBump({ dir }).status, 0, `${dir}go.mod and go.sum pass`);
  }
  for (const file of ["vendor/x/go.mod", "services/api/testdata/go.sum", "Vendor/x/go.mod", "TestData/x/go.sum"]) {
    const [old, now] = file.endsWith("go.mod") ? [MOD_OLD, MOD_NEW] : [SUM_OLD, SUM_NEW];
    const r = bump({ files: changed(file), pull: { ref: GO_BRANCH }, before: { [file]: old }, after: { [file]: now } });
    assert.equal(r.status, 1, `${file} stays refused: ${r.stderr}`);
  }
});

test("AC-581-5: WHEN a reader opens decision 531-1 THEN its sentence about the checksum database says Go compares the downloaded bytes with every go.sum line for that version and asks the database only when a line is missing", () => {
  const decision = read("docs/decisions/531-1.md");
  assert.match(decision, /Go compares the downloaded bytes with every `go\.sum` line for that version, and asks the checksum database only when a line is missing/);
  assert.doesNotMatch(decision, /checks each hash against the (?:module proxy's )?checksum database/);
  assert.doesNotMatch(read(".agents/skills/coordinate/scripts/dependabot-go.mjs"), /checks each hash against the module proxy's checksum database/);
});

test("AC-581-6: WHEN dependabot-bump.test.mjs is counted THEN it is under 500 lines, because the Go cases live in their own file", () => {
  const bumpTests = read("cli/test/dependabot-bump.test.mjs");
  assert.ok(bumpTests.split("\n").length < 500, "dependabot-bump.test.mjs stays under 500 lines");
  assert.doesNotMatch(bumpTests, /test\("AC-531-/, "no Go case is left in the npm file");
  const goTests = read("cli/test/dependabot-go.test.mjs");
  for (const id of ["AC-531-1", "AC-531-2", "AC-531-3", "AC-531-5"]) assert.ok(goTests.includes(`test("${id}:`), `${id} is in dependabot-go.test.mjs`);
  assert.ok(goTests.split("\n").length < 500, "dependabot-go.test.mjs stays under 500 lines");
});
