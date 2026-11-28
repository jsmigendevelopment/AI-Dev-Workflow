// Tests for Dependabot's bumps through own-branch.mjs (#226): a bump passes the local gate with no claim only when
// it changes nothing but dependency versions, in Dependabot's own verified commits. A fake gh answers the API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/own-branch.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const [HEAD, BASE, MERGE_BASE] = ["c", "b", "a"].map((c) => c.repeat(40));
const BOT = "dependabot[bot]";
const BUMP = "dependabot/npm_and_yarn/vite-8.4.0";
const REPO = "repos/acme/app";
const ONLY = /only runs the loop's own branches/;

const MANIFEST = { name: "app", private: true, scripts: { check: "pnpm lint && pnpm test" }, dependencies: { react: "19.2.0" }, devDependencies: { vite: "8.3.0" } };
const BUMPED = { ...MANIFEST, devDependencies: { vite: "8.4.0" } };
const LOCK = "lockfileVersion: '9.0'\npackages:\n  vite@8.3.0:\n    resolution: {integrity: sha512-old}\n";
const LOCK_BUMPED = "lockfileVersion: '9.0'\npackages:\n  vite@8.4.0:\n    resolution: {integrity: sha512-new}\n";
/** npm's lockfile with vite at `v`, its funding URL included; `more` changes vite's entry. */
const npmLock = (v, more = {}) => JSON.stringify({
  name: "app", lockfileVersion: 3, requires: true,
  packages: {
    "": { name: "app", devDependencies: { vite: v } },
    "node_modules/vite": { version: v, resolved: `https://registry.npmjs.org/vite/-/vite-${v}.tgz`, integrity: "sha512-x", dev: true, funding: { url: "https://github.com/sponsors/vitejs" }, ...more },
  },
}, null, 2);
const changed = (...paths) => paths.map((p) => (Array.isArray(p) ? { filename: p[1], previous_filename: p[0], status: "renamed" } : { filename: p, status: "modified" }));
const commit = (sha = HEAD, author = BOT, committer = "web-flow", verified = true) => ({ sha, author: author && { login: author }, committer: committer && { login: committer }, commit: { verification: { verified } } });
const pullOf = ({ sha = HEAD, files = 2, commits = 1, ref = BUMP, from = "acme/app", author = BOT } = {}) => ({
  number: 7, user: author && { login: author }, changed_files: files, commits, base: { sha: BASE }, head: { sha, ref, repo: from && { full_name: from } },
});
const at = (path, sha, text) => ({ [`${REPO}/contents/${path}?ref=${sha}`]: { raw: typeof text === "string" ? text : JSON.stringify(text, null, 2) } });

/**
 * own-branch.mjs on Dependabot's pull request 7 of acme/app. By default it bumps vite in package.json and
 * pnpm-lock.yaml in one verified commit. `before` and `after` map a path to its text (or JSON) at the merge base and
 * the head; `pull` changes the pull request; `api` answers last, so a test can replace any answer.
 */
function bump({ files = changed("package.json", "pnpm-lock.yaml"), commits = [commit()], before = {}, after = {}, pull = {}, api = {} } = {}) {
  const texts = [
    ...Object.entries({ "package.json": MANIFEST, "pnpm-lock.yaml": LOCK, ...before }).map(([p, t]) => at(p, MERGE_BASE, t)),
    ...Object.entries({ "package.json": BUMPED, "pnpm-lock.yaml": LOCK_BUMPED, ...after }).map(([p, t]) => at(p, HEAD, t)),
  ];
  const dir = tmp("onrails-bump-");
  const fake = fakeGh(tmp("onrails-gh-"), Object.assign({ // gh outside the folder it runs in (#274)
    [`${REPO}/pulls/7`]: pullOf({ files: files.length, commits: commits.length, ...pull }),
    [`${REPO}/pulls/7/files`]: files,
    [`${REPO}/pulls/7/commits`]: commits,
    [`${REPO}/compare/${BASE}...${HEAD}`]: { merge_base_commit: { sha: MERGE_BASE } },
  }, ...texts, api));
  return { ...spawnSync(process.execPath, [SCRIPT, "7", "--repo", "acme/app"], { cwd: dir, encoding: "utf8", env: fake.env }), calls: fake.calls() };
}

/** Each case exits 1 with no sha, and names `why` when given. */
function refused(cases, why) {
  for (const [name, more] of Object.entries(cases)) {
    const r = bump(more);
    assert.equal(r.status, 1, `${name}: ${r.stderr}`);
    assert.equal(r.stdout, "", name);
    assert.match(r.stderr, ONLY, name);
    if (why) assert.match(r.stderr, why, name);
  }
}

test("AC-226-1: WHEN a Dependabot pull request only bumps versions in package.json and the lockfile THEN own-branch.mjs exits 0 for it", unixOnly, () => {
  const r = bump();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${HEAD}: ${BUMP} is a Dependabot bump of dependency versions only\n`);
  assert.doesNotMatch(r.calls, /issues\/|collaborators\//, "no claim and no access check for the bot");
  assert.match(r.calls, new RegExp(`contents/package\\.json\\?ref=${MERGE_BASE}`), "the manifest is read at the merge base");
  const cases = {
    "a workspace's manifest": { files: changed("apps/web/package.json"), before: { "apps/web/package.json": MANIFEST }, after: { "apps/web/package.json": BUMPED } },
    "npm's lockfile on the registry": { files: changed("package-lock.json"), before: { "package-lock.json": npmLock("8.3.0") }, after: { "package-lock.json": npmLock("8.4.0") } },
    "pnpm's checksum with a slash, its registry tarball and a dependency named type": {
      after: { "pnpm-lock.yaml": `${LOCK_BUMPED}    resolution: {integrity: sha512-h///Lr5a9rib/v1G==, tarball: https://registry.npmjs.org/vite/-/vite-8.4.0.tgz}\n  d@1.0.2:\n    dependencies:\n      type: 2.7.3\n` },
    },
    "yarn's lockfile on the registry": {
      files: changed("yarn.lock"),
      before: { "yarn.lock": 'vite@^8.3.0:\n  version "8.3.0"\n  resolved "https://registry.yarnpkg.com/vite/-/vite-8.3.0.tgz#a"\n' },
      after: { "yarn.lock": 'vite@^8.4.0:\n  version "8.4.0"\n  resolved "https://registry.yarnpkg.com/vite/-/vite-8.4.0.tgz#b"\n  integrity sha512-a//b+c==\n' },
    },
    "a range and Dependabot's own committer": { commits: [commit(HEAD, BOT, BOT)], after: { "package.json": { ...MANIFEST, devDependencies: { vite: "^8.4.0 || >=9.0.0-rc.1" } } } },
    "a link the merge base already had": { before: { "pnpm-lock.yaml": `${LOCK}  ui@link:../ui:\n` }, after: { "pnpm-lock.yaml": `${LOCK_BUMPED}  ui@link:../ui:\n` } },
  };
  for (const [name, more] of Object.entries(cases)) assert.equal(bump(more).status, 0, `${name}: ${bump(more).stderr}`);
});

test("AC-226-2: WHEN a Dependabot pull request changes any other file, or adds, removes or renames one THEN own-branch.mjs exits 1, with no sha", unixOnly, () => {
  const status = (filename, s) => [{ filename, status: s }];
  refused({
    "a source file too": { files: changed("package.json", "src/app.ts") },
    "the workspace file": { files: changed("pnpm-workspace.yaml") },
    "npm's config": { files: changed(".npmrc") },
    "a workflow": { files: changed(".github/workflows/x.yml") },
    "a look-alike name": { files: changed("package.json.bak", "not-package.json") },
    "a rename into a manifest": { files: changed(["src/app.ts", "package.json"]) },
    "an added manifest": { files: status("apps/new/package.json", "added") },
    "a removed lockfile": { files: status("yarn.lock", "removed") },
    "a manifest in an agent folder": { files: changed(".agents/tools/package.json") },
    "a manifest under .github": { files: changed(".github/package.json") },
    "Bun's binary lockfile": { files: changed("bun.lockb") },
    "no files at all": { files: [] },
  });
  assert.match(bump({ files: changed("package.json", "src/app.ts") }).stderr, /src\/app\.ts/, "it names the file");
  const many = bump({ pull: { files: 3001 } });
  assert.equal(many.status, 1, "more files than GitHub lists can't be checked");
  assert.equal(many.stdout, "");
});

test("AC-226-2: WHEN a bump's package.json changes more than dependency versions THEN own-branch.mjs exits 1, with no sha", unixOnly, () => {
  const manifest = (more) => ({ after: { "package.json": { ...BUMPED, ...more } } });
  const dep = (vite) => manifest({ devDependencies: { vite } });
  refused({
    "a script added": manifest({ scripts: { ...MANIFEST.scripts, postinstall: "node x.js" } }),
    "a script changed": manifest({ scripts: { check: "true" } }),
    "overrides": manifest({ overrides: { vite: "8.4.0" } }),
    "packageManager": manifest({ packageManager: "pnpm@10.0.0" }),
    "bin": manifest({ bin: { app: "x.js" } }),
    "pnpm settings": manifest({ pnpm: { onlyBuiltDependencies: ["x"] } }),
    "a package added": manifest({ dependencies: { react: "19.2.0", leftpad: "1.0.0" } }),
    "a package removed": manifest({ dependencies: {} }),
    "a URL value": dep("https://example.com/vite.tgz"),
    "a git value": dep("git+ssh://git@example.com/vite.git"),
    "a GitHub shorthand": dep("someone/vite"),
    "a file value": dep("file:../vite"),
    "an npm alias": dep("npm:other@1.0.0"),
    "a dist-tag": dep("latest"),
    "a word after the digits": dep("8.4.0abc"),
    "a tarball name": dep("1.tgz"),
    "a tarball name with a prerelease": dep("8.4.0-x.tar.gz"),
    "a tar name in capitals": dep("8.4.0-x.TAR"),
    "not JSON": { after: { "package.json": "{" } },
  });
});

test("AC-226-2: WHEN a bump's lockfile points a new line off the npm registry THEN own-branch.mjs exits 1, with no sha", unixOnly, () => {
  const lock = (line) => ({ after: { "pnpm-lock.yaml": `${LOCK_BUMPED}${line}\n` } });
  refused({
    "a tarball URL": lock("    resolution: {tarball: https://example.com/vite.tgz}"),
    "a git repo": lock("    resolution: {type: git, repo: git+ssh://git@example.com/vite.git, commit: abc}"),
    "a local directory": lock("    resolution: {directory: ../vite, type: directory}"),
    "a file spec": lock("  vite@file:../vite:"),
    "a new link": lock("  ui@link:../ui:"),
    "npm's resolved path": npm(npmLock("8.4.0", { resolved: "packages/x" })),
  }, /npm registry/);
});

/** A bump whose npm lockfile at the head is `text`. */
const npm = (text) => ({ files: changed("package-lock.json"), before: { "package-lock.json": npmLock("8.3.0") }, after: { "package-lock.json": text } });

test("AC-226-2: WHEN a bump's lockfile hides an off-registry source behind an escape, a split line or a URL with no scheme THEN own-branch.mjs exits 1, with no sha", unixOnly, () => {
  const lock = (lines) => ({ after: { "pnpm-lock.yaml": `${LOCK_BUMPED}${lines}\n` } });
  const yarn = (line) => ({ files: changed("yarn.lock"), before: { "yarn.lock": "" }, after: { "yarn.lock": `vite@^8.4.0:\n${line}\n` } });
  const npmText = (from, to) => npm(npmLock("8.4.0").replace(from, to));
  const VITE = '"resolved": "https://registry.npmjs.org/vite/-/vite-8.4.0.tgz"';
  // A backslash, so each escape below reaches the lockfile as the parser reads it.
  const BS = String.fromCharCode(92);
  refused({
    "pnpm: an escaped key": lock(`    resolution: {type: directory, "d${BS}x69rectory": ../vite}`),
    "pnpm: an escaped value": lock(`        version: "link${BS}x3a../vite"`),
    "pnpm: a tarball with no scheme": lock("    resolution: {integrity: sha512-new, tarball: //example.com/vite.tgz}"),
    "pnpm: a relative tarball": lock("    resolution: {integrity: sha512-new, tarball: vite/-/vite-8.4.0.tgz}"),
    "pnpm: a URL with one slash": lock("    resolution: {tarball: https:/example.com/vite.tgz}"),
    "pnpm: a git resolution with no URL": lock("    resolution:\n      type: git\n      repo: git@example.com:x/vite.git\n      commit: abc"),
    "pnpm: explicit keys": lock("    resolution:\n      ? type\n      : directory\n      ? directory\n      : ../vite"),
    "yarn: a resolved path with no quotes": yarn("  resolved ../vite.tgz"),
    "yarn: a workspace": yarn('  resolution: "vite@workspace:packages/vite"'),
    "npm: an escaped key": npmText(VITE, `"${BS}u0072esolved": "../vite.tgz"`),
    "npm: an escaped value": npmText('"version": "8.4.0"', `"version": "file${BS}u003a../vite"`),
    "npm: a resolved with no scheme on its own line": npmText(VITE, '"resolved":\n        "//example.com/vite.tgz"'),
    "npm: a link split across lines": npmText(VITE, `${VITE},\n        "link"\n        : true`),
    "npm: a new package outside node_modules": npm(npmLock("8.4.0").replace('"node_modules/vite"', '"../vite": { "version": "8.4.0" },\n    "node_modules/vite"')),
  }, /npm registry/);
  refused({ "npm: not JSON": npm("{") }, /valid JSON/);
});

test("AC-226-2: WHEN a commit on a bump isn't Dependabot's own and verified THEN own-branch.mjs exits 1, its files' contents not read", unixOnly, () => {
  const extra = "d".repeat(40);
  const cases = {
    "a commit from another login": { commits: [commit("e".repeat(40)), commit(HEAD, "builder", "builder")] },
    "another committer": { commits: [commit(HEAD, BOT, "builder")] },
    "an unverified commit": { commits: [commit(HEAD, BOT, "web-flow", false)] },
    "an author GitHub can't name": { commits: [commit(HEAD, null)] },
  };
  refused(cases, /Not every commit on #7 is Dependabot's/);
  assert.doesNotMatch(bump(cases["a commit from another login"]).calls, /contents\//);
  const r = bump({ commits: [commit(extra), commit()], pull: { commits: 1 } });
  assert.equal(r.status, 2, "a commit list that doesn't match the pull request has no answer");
  assert.equal(r.stdout, "");
});

test("AC-226-2: WHEN a Dependabot pull request's head is in a fork, or isn't Dependabot's branch THEN own-branch.mjs exits 1, its files not read", unixOnly, () => {
  const cases = {
    ...Object.fromEntries(["someone/app", null].map((from) => [`a fork: ${from}`, { pull: { from } }])),
    ...Object.fromEntries(["feat/5-share", "dependabot/", "dependabot/npm_and_yarn/vite;true", "dependabot//vite", "renovate/vite-8.4.0"].map((ref) => [ref, { pull: { ref } }])),
    ...Object.fromEntries(["dependabot", "dependabot-bot"].map((author) => [author, { pull: { author } }])),
  };
  for (const [name, more] of Object.entries(cases)) {
    const r = bump(more);
    assert.equal(r.status, 1, name);
    assert.equal(r.stdout, "", name);
    assert.doesNotMatch(r.calls, /\/files|\/commits|contents\//, name);
  }
});

test("AC-226-2: a read with no answer, a short file list or a moved head exits 2 with no sha", unixOnly, () => {
  const cases = {
    "a short list": { pull: { files: 3 } },
    "a moved head": { api: { [`${REPO}/pulls/7`]: { sequence: [pullOf(), pullOf({ sha: "d".repeat(40) })] } } },
    "no merge base": { api: { [`${REPO}/compare/${BASE}...${HEAD}`]: {} } },
    "a refused contents read": { api: { [`${REPO}/contents/package.json?ref=${HEAD}`]: { ghError: "HTTP 403: rate limit" } } },
    "a refused commits read": { api: { [`${REPO}/pulls/7/commits`]: { ghError: "HTTP 502" } } },
  };
  for (const [name, more] of Object.entries(cases)) {
    const r = bump(more);
    assert.equal(r.status, 2, `${name}: ${r.stderr}`);
    assert.equal(r.stdout, "", name);
  }
});

test("AC-226-3: WHEN dependencies is read THEN it says how a Dependabot bump reaches main on each level", () => {
  const skill = read(".agents/skills/dependencies/SKILL.md");
  const part = skill.slice(skill.indexOf("**Dependabot keeps running"), skill.indexOf("**The kit's default libraries**"));
  for (const level of ["Recommended", "Full", "Custom", "Hands-on"]) assert.match(part, new RegExp(`\\*\\*[^*]*\\b${level}\\b[^*]*\\*\\*`), level);
  assert.match(part, /own-branch\.mjs/);
  assert.match(part, /`no-issue`/);
  assert.match(part, /changes any other file, or comes from a fork/);
  assert.doesNotMatch(part, /labels them `needs-human` today|#226 plans them/);
  const exit0 = read(".agents/skills/coordinate/SKILL.md").split("\n").find((l) => l.trim().startsWith("- Exit 0")) ?? "";
  assert.match(exit0, /`dependabot\[bot\]`/);
  assert.match(exit0, /`no-issue`/);
});

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
  const kept = "\nreplace github.com/acme/lib v1.0.0 => ../lib\n\nexclude github.com/acme/lib v1.2.5\n\nretract v0.1.0 // broken\n\nreplace (\n\tgolang.org/x/text v0.1.0 => ../text\n)\n";
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
