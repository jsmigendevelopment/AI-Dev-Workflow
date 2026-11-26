import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { exists, put, safeEnv, tmp } from "./helpers.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: safeEnv() });

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
  const env = safeEnv({ HOME: home, USERPROFILE: home });
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

test("accounts through the binary is read-only: it never offers to move the old home folder", () => {
  const home = tmp();
  const env = safeEnv({ HOME: home, USERPROFILE: home });
  put(home, ".ai-dev-workflow/profile.toml", '[accounts.work]\nlabel = "Work"\ntool = "claude"\nconfig_dir = "~/.claude-work"\n');
  const r = spawnSync(process.execPath, [CLI, "accounts", tmp()], { encoding: "utf8", env, input: "" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^work: Work · claude · ~\/\.claude-work \(folder not found\)$/m);
  assert.doesNotMatch(r.stdout, /Move it to/);
  assert.match(run("--help").stdout, /accounts \[dir\]/);
});

test("signature through the binary reads its own value flags, and --help lists it", () => {
  const home = tmp(), dir = tmp();
  const env = safeEnv({ HOME: home, USERPROFILE: home });
  put(dir, "docs/profile.toml", '[me.signature]\nname = "Ada Example"\nname_url = "https://example.com"\n');
  const r = spawnSync(process.execPath, [CLI, "signature", "--style", "compact"], { encoding: "utf8", env, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '<p align="center">By <a href="https://example.com"><b>Ada Example</b></a></p>\n');
  assert.match(run("--help").stdout, /signature \[--theme professional\|personal\]/);
});
