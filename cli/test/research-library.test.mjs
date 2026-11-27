// Tests for scripts/research-library.mjs (the master copy) and `research-library init`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPrivate, entryPaths, insertEntry, readLibrarySetting, readManifest, REQUIRED, resolvePath, stripPersonal, validateManifest } from "../../scripts/research-library.mjs";
import { doctor } from "../src/doctor.mjs";
import { libraryInit } from "../src/library-init.mjs";
import { copyProfileIfMissing, profileCopy } from "../src/profile.mjs";
import { exists, logger, put, read, safeEnv, tmp } from "./helpers.mjs";

const repo = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const SCRIPT = repo("scripts/research-library.mjs");
const TEMPLATE_MANIFEST = JSON.parse(readFileSync(repo("templates/research-library/research-library.json"), "utf8"));
const SCHEMA = JSON.parse(readFileSync(repo(".agents/skills/research/references/library.schema.json"), "utf8"));
const manifest = (change = {}) => ({ ...structuredClone(TEMPLATE_MANIFEST), ...change });
const errorsOf = (m) => validateManifest(m).join("\n");

test("the template's manifest is valid, and the schema and the validator agree on the fields", () => {
  assert.deepEqual(validateManifest(TEMPLATE_MANIFEST, repo("templates/research-library")), []);
  assert.deepEqual(SCHEMA.required, REQUIRED);
  assert.equal(SCHEMA.properties.private.const, true);
});

test("a manifest that isn't private, or names another schema, fails", () => {
  assert.match(errorsOf(manifest({ private: false })), /private must be true/);
  assert.match(errorsOf(manifest({ private: "yes" })), /private must be true/);
  const { private: _, ...noPrivate } = manifest();
  assert.match(errorsOf(noPrivate), /private is missing/);
  assert.match(errorsOf(manifest({ schema: "research-library/2" })), /schema must be "research-library\/1"/);
  assert.match(errorsOf(manifest({ extra: 1 })), /extra is not a manifest field/);
});

test("layout paths must stay inside the library and use {slug}", () => {
  const m = manifest();
  m.layout.report = "../elsewhere/{slug}.md";
  m.layout.store = "/abs/{slug}";
  m.layout.data = "research/data";
  m.layout.provenance = "research/{topic}/provenance.json";
  m.layout.briefs.helper = "briefs/{slug}/helper.md";
  const e = errorsOf(m);
  assert.match(e, /layout.report must stay inside the library/);
  assert.match(e, /layout.store must be relative/);
  assert.match(e, /layout.data needs \{slug\}/);
  assert.match(e, /layout.provenance uses \{topic\}/);
  assert.match(e, /layout.briefs.helper needs \{name\}/);
});

test("index entries need a known insert, an anchor and known placeholders; checks and provenance are required", () => {
  const m = manifest({ checks: [] });
  m.index = [{ file: "README.md", insert: "somewhere", entry: "x" }, { file: "CHANGELOG.md", insert: "after-anchor", entry: "{secret}" }];
  m.provenance = { id: "research-provenance/1", schema: "schemas/provenance.schema.json", paths: "nowhere" };
  const e = errorsOf(m);
  assert.match(e, /index\[0\].insert must be one of/);
  assert.match(e, /index\[1\].anchor is needed/);
  assert.match(e, /index\[1\].entry uses \{secret\}/);
  assert.match(e, /checks must list at least one command/);
  assert.match(e, /provenance.paths must be "store" or "root"/);
});

test("with a folder, files the manifest names must exist", () => {
  const dir = tmp("onrails-library-");
  put(dir, "research-library.json", JSON.stringify(TEMPLATE_MANIFEST));
  const { errors } = readManifest(dir);
  assert.match(errors.join("\n"), /index\[0\].file research\/README.md not found/);
  assert.match(errors.join("\n"), /provenance.schema schemas\/provenance.schema.json not found/);
  put(dir, "research-library.json", "{ not json");
  assert.match(readManifest(dir).errors[0], /not valid JSON/);
});

test("resolvePath fills placeholders and refuses a missing value, a bad slug or an escape", () => {
  assert.equal(resolvePath("research/{slug}/REPORT.md", { slug: "pick-a-host" }), "research/pick-a-host/REPORT.md");
  assert.equal(resolvePath("briefs/{slug}-helper-{name}.md", { slug: "a", name: "ci-cd" }), "briefs/a-helper-ci-cd.md");
  assert.throws(() => resolvePath("research/{slug}.md", {}), /no value for \{slug\}/);
  assert.throws(() => resolvePath("research/{slug}.md", { slug: "../etc" }), /lowercase words/);
  assert.throws(() => resolvePath("research/{slug}.md", { slug: "Agile Flow" }), /lowercase words/);
});

test("entryPaths lists every path one entry writes, a brief per helper", () => {
  const paths = entryPaths(TEMPLATE_MANIFEST, { slug: "pick", helpers: ["prices"] });
  assert.equal(paths.report, "research/pick.md");
  assert.equal(paths.provenance, "research/pick/provenance.json");
  assert.deepEqual(paths.briefs, { author: "briefs/pick/author.md", "fact-check": "briefs/pick/fact-check.md", helpers: { prices: "briefs/pick/helper-prices.md" } });
  assert.deepEqual(paths.index, ["research/README.md", "CHANGELOG.md"]);
});

test("insertEntry adds a table row, a newest-first block, a line ending and a file ending", () => {
  const vars = { slug: "pick", title: "Pick", date: "2026-11-24", summary: "Two\nlines." };
  const table = "# R\n\n| Dossier | Q |\n|---|---|\n| [Old](old.md) | q |\n\nAfter.\n";
  assert.equal(insertEntry(table, { insert: "table-end", anchor: "| Dossier |", entry: "| [{title}]({slug}.md) | x |" }, vars),
    "# R\n\n| Dossier | Q |\n|---|---|\n| [Old](old.md) | q |\n| [Pick](pick.md) | x |\n\nAfter.\n");
  assert.equal(insertEntry("# Changelog\n\n## old\n", { insert: "after-anchor", anchor: "# Changelog", entry: "## {date}: {title}\n\n{summary}\n" }, vars),
    "# Changelog\n\n## 2026-11-24: Pick\n\nTwo lines.\n\n## old\n");
  assert.equal(insertEntry("- [`research/`]: a.\n- b\n", { insert: "line-end", anchor: "- [`research/`]", entry: " `{slug}`." }, vars), "- [`research/`]: a. `pick`.\n- b\n");
  assert.equal(insertEntry("a\n\n", { insert: "file-end", entry: "{slug}" }, vars), "a\npick\n");
  assert.throws(() => insertEntry("nothing\n", { file: "X.md", insert: "line-end", anchor: "- [`research/`]", entry: "x" }, vars), /X.md: no line starts with/);
});

// A fake gh on PATH that answers `gh api repos/<x> --jq .private` from its own table.
function fakeGh(answers) {
  const bin = tmp("onrails-gh-");
  const cases = Object.entries(answers).map(([repoName, out]) => `  repos/${repoName}) ${out} ;;`).join("\n");
  put(bin, "gh", `#!/bin/sh\n[ "$1" = api ] || exit 9\ncase "$2" in\n${cases}\n  *) echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;\nesac\n`);
  chmodSync(join(bin, "gh"), 0o755);
  return safeEnv({}, { bins: [bin] });
}
const runPrivate = (repoName, env) => spawnSync(process.execPath, [SCRIPT, "private", repoName], { env, encoding: "utf8" });

test("the privacy check refuses a public library and passes a private one, with a fake gh", { skip: process.platform === "win32" }, () => {
  const env = fakeGh({ "me/lib": "echo true", "me/open": "echo false" });
  const ok = runPrivate("me/lib", env);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /ok: me\/lib is private/);
  const pub = runPrivate("me/open", env);
  assert.equal(pub.status, 1);
  assert.match(pub.stderr, /refused: me\/open is public\. A research library must be private/);
  const missing = runPrivate("me/gone", env);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /couldn't confirm me\/gone is private/);
});

test("checkPrivate refuses a malformed name or an odd answer without trusting it", () => {
  assert.equal(checkPrivate("not a repo").ok, false);
  assert.match(checkPrivate("me/x", { run: () => "null\n" }).reason, /GitHub gave "null"/);
  assert.deepEqual(checkPrivate("me/x", { run: (cmd, args) => (assert.deepEqual([cmd, ...args], ["gh", "api", "repos/me/x", "--jq", ".private"]), "true\n") }).ok, true);
});

test("research-library init copies the template into a new folder, and the copy passes its own check", () => {
  const dir = join(tmp("onrails-libinit-"), "lib");
  const log = logger();
  assert.equal(libraryInit(dir, { log }), 0);
  for (const path of ["research-library.json", "README.md", "CHANGELOG.md", "research/README.md", "briefs/README.md", "schemas/provenance.schema.json",
    "schemas/library.schema.json", "scripts/check-library.mjs", "scripts/check-research.mjs", "scripts/research-library.mjs"]) {
    assert.ok(exists(dir, path), path);
  }
  // #132: no GitHub Actions workflow. The checks it ran are the two scripts, run from the session.
  assert.ok(!exists(dir, ".github/workflows"));
  assert.match(read(dir, "README.md"), /node scripts\/research-library\.mjs private/);
  assert.match(log.text(), /gh repo create <owner>\/<name> --private/);
  const r = spawnSync(process.execPath, [join(dir, "scripts", "check-library.mjs")], { encoding: "utf8", env: safeEnv() });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /library: 0 dossiers, 0 errors/);
});

test("research-library init never overwrites: a manifest or any clashing file stops it", () => {
  const dir = tmp("onrails-libinit-");
  put(dir, "README.md", "mine\n");
  const log = logger();
  assert.equal(libraryInit(dir, { log }), 1);
  assert.equal(read(dir, "README.md"), "mine\n");
  assert.ok(!exists(dir, "research-library.json"));
  assert.match(log.text(), /Nothing copied/);
  assert.equal(libraryInit(undefined, { log: logger() }), 2);
});

test("the CLI routes research-library init and rejects other subcommands", () => {
  const cli = repo("cli/bin/cli.mjs");
  const bad = spawnSync(process.execPath, [cli, "research-library", "pull"], { encoding: "utf8", env: safeEnv() });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Unknown research-library command: pull/);
  const dir = join(tmp("onrails-libcli-"), "lib");
  const ok = spawnSync(process.execPath, [cli, "research-library", "init", dir], { encoding: "utf8", env: safeEnv() });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(exists(dir, "research-library.json"));
});

// The library's name and path are personal: never in a project's docs/profile.toml.
const PROFILE = '[me]\nname = "a"\n\n[research]\nlibrary = "me/lib"     # owner/repo\nlibrary_path = "/home/me/lib"\noffered = true\n\n[other]\nlibrary = "kept"\n';

test("profile copy and init's copy never write library or library_path into a project", async () => {
  const home = tmp("onrails-home-");
  put(home, ".onrails/profile.toml", PROFILE);
  const dir = tmp("onrails-proj-");
  assert.equal(await profileCopy(dir, { home, yes: true, log: logger() }), 0);
  const copied = read(dir, "docs/profile.toml");
  assert.doesNotMatch(copied, /me\/lib|\/home\/me\/lib/);
  assert.match(copied, /^# library: set in your personal profile only$/m);
  assert.match(copied, /^# library_path: set in your personal profile only$/m);
  assert.match(copied, /^offered = true$/m);
  assert.match(copied, /^library = "kept"$/m);
  const fresh = tmp("onrails-proj-");
  assert.equal(copyProfileIfMissing(fresh, { home }), true);
  assert.doesNotMatch(read(fresh, "docs/profile.toml"), /me\/lib/);
});

test("the reader takes library from the personal profile, ignores a project's own and warns", () => {
  const home = tmp("onrails-home-");
  const projectDir = tmp("onrails-proj-");
  put(projectDir, "docs/profile.toml", '[research]\nlibrary = "someone/public-repo"\n');
  assert.deepEqual(readLibrarySetting({ home, projectDir }).library, "");
  put(home, ".ai-dev-workflow/profile.toml", PROFILE);
  const old = readLibrarySetting({ home, projectDir });
  assert.equal(old.library, "me/lib");
  assert.equal(old.library_path, "/home/me/lib");
  assert.match(old.warnings.join("\n"), /sets \[research\] library or library_path\. Ignored/);
  put(home, ".onrails/profile.toml", '[research]\nlibrary = "me/new"\n');
  assert.equal(readLibrarySetting({ home, projectDir }).library, "me/new");
  assert.deepEqual(stripPersonal('[research]\nlibrary = ""\n'), "[research]\n# library: set in your personal profile only\n");
});

test("doctor warns when a project's docs/profile.toml holds a library value", () => {
  const dir = tmp("onrails-proj-");
  put(dir, "docs/profile.toml", '[research]\nlibrary = "me/lib"\nlibrary_path = ""\n');
  const log = logger();
  doctor(dir, { log });
  assert.match(log.text(), /✗ docs\/profile\.toml sets \[research\] library, which names your private research library/);
  const clean = tmp("onrails-proj-");
  put(clean, "docs/profile.toml", "[research]\n# library: set in your personal profile only\n");
  const quiet = logger();
  doctor(clean, { log: quiet });
  assert.doesNotMatch(quiet.text(), /private research library/);
});
