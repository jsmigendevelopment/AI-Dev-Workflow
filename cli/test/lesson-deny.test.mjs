// Tests for the deny set behind `npx onrails lesson check --project` (#322): the project's own terms, from local files
// and local git only. Every fixture is a made-up project in a temp folder, with a made-up home folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { denySet, projectTerm } from "../src/lesson-deny.mjs";
import { hash } from "../src/files.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";
import { watchOpens } from "./watch-opens.mjs";

const fs = createRequire(import.meta.url)("node:fs");
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const unixLinks = { skip: process.platform === "win32" ? "symlinks need extra rights on Windows" : false };

// Runs git in dir as a made-up author, with a made-up home so no real git config is read.
function git(dir, args, { name = "Ada Quill", email = "ada@quill.test" } = {}) {
  const env = safeEnv({ HOME: tmp("onrails-gh-"), GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email }, { cwd: dir });
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
}

// A git repo with the given files and symlinks (path to target), committed by author; the remote is set when given.
function repo(files, { remote, author, force = [], links = {} } = {}) {
  const dir = tmp("onrails-deny-");
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  for (const [path, target] of Object.entries(links)) {
    fs.mkdirSync(dirname(join(dir, path)), { recursive: true });
    fs.symlinkSync(target, join(dir, path));
  }
  git(dir, ["init", "-q"]);
  if (remote) git(dir, ["remote", "add", "origin", remote]);
  git(dir, ["add", "-A"]);
  if (force.length) git(dir, ["add", "-f", ...force]);
  git(dir, ["commit", "-q", "-m", "start"], author);
  return dir;
}

const terms = (dir, options = {}) => denySet(dir, { home: tmp("onrails-home-"), ...options });
const kindOf = (set, term) => set.get(term) ?? null;

test("denySet: the git remote's owner and repo, and every package.json name", () => {
  const dir = repo({
    "package.json": JSON.stringify({ name: "harbor-lamp" }),
    "packages/web/package.json": JSON.stringify({ name: "@quiet-otter/lamp-web" }),
  }, { remote: "git@github.com:quiet-otter/harbor-lamp.git" });
  const set = terms(dir);
  assert.equal(kindOf(set, "quiet-otter"), "git remote");
  assert.equal(kindOf(set, "harbor-lamp"), "git remote");
  assert.equal(kindOf(set, "otter"), "git remote");
  assert.equal(kindOf(set, "lamp-web"), "package name");
  assert.equal(kindOf(set, "web"), "package name");
});

test("denySet: capitalised names and title words in the docs, never a sentence's first word", () => {
  const dir = repo({
    "docs/vision.md": "# Lantern Hollow\n\nThe app keeps every Invoice in one place.\n",
    "docs/mvp.md": "# Scope\n\nShips with Pebble checkout.\n",
    "docs/decisions.md": "| 1 | Agreed with Marlo on the plan: (1) Then ship, b) Wait, said \"Hold on\". |\n",
    "docs/decisions/12-1.md": "# Decisions Pricing\n\n- **Why:** Wren asked for it, said Tamsin.\n",
  });
  const set = terms(dir);
  for (const term of ["lantern", "hollow", "invoice", "scope", "pricing", "pebble", "marlo", "tamsin"]) {
    assert.equal(kindOf(set, term), "docs", term);
  }
  for (const term of ["the", "ships", "agreed", "wren", "decisions", "then", "wait", "hold"]) assert.equal(kindOf(set, term), null, term);
});

test("denySet: [me] name and GitHub owner from docs/profile.toml, else from the home folder's profile", () => {
  const profile = (name, owner) => `[me]\nname = "${name}"\ngithub_owner = "${owner}"\n\n[me.signature]\nname = "Signed Only"\n`;
  const dir = repo({ "docs/profile.toml": profile("Odile Brask", "brask-works") });
  const set = terms(dir);
  for (const term of ["odile", "brask", "brask-works", "works"]) assert.equal(kindOf(set, term), "profile", term);
  assert.equal(kindOf(set, "signed"), null);
  const home = tmp("onrails-home-");
  put(home, ".onrails/profile.toml", profile("Pim Varga", "varga-dev"));
  const fallback = denySet(repo({ "a.txt": "x\n" }), { home });
  assert.equal(kindOf(fallback, "varga"), "profile");
  assert.equal(kindOf(fallback, "varga-dev"), "profile");
});

test("denySet: git log author names, and each email's local part and domain", () => {
  const dir = repo({ "a.txt": "x\n" }, { author: { name: "Juno Castellan", email: "juno.c@fernway.dev" } });
  git(dir, ["commit", "-q", "--allow-empty", "-m", "bump"], { name: "dependabot[bot]", email: "bot@example.com" });
  const set = terms(dir);
  for (const term of ["juno", "castellan", "juno.c", "fernway", "fernway.dev"]) {
    assert.equal(kindOf(set, term), "git author", term);
  }
  assert.equal(kindOf(set, "dependabot"), null);
});

test("denySet: domains in tracked files, and variable names in .env.example", () => {
  const dir = repo({
    "src/api.ts": 'export const BASE = "https://api.tidewell.io/v1";\nconst help = "ops@saltmarsh.co.uk";\n',
    "src/docs.ts": 'const demo = "https://shop.example.com";\n',
    ".env.example": "TIDEWELL_API_KEY=\nexport SALT_MODE=on\n# NOT_A_NAME=1\n",
  });
  const set = terms(dir);
  assert.equal(kindOf(set, "tidewell"), "domain");
  assert.equal(kindOf(set, "saltmarsh"), "domain");
  assert.equal(kindOf(set, "example"), null);
  assert.equal(kindOf(set, "tidewell-api-key"), "env name");
  assert.equal(kindOf(set, "salt-mode"), "env name");
  assert.equal(kindOf(set, "not-a-name"), null);
});

test("denySet: a folder that isn't a git repo still gives its docs, and no error", () => {
  const dir = tmp("onrails-deny-");
  put(dir, "package.json", JSON.stringify({ name: "copperleaf" }));
  const set = terms(dir);
  assert.equal(kindOf(set, "copperleaf"), "package name");
});

test("AC-322-5: WHEN the fixture has .env and .env.local files THEN denySet never opens them", () => {
  const dir = repo({
    ".env": "PRIVATE_ONLY=https://envonly-host.io\n",
    ".env.local": "LOCAL_ONLY=https://localonly-host.io\n",
    ".gitignore": ".env\n.env.local\n",
    ".env.example": "PUBLIC_NAME=\n",
  }, { force: [".env", ".env.local"] });
  const { set, opened } = watchOpens([".env", ".env.local"].map((name) => resolve(dir, name)), () => terms(dir));
  assert.deepEqual(opened, []);
  for (const term of ["envonly-host", "localonly-host", "private-only", "local-only"]) assert.equal(kindOf(set, term), null);
  assert.equal(kindOf(set, "public-name"), "env name");
});

test("projectTerm: whole-word and case-blind, never part of a longer word", () => {
  const set = new Map([["garden", "git remote"], ["market-signal-token", "env name"]]);
  assert.equal(projectTerm("The GARDEN check failed.", set), "git remote");
  assert.equal(projectTerm("Ask about garden-web first.", set), "git remote");
  assert.equal(projectTerm("The gardener checked it.", set), null);
  assert.equal(projectTerm("Lost MARKET_SIGNAL_TOKEN on the branch.", set), "env name");
  assert.equal(projectTerm("Nothing here.", new Map()), null);
});

test("denySet: kit words leave the set, other common words stay", () => {
  const dir = repo({ "package.json": JSON.stringify({ name: "review-garden" }) }, { remote: "https://github.com/back/review.git" });
  const set = terms(dir, { kitWords: new Set(["review", "back"]) });
  assert.equal(kindOf(set, "review"), null);
  assert.equal(kindOf(set, "back"), null);
  assert.equal(kindOf(set, "garden"), "package name");
  assert.equal(kindOf(set, "review-garden"), "package name");
});

test("denySet: a camelCase name gives each part, and the parts joined by a hyphen and by a space", () => {
  const dir = repo({ "package.json": JSON.stringify({ name: "Tide4Lamp" }) }, { remote: "https://github.com/quiet-otter/ReviewGate.git" });
  const set = terms(dir, { kitWords: new Set(["review", "gate"]) });
  for (const term of ["reviewgate", "review-gate", "review gate"]) assert.equal(kindOf(set, term), "git remote", term);
  for (const term of ["tide4lamp", "tide", "lamp", "tide-4-lamp", "tide 4 lamp"]) assert.equal(kindOf(set, term), "package name", term);
  assert.equal(kindOf(set, "review"), null);
  assert.equal(projectTerm("The review  gate check failed.", set), "git remote");
  assert.equal(projectTerm("Ask about review-gate first.", set), "git remote");
  assert.equal(projectTerm("The review waited at the gate.", set), null);
});

test("projectTerm: a term matches its plural, and a plural term matches its singular", () => {
  const set = new Map([["notes", "git remote"], ["grant", "docs"], ["orders", "docs"], ["box", "domain"], ["classes", "docs"]]);
  assert.equal(projectTerm("The note check failed.", set), "git remote");
  assert.equal(projectTerm("The NOTES check failed.", set), "git remote");
  assert.equal(projectTerm("Ask about the grants first.", set), "docs");
  assert.equal(projectTerm("One order was lost.", set), "docs");
  assert.equal(projectTerm("Two boxes moved.", set), "domain");
  assert.equal(projectTerm("The class moved.", set), "docs");
  for (const text of ["It was noted.", "Not now.", "The grantee asked.", "The orderly queue."]) assert.equal(projectTerm(text, set), null, text);
});

test("denySet: a term whose singular or plural is a kit word leaves the set", () => {
  const dir = repo({ "package.json": JSON.stringify({ name: "builds" }) }, { remote: "https://github.com/quiet-otter/reviews.git" });
  const set = terms(dir, { kitWords: new Set(["build", "review", "reviews"]) });
  assert.equal(kindOf(set, "builds"), null);
  assert.equal(kindOf(set, "reviews"), null);
  assert.equal(projectTerm("The builds and reviews waited on the build review.", set), null);
});

test("denySet: a tracked link to .env, or from another file into .env, is never followed", unixLinks, () => {
  const dir = repo({ ".env": "RIVER_ONLY=https://envlink-host.io\n", ".gitignore": ".env\n" },
    { links: { ".env.example": ".env", "config/settings.txt": "../.env" } });
  const { set, opened } = watchOpens([resolve(dir, ".env")], () => terms(dir));
  assert.deepEqual(opened, []);
  for (const term of ["river-only", "envlink-host", "envlink-host.io"]) assert.equal(kindOf(set, term), null, term);
});

test("denySet: a link that leaves the project is never followed, and a link inside it is", unixLinks, () => {
  const outside = tmp("onrails-outside-");
  put(outside, "vision.md", "# Outsider Plume\n");
  put(outside, "links.md", "See https://farhost-plume.dev for more.\n");
  put(outside, "decisions/9-1.md", "# Distant Quarry\n");
  const dir = repo({ "notes/mvp-source.md": "# Inside Lumen\n" }, { links: {
    "docs/vision.md": join(outside, "vision.md"), "src/links.md": join(outside, "links.md"),
    "docs/decisions": join(outside, "decisions"), "docs/mvp.md": "../notes/mvp-source.md",
  } });
  const set = terms(dir);
  for (const term of ["outsider", "plume", "farhost-plume", "distant", "quarry"]) assert.equal(kindOf(set, term), null, term);
  for (const term of ["inside", "lumen"]) assert.equal(kindOf(set, term), "docs", term);
});

test("denySet: the home folder's profile is read through a link to a dotfiles folder, a link to a device is not", unixLinks, () => {
  const dotfiles = tmp("onrails-dotfiles-");
  put(dotfiles, "profile.toml", `[me]\nname = "Ines Corvo"\ngithub_owner = "corvo-lab"\n`);
  const home = tmp("onrails-home-");
  fs.mkdirSync(join(home, ".onrails"));
  fs.symlinkSync(join(dotfiles, "profile.toml"), join(home, ".onrails/profile.toml"));
  const project = repo({ "a.txt": "x\n" });
  assert.equal(kindOf(denySet(project, { home }), "corvo"), "profile");
  const devHome = tmp("onrails-home-");
  fs.mkdirSync(join(devHome, ".onrails"));
  fs.symlinkSync("/dev/zero", join(devHome, ".onrails/profile.toml"));
  const { opened } = watchOpens(["/dev/zero"], () => denySet(project, { home: devHome }));
  assert.deepEqual(opened, []);
});

test("denySet: a tracked link to a device is skipped at once and never opened", unixLinks, () => {
  const folder = tmp("onrails-lesson-");
  put(folder, "lesson.json", JSON.stringify({ lesson: "x" }));
  const dir = repo({ "docs/vision.md": "# Pebble\n" }, { links: { "zero.txt": "/dev/zero", "docs/mvp.md": "/dev/zero" } });
  // The CLI first, in a child with a time limit: a read of the device would never end.
  const r = spawnSync(process.execPath, [CLI, "lesson", "check", join(folder, "lesson.json"), "--project", dir],
    { encoding: "utf8", env: safeEnv({ HOME: folder, USERPROFILE: folder }), timeout: 20000 });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^Lesson refused:/);
  const started = Date.now();
  const { set, opened } = watchOpens(["/dev/zero"], () => terms(dir));
  assert.deepEqual(opened, []);
  assert.equal(kindOf(set, "pebble"), "docs");
  assert.ok(Date.now() - started < 5000, "finished fast");
});

test("denySet: an example label is reserved, and a host only in a file the kit ships unchanged is skipped", () => {
  const kitText = "Docs: https://docs.kitonly-host.dev and https://shared-host.dev\n";
  const dir = repo({
    ".agents/skills/demo/SKILL.md": kitText,
    ".claude/settings.json": `{"note": "https://edited-host.dev"}\n`,
    "src/api.ts": 'const a = "https://shared-host.dev";\nconst b = "https://app.example.workers.dev";\n',
  });
  const kitFiles = { ".agents/skills/demo/SKILL.md": hash(Buffer.from(kitText)), ".claude/settings.json": "0".repeat(64) };
  const set = terms(dir, { kitFiles });
  for (const term of ["kitonly-host", "example", "workers", "example.workers.dev"]) assert.equal(kindOf(set, term), null, term);
  assert.equal(kindOf(set, "shared-host"), "domain");
  assert.equal(kindOf(set, "edited-host"), "domain");
});

test("AC-392-3: WHEN a doc is over 1 MB THEN it adds nothing, and a doc just under the cap still does", () => {
  const dir = repo({ "docs/vision.md": `# Bramblecot\n${"x\n".repeat(512 * 1024)}`,
    "docs/mvp.md": `# Quillfern\n${"x\n".repeat(500 * 1024)}` });
  const set = terms(dir);
  assert.equal(kindOf(set, "bramblecot"), null);
  assert.equal(kindOf(set, "quillfern"), "docs");
});

test("AC-392-3: WHEN a doc inside the project is a named pipe THEN it is skipped at once and never opened", unixLinks, () => {
  const dir = repo({ "docs/mvp.md": "# Pebble\n" }, { links: { "docs/decisions.md": "vision.md" } });
  const fifo = join(dir, "docs/vision.md");
  const folder = tmp("onrails-lesson-");
  const env = safeEnv({ HOME: folder, USERPROFILE: folder });
  assert.equal(spawnSync("mkfifo", [fifo], { env }).status, 0);
  put(folder, "lesson.json", JSON.stringify({ lesson: "x" }));
  // The CLI first, in a child with a time limit: opening a pipe that has no writer waits for one.
  const r = spawnSync(process.execPath, [CLI, "lesson", "check", join(folder, "lesson.json"), "--project", dir],
    { encoding: "utf8", env, timeout: 20000 });
  assert.equal(r.signal, null, "the check waited on the pipe");
  assert.equal(r.status, 1, r.stderr);
  const { set, opened } = watchOpens([fifo], () => terms(dir));
  assert.deepEqual(opened, []);
  assert.equal(kindOf(set, "pebble"), "docs");
});

test("AC-392-4: WHEN a tracked .envrc or .env-local holds a host THEN it adds nothing and is never opened", () => {
  const dir = repo({
    ".envrc": "export RC_ONLY=https://envrc-host.io\n",
    ".env-local": "DASH_ONLY=https://dashlocal-host.io\n",
    "config/.envrc.private": "PRIVATE_RC=https://rcprivate-host.io\n",
    ".env.example": "PUBLIC_NAME=\n",
  });
  const banned = [".envrc", ".env-local", "config/.envrc.private"].map((name) => resolve(dir, name));
  const { set, opened } = watchOpens(banned, () => terms(dir));
  assert.deepEqual(opened, []);
  for (const term of ["envrc-host", "dashlocal-host", "rcprivate-host", "rc-only", "dash-only"]) assert.equal(kindOf(set, term), null, term);
  assert.equal(kindOf(set, "public-name"), "env name");
});
