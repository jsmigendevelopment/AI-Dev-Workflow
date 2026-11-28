// Tests for which files the lesson deny set opens and which kit words leave it (#410, on #322 and #392). Every fixture
// is a made-up project in a temp folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { denySet, packTerms } from "../src/lesson-deny.mjs";
import { loadKit } from "../src/kit.mjs";
import { small } from "./lesson-fixture.mjs";
import { tmp } from "./helpers.mjs";
import { watchOpens } from "./watch-opens.mjs";

const terms = (dir, options = {}) => denySet(dir, { home: tmp("onrails-home-"), ...options });

test("AC-410-5: WHEN a tracked file is .env_local, prod.env, .ENV, .Envrc or in .env.d/ or .envrc.d/ THEN it is never opened", () => {
  const secret = {
    ".env_local": "export UNDER_ONLY=https://underlocal-host.io\n",
    "config/prod.env": "PROD_ONLY=https://prodenv-host.io\n",
    ".ENV": "UPPER_ONLY=https://upperenv-host.io\n",
    ".Envrc": "export MIXED_ONLY=https://mixedrc-host.io\n",
    ".env.d/app.txt": "DIR_ONLY=https://envdir-host.io\n",
    "tools/.envrc.d/app.sh": "export RCDIR_ONLY=https://rcdir-host.io\n",
  };
  // Look-alikes are plain files: their hosts still count.
  const plain = { "src/envoy.ts": 'const a = "https://envoy-host.io";\n', ".environment": "https://environ-host.io\n" };
  const dir = small("cedar", { ...secret, ...plain, ".env.example": "PUBLIC_NAME=\n" });
  const banned = Object.keys(secret).map((name) => resolve(dir, name));
  const { set, opened } = watchOpens(banned, () => terms(dir));
  assert.deepEqual(opened, []);
  for (const term of ["underlocal-host", "prodenv-host", "upperenv-host", "mixedrc-host", "envdir-host", "rcdir-host",
    "under-only", "prod-only", "upper-only", "mixed-only", "dir-only", "rcdir-only"]) {
    assert.equal(set.get(term) ?? null, null, term);
  }
  for (const term of ["envoy-host", "environ-host"]) assert.equal(set.get(term), "domain", term);
  assert.equal(set.get("public-name"), "env name");
});

test("packTerms: the bundled packs' own .env.example names and hosts, and a project's name beside them stays its own", () => {
  const packs = packTerms(loadKit());
  for (const name of ["SECURITY_CONTACT", "CLERK_SECRET_KEY", "TURNSTILE_SITE_KEY"]) assert.ok(packs.envNames.has(name), name);
  assert.ok(packs.hosts.has("accounts.dev"));
  // A host that only looks like a pack's (a deeper name, another top level) is not skipped.
  const dir = small("cedar", { ".env.example": "SECURITY_CONTACT=\nHARBOR_TOKEN=\n",
    "src/a.ts": 'const a = "https://accounts.dev/";\nconst b = "https://my.accounts.dev";\nconst c = "https://accounts.dev.io";\n' });
  const set = terms(dir, { packs });
  assert.equal(set.get("security-contact") ?? null, null);
  assert.equal(set.get("harbor-token"), "env name");
  assert.equal(set.get("my.accounts.dev"), "domain");
  assert.equal(set.get("accounts.dev.io"), "domain");
});

// One kit word at a time, so each way of reading a term in the other number is the only thing that can drop it.
test("AC-410-6: WHEN the kit holds only one form of a project's term THEN the term leaves the set, for each form", () => {
  const cases = [["review", "reviews"], ["box", "boxes"], ["reviews", "review"], ["party", "parties"], ["parties", "party"],
    ["movies", "movie"], ["garden", "garden"]];
  for (const [term, kit] of cases) {
    const dir = small("cedar", { "package.json": JSON.stringify({ name: term }) });
    assert.equal(terms(dir, { kitWords: new Set() }).get(term), "package name", `${term} is a project term without the kit word`);
    assert.equal(terms(dir, { kitWords: new Set([kit]) }).get(term) ?? null, null, `${term} with the kit word ${kit}`);
  }
});
