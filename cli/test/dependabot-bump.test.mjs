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
