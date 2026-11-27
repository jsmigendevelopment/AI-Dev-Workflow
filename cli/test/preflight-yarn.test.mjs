// Preflight runs no package manager's version probe before the repo has been read (#144): a manager can run
// files or a release the repo chose, from the folder, a parent or the home folder. These run the real script with
// only fake package managers on PATH. Each logs every run, so a log with nothing but npm's registry check means
// preflight ran no probe, and each records its environment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPath, put } from "./helpers.mjs";
import { markRead } from "../src/preflight-sys.mjs";
import { project, readProject, temp } from "./preflight-fakes.mjs";

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

const PNPM = JSON.stringify({ packageManager: "pnpm@10.28.0" });
const LAUNCHER = "COREPACK_NPM_REGISTRY=http://127.0.0.1:9\nCOREPACK_INTEGRITY_KEYS=0\n";

// Each fake answers with a version that fits its pin. npm also answers the registry check, which isn't a version probe.
const FAKES = { yarn: ["yarn@1.22.22", "1.22.22"], pnpm: ["pnpm@10.28.0", "10.28.0"], bun: ["bun@1.2.0", "1.2.0"], npm: ["npm@10.9.0", "10.9.0"] };
const REGISTRY = /^npm (config get registry|view )/;
const UNREAD = (pm) => `Node ${process.versions.node} (needs >=22), ${pm} found on PATH, not run: version checked after the repo is read`;

/** A PATH folder with fake package managers that log each run and their environment, a home folder, and a way to run preflight. */
function rig() {
  const bin = temp("onrails-fake-bin-");
  const home = temp("onrails-fake-home-");
  const [log, unsafe, seen] = ["pm-calls", "pm-unsafe", "pm-env"].map((name) => join(bin, name));
  for (const [pm, [, version]] of Object.entries(FAKES)) {
    // Only the shell's own builtins: PATH holds nothing but these fakes.
    const record = `echo "COREPACK_ENV_FILE=\${COREPACK_ENV_FILE-unset}" > '${seen}'`;
    put(bin, pm, `#!/bin/sh\necho "${pm} $*" >> '${log}'\n${record}\n[ "$COREPACK_ENV_FILE" = 0 ] || echo unsafe > '${unsafe}'\necho ${version}\n`);
    chmodSync(join(bin, pm), 0o755);
  }
  const run = (dir) => {
    for (const file of [log, unsafe, seen]) rmSync(file, { force: true });
    const r = spawnSync(process.execPath, [SCRIPT, dir, "--json"], { encoding: "utf8", env: checkPath({ PATH: bin, HOME: home }), timeout: 60000 });
    const versions = JSON.parse(r.stdout).results.find((x) => x.id === "versions");
    const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
    // Anything but npm's registry check is a probe that ran.
    const ran = calls.some((line) => !REGISTRY.test(line));
    return { calls, ran, unsafe: existsSync(unsafe), env: existsSync(seen) ? readFileSync(seen, "utf8") : "", versions };
  };
  return { bin, home, run };
}

test("AC-144-7: WHEN the folder's yarn config names a release in any form yarn reads and the repo isn't read yet THEN preflight runs no yarn", posixOnly, () => {
  const { run } = rig();
  for (const [file, text] of CONFIGS) {
    const { ran, versions } = run(project({ "package.json": YARN1, [file]: text }));
    assert.equal(ran, false, `${file} ${JSON.stringify(text)}: yarn ran`);
    assert.equal(versions.status, "limited", `${file} ${JSON.stringify(text)}`);
    assert.equal(versions.detail, UNREAD("yarn"), `${file} ${JSON.stringify(text)}`);
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

test("AC-144-7: WHEN the repo has been read THEN the fake yarn runs, with or without a yarn config, so the checks above can fail", posixOnly, () => {
  const { run } = rig();
  const plain = run(readProject({ "package.json": YARN1 }));
  assert.equal(plain.ran, true, "no yarn config: yarn --version runs");
  assert.equal(plain.versions.detail, "Node " + process.versions.node + " (needs >=22), yarn 1.22.22");
  const read = run(readProject({ "package.json": YARN1, ".yarnrc.yml": CONFIGS[0][1] }));
  assert.equal(read.ran, true, "marked read: yarn --version runs as before");
});

test("AC-144-7: WHEN a yarn config names a release in the plain form THEN the version comes from its file name, and a missing yarn is found on PATH", posixOnly, () => {
  const { bin, run } = rig();
  const named = run(project({ "package.json": YARN1, ".yarnrc.yml": "yarnPath: .yarn/releases/yarn-1.22.22.cjs\n" }));
  assert.equal(named.ran, false);
  assert.equal(named.versions.status, "limited");
  assert.match(named.versions.detail, /yarn 1\.22\.22 \(from the repo's yarnPath file name, not run\): version checked after the repo is read$/);
  rmSync(join(bin, "yarn"));
  const missing = run(project({ "package.json": YARN1, ".yarnrc.yml": CONFIGS[2][1] }));
  assert.equal(missing.versions.detail, "yarn isn't installed");
});

test("AC-144-7: WHEN preflight runs a package manager's version probe THEN the launcher's per-project settings are switched off for it", posixOnly, () => {
  const { run } = rig();
  for (const pkg of [YARN1, PNPM]) {
    const plain = run(readProject({ "package.json": pkg }));
    assert.equal(plain.ran, true, `${pkg}: the probe runs`);
    assert.equal(plain.unsafe, false, `${pkg}: the settings switch was missing`);
    assert.match(plain.env, /^COREPACK_ENV_FILE=0$/m);
    const read = run(readProject({ "package.json": pkg, ".corepack.env": LAUNCHER }));
    assert.equal(read.ran, true, `${pkg}: marked read, so the probe runs`);
    assert.equal(read.unsafe, false, `${pkg}: the settings switch was missing once the repo is read`);
  }
});

test("AC-144-7: WHEN launcher settings are in the folder or a parent and the repo isn't read yet THEN preflight runs no package manager", posixOnly, () => {
  const { run } = rig();
  for (const pkg of [YARN1, PNPM]) {
    const here = run(project({ "package.json": pkg, ".corepack.env": LAUNCHER }));
    assert.equal(here.ran, false, `${pkg}: settings in the folder`);
    assert.equal(here.versions.status, "limited");
    assert.equal(here.versions.detail, UNREAD(JSON.parse(pkg).packageManager.split("@")[0]));
    const parent = project({ ".corepack.env": LAUNCHER, "app/package.json": pkg });
    assert.equal(run(join(parent, "app")).ran, false, `${pkg}: settings in a parent folder`);
  }
});

test("AC-144-7: WHEN the folder is opened through a symlink and its real repo root holds a yarn config or launcher settings THEN preflight runs no package manager", posixOnly, () => {
  const { run } = rig();
  const linked = (files, marked = false) => {
    const real = project(files);
    if (marked) mkdirSync(join(real, "app", ".git"));
    if (marked) markRead(join(real, "app"));
    const links = temp("onrails-links-");
    symlinkSync(join(real, "app"), join(links, "app"));
    return run(join(links, "app"));
  };
  for (const [pkg, file, text] of [[YARN1, ".yarnrc.yml", "yarnPath: ./evil.js\n"], [YARN1, ".corepack.env", LAUNCHER], [PNPM, ".corepack.env", LAUNCHER]]) {
    const r = linked({ [file]: text, "app/package.json": pkg });
    assert.equal(r.ran, false, `${pkg} with ${file} at the real root: a package manager ran`);
    assert.equal(r.versions.status, "limited");
  }
  // The control: the same link once the repo has been read runs the probe.
  assert.equal(linked({ "app/package.json": YARN1 }, true).ran, true);
});

test("AC-144-7: WHEN the repo isn't read yet and has no config files at all THEN preflight runs no package manager's version probe", posixOnly, () => {
  const { run } = rig();
  for (const [pm, [pin]] of Object.entries(FAKES)) {
    const { calls, versions } = run(project({ "package.json": JSON.stringify({ packageManager: pin }) }));
    assert.deepEqual(calls.filter((line) => !REGISTRY.test(line)), [], `${pm}: a probe ran`);
    assert.equal(versions.status, "limited", pm);
    assert.equal(versions.detail, UNREAD(pm));
  }
});

test("AC-144-7: WHEN the repo is marked read THEN every package manager's version probe runs, so the check above can fail", posixOnly, () => {
  const { run } = rig();
  for (const [pm, [pin, version]] of Object.entries(FAKES)) {
    const { calls, versions } = run(readProject({ "package.json": JSON.stringify({ packageManager: pin }) }));
    assert.ok(calls.includes(`${pm} --version`), `${pm}: ran ${calls.join(" | ")}`);
    assert.equal(versions.status, "ok", pm);
    assert.equal(versions.detail, `Node ${process.versions.node} (needs >=22), ${pm} ${version}`);
  }
});
