// Preflight runs no yarn before the repo has been read (#144): yarn reads its config from the folder, every
// parent and the home folder, and runs the release that config names. These run the real script with only a
// fake yarn on PATH. It writes a marker file whenever it runs, so "no marker" means preflight ran no yarn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "./helpers.mjs";
import { project, temp } from "./preflight-fakes.mjs";

const SCRIPT = fileURLToPath(new URL("../src/preflight.mjs", import.meta.url));
const YARN1 = JSON.stringify({ packageManager: "yarn@1.22.22" });
const posixOnly = { skip: process.platform === "win32" ? "the fake yarn is a POSIX shell script" : false };

// Config files in the shapes yarn accepts that a line match can miss. Each names ./evil.js as the yarn to run.
const CONFIGS = [
  [".yarnrc.yml", '"yarnPath": ./evil.js\n'],
  [".yarnrc.yml", "yarnPath : ./evil.js\n"],
  [".yarnrc.yml", "{yarnPath: ./evil.js}\n"],
  [".yarnrc.yml", "  yarnPath: ./evil.js\n"],
  [".yarnrc.yml", "﻿yarnPath: ./evil.js\n"],
  [".yarnrc", '"yarn-path" "./evil.js"\n'],
  [".yarnrc", "yarn-path: ./evil.js\n"],
  [".yarnrc", "  yarn-path ./evil.js\n"],
  [".yarnrc", "yarnPath ./evil.js\n"],
];

/** A PATH folder with a fake yarn that leaves a marker, a home folder, and a way to run preflight with both. */
function rig() {
  const bin = temp("onrails-fake-bin-");
  const home = temp("onrails-fake-home-");
  const marker = join(bin, "yarn-ran");
  put(bin, "yarn", `#!/bin/sh\necho ran > '${marker}'\necho 1.22.22\n`);
  chmodSync(join(bin, "yarn"), 0o755);
  const run = (dir) => {
    rmSync(marker, { force: true });
    const r = spawnSync(process.execPath, [SCRIPT, dir, "--json"], { encoding: "utf8", env: { PATH: bin, HOME: home }, timeout: 60000 });
    const versions = JSON.parse(r.stdout).results.find((x) => x.id === "versions");
    return { ran: existsSync(marker), versions };
  };
  return { bin, home, run };
}

test("AC-144-7: WHEN the folder's yarn config names a release in any form yarn reads and the repo isn't read yet THEN preflight runs no yarn", posixOnly, () => {
  const { run } = rig();
  for (const [file, text] of CONFIGS) {
    const { ran, versions } = run(project({ "package.json": YARN1, [file]: text }));
    assert.equal(ran, false, `${file} ${JSON.stringify(text)}: yarn ran`);
    assert.equal(versions.status, "limited", `${file} ${JSON.stringify(text)}`);
    assert.match(versions.detail, /preflight runs none before the repo is read/);
  }
});

test("AC-144-7: WHEN a yarn config is only in a parent folder or the home folder THEN preflight runs no yarn there either", posixOnly, () => {
  const { home, run } = rig();
  const parent = project({ ".yarnrc.yml": "yarnPath: ./evil.js\n" });
  mkdirSync(join(parent, "app"));
  put(parent, "app/package.json", YARN1);
  assert.equal(run(join(parent, "app")).ran, false, "a parent folder's config");
  put(home, ".yarnrc", "yarn-path ./evil.js\n");
  assert.equal(run(project({ "package.json": YARN1 })).ran, false, "the home folder's config");
});

test("AC-144-7: WHEN no yarn config is anywhere, or the repo has been read THEN the fake yarn runs, so the checks above can fail", posixOnly, () => {
  const { run } = rig();
  const plain = run(project({ "package.json": YARN1 }));
  assert.equal(plain.ran, true, "no yarn config: yarn --version runs");
  assert.equal(plain.versions.detail, "Node " + process.versions.node + " (needs >=22), yarn 1.22.22");
  const read = run(project({ "package.json": YARN1, ".yarnrc.yml": CONFIGS[0][1], "docs/state.md": "# State\n" }));
  assert.equal(read.ran, true, "docs/state.md exists: yarn --version runs as before");
});

test("AC-144-7: WHEN a yarn config names a release in the plain form THEN the version comes from its file name, and a missing yarn is found on PATH", posixOnly, () => {
  const { bin, run } = rig();
  const named = run(project({ "package.json": YARN1, ".yarnrc.yml": "yarnPath: .yarn/releases/yarn-1.22.22.cjs\n" }));
  assert.equal(named.ran, false);
  assert.equal(named.versions.status, "ok");
  assert.match(named.versions.detail, /yarn 1\.22\.22 \(the repo's own release, not run before the repo is read\)$/);
  rmSync(join(bin, "yarn"));
  const missing = run(project({ "package.json": YARN1, ".yarnrc.yml": CONFIGS[2][1] }));
  assert.equal(missing.versions.detail, "yarn isn't installed");
});
