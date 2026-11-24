import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { exists, tmp } from "./helpers.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("--version prints the package version", () => {
  const r = run("--version");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), version);
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
  assert.ok(exists(dir, ".onrails.json"));
});

test("profile and doctor --fix through the binary, with a temp home and piped answers", () => {
  const home = tmp();
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const show = spawnSync(process.execPath, [CLI, "profile", "show"], { encoding: "utf8", env });
  assert.equal(show.status, 1);
  const made = spawnSync(process.execPath, [CLI, "profile", "init"], { encoding: "utf8", env, input: "octo\nteam\n" });
  assert.equal(made.status, 0, made.stderr);
  assert.ok(exists(home, ".onrails/profile.toml"));
  const shown = spawnSync(process.execPath, [CLI, "profile", "show"], { encoding: "utf8", env });
  assert.match(shown.stdout, /github_owner = "octo"/);
  assert.match(shown.stdout, /github_plan = "team"/);

  const dry = run("doctor", tmp(), "--fix", "--dry-run");
  assert.ok(dry.status === 0 || dry.status === 1, dry.stderr);
  assert.match(dry.stdout, /Fix plan \(dry run|Nothing doctor can fix/);
  assert.equal(run("profile", "nope").status, 2);
});
