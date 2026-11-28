// Shared by the Dependabot bump tests (#226, #531, #581): a fake gh that answers the API for Dependabot's pull request 7 of
// acme/app, and own-branch.mjs run against it. Moved out of dependabot-bump.test.mjs so the npm and Go cases each have a file.
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fakeGh, tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/own-branch.mjs", import.meta.url));
export const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
export const [HEAD, BASE, MERGE_BASE] = ["c", "b", "a"].map((c) => c.repeat(40));
export const BOT = "dependabot[bot]";
export const BUMP = "dependabot/npm_and_yarn/vite-8.4.0";
export const REPO = "repos/acme/app";
export const ONLY = /only runs the loop's own branches/;

export const MANIFEST = { name: "app", private: true, scripts: { check: "pnpm lint && pnpm test" }, dependencies: { react: "19.2.0" }, devDependencies: { vite: "8.3.0" } };
export const BUMPED = { ...MANIFEST, devDependencies: { vite: "8.4.0" } };
export const LOCK = "lockfileVersion: '9.0'\npackages:\n  vite@8.3.0:\n    resolution: {integrity: sha512-old}\n";
export const LOCK_BUMPED = "lockfileVersion: '9.0'\npackages:\n  vite@8.4.0:\n    resolution: {integrity: sha512-new}\n";
/** npm's lockfile with vite at `v`, its funding URL included; `more` changes vite's entry. */
export const npmLock = (v, more = {}) => JSON.stringify({
  name: "app", lockfileVersion: 3, requires: true,
  packages: {
    "": { name: "app", devDependencies: { vite: v } },
    "node_modules/vite": { version: v, resolved: `https://registry.npmjs.org/vite/-/vite-${v}.tgz`, integrity: "sha512-x", dev: true, funding: { url: "https://github.com/sponsors/vitejs" }, ...more },
  },
}, null, 2);
export const changed = (...paths) => paths.map((p) => (Array.isArray(p) ? { filename: p[1], previous_filename: p[0], status: "renamed" } : { filename: p, status: "modified" }));
export const commit = (sha = HEAD, author = BOT, committer = "web-flow", verified = true) => ({ sha, author: author && { login: author }, committer: committer && { login: committer }, commit: { verification: { verified } } });
export const pullOf = ({ sha = HEAD, files = 2, commits = 1, ref = BUMP, from = "acme/app", author = BOT } = {}) => ({
  number: 7, user: author && { login: author }, changed_files: files, commits, base: { sha: BASE }, head: { sha, ref, repo: from && { full_name: from } },
});
export const at = (path, sha, text) => ({ [`${REPO}/contents/${path}?ref=${sha}`]: { raw: typeof text === "string" ? text : JSON.stringify(text, null, 2) } });

/**
 * own-branch.mjs on Dependabot's pull request 7 of acme/app. By default it bumps vite in package.json and
 * pnpm-lock.yaml in one verified commit. `before` and `after` map a path to its text (or JSON) at the merge base and
 * the head; `pull` changes the pull request; `api` answers last, so a test can replace any answer.
 */
export function bump({ files = changed("package.json", "pnpm-lock.yaml"), commits = [commit()], before = {}, after = {}, pull = {}, api = {} } = {}) {
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
export function refused(cases, why) {
  for (const [name, more] of Object.entries(cases)) {
    const r = bump(more);
    assert.equal(r.status, 1, `${name}: ${r.stderr}`);
    assert.equal(r.stdout, "", name);
    assert.match(r.stderr, ONLY, name);
    if (why) assert.match(r.stderr, why, name);
  }
}
