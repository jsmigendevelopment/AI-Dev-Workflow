// Tests for the deny set behind `npx onrails lesson check --project` (#322): the project's own terms, from local files
// and local git only. Every fixture is a made-up project in a temp folder, with a made-up home folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "./child.mjs";
import { denySet, projectTerm } from "../src/lesson-deny.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const fs = createRequire(import.meta.url)("node:fs");

// Runs git in dir as a made-up author, with a made-up home so no real git config is read.
function git(dir, args, { name = "Ada Quill", email = "ada@quill.test" } = {}) {
  const env = safeEnv({ HOME: tmp("onrails-gh-"), GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email }, { cwd: dir });
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
}

// A git repo with the given files, committed by author; the remote is set when given.
function repo(files, { remote, author, force = [] } = {}) {
  const dir = tmp("onrails-deny-");
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
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
  const banned = new Set([".env", ".env.local"].map((name) => resolve(dir, name)));
  const opened = [];
  const watch = (name) => {
    const real = fs[name];
    fs[name] = (path, ...rest) => {
      if (typeof path === "string" && banned.has(resolve(dir, path))) opened.push(path);
      return real(path, ...rest);
    };
    return () => { fs[name] = real; };
  };
  const restore = ["readFileSync", "openSync", "createReadStream"].map(watch);
  syncBuiltinESMExports();
  let set;
  try {
    set = terms(dir);
  } finally {
    for (const undo of restore) undo();
    syncBuiltinESMExports();
  }
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
