import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exists, tmp } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("--version prints the package version", () => {
  const r = run("--version");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "0.3.0");
});

test("--help and no arguments print usage", () => {
  for (const r of [run("--help"), run()]) {
    assert.equal(r.status, 0);
    assert.match(r.stdout, /init \[dir\]/);
  }
});

test("unknown command or option exits 2", () => {
  assert.equal(run("frobnicate").status, 2);
  assert.equal(run("init", "--nope").status, 2);
});

test("init through the binary installs the kit", () => {
  const dir = tmp();
  const r = run("init", dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(exists(dir, ".ai-dev-workflow.json"));
});
