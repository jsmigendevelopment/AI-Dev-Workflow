import { test } from "node:test";
import assert from "node:assert/strict";
import { addPack, listPacks } from "../src/add.mjs";
import { exists, logger, put, read, tmp } from "./helpers.mjs";

test("add --list names the bundled packs", () => {
  const log = logger();
  assert.equal(listPacks({ log }), 0);
  assert.match(log.text(), /tanstack-start/);
});

test("add tanstack-start copies the pack, dotfiles included, and prints next steps", () => {
  const dir = tmp();
  const log = logger();
  assert.equal(addPack("tanstack-start", dir, { log }), 0);
  for (const path of ["package.json", "wrangler.jsonc", "src/router.tsx", ".gitignore", ".env.example", ".github/workflows/ci.yml"]) {
    assert.ok(exists(dir, path), path);
  }
  assert.ok(!exists(dir, "node_modules"));
  assert.match(read(dir, ".gitignore"), /node_modules/);
  assert.match(log.text(), /pnpm install/);
  assert.match(log.text(), /pnpm check/);
});

test("add skips files you already have unless --force", () => {
  const dir = tmp();
  put(dir, "README.md", "my readme\n");
  const log = logger();
  addPack("tanstack-start", dir, { log });
  assert.equal(read(dir, "README.md"), "my readme\n");
  assert.match(log.text(), /Skipped 1 file/);
  assert.match(log.text(), /README\.md/);

  assert.equal(addPack("tanstack-start", dir, { force: true, log: logger() }), 0);
  assert.match(read(dir, "README.md"), /TanStack Start/);
});

test("add with an unknown pack fails", () => {
  const log = logger();
  assert.equal(addPack("nope", tmp(), { log }), 1);
  assert.match(log.text(), /tanstack-start/);
});
