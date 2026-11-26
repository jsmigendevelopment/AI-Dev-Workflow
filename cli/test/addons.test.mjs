import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addAddon, addPack, listAddons, listPacks } from "../src/add.mjs";
import { parseAddon } from "../src/addon-doc.mjs";
import { loadKit } from "../src/kit.mjs";
import { exists, logger, put, read, safeEnv, tmp } from "./helpers.mjs";

const ADDONS_DIR = fileURLToPath(new URL("../../stacks/tanstack-start-addons/", import.meta.url));
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: safeEnv() });
const EXPECTED = ["analytics", "database-supabase", "email-resend", "jobs", "r2-uploads", "sentry", "stripe"];

test("parseAddon: first sentence as summary, Apply without the CLI's own step", () => {
  const doc = [
    "# demo",
    "",
    "Adds a thing. More words here.",
    "",
    "## Apply",
    "",
    "1. Copy `files/`. The CLI does this step: `npx onrails add x/demo`.",
    "   (continuation of step 1)",
    "2. Edit `a.ts`:",
    "   ```md",
    "   ## not a heading, inside a fence",
    "   ```",
    "3. `pnpm check`.",
    "",
    "## Verify",
    "- later",
  ].join("\n");
  const { summary, apply } = parseAddon(doc);
  assert.equal(summary, "Adds a thing.");
  assert.doesNotMatch(apply, /CLI does this step|continuation of step 1/);
  assert.match(apply, /^2\. Edit `a\.ts`:/);
  assert.match(apply, /## not a heading, inside a fence/);
  assert.match(apply, /3\. `pnpm check`\.$/);
  assert.doesNotMatch(apply, /later/);
});

test("the add-ons folder is bundled as add-ons, never as a pack", () => {
  const kit = loadKit();
  assert.ok(Object.keys(kit.packs).includes("tanstack-start"));
  assert.deepEqual(Object.keys(kit.packs).filter((n) => n.endsWith("-addons")), []);
  assert.deepEqual(Object.keys(kit.addons["tanstack-start"]).sort(), EXPECTED);
  const log = logger();
  listPacks({ log });
  assert.doesNotMatch(log.text(), /-addons/);
});

test("every bundled add-on has a summary, files, and apply steps that end in the check", () => {
  for (const [name, addon] of Object.entries(loadKit().addons["tanstack-start"])) {
    assert.ok(addon.summary.length > 10, `${name} summary`);
    assert.ok(Object.keys(addon.files).length > 0, `${name} files`);
    assert.match(addon.apply, /^2\. /m, `${name} apply has step 2`);
    assert.match(addon.apply, /pnpm check/, `${name} apply runs the check`);
    assert.doesNotMatch(addon.apply, /The CLI does this step/, `${name} drops step 1`);
  }
});

test("every ADDON.md has the sections and facts the grill and the builder rely on", () => {
  const names = readdirSync(ADDONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(names.sort(), EXPECTED);
  for (const name of names) {
    const doc = readFileSync(`${ADDONS_DIR}${name}/ADDON.md`, "utf8");
    for (const part of ["**Choose it when**", "**Alternatives**", "**Env vars**", "**Packages**", "**Issue**",
      "## What it adds", "## Apply", "## Verify", "## Not verified here", "`Skills: build", "lane `"]) {
      assert.ok(doc.includes(part), `${name}: ${part}`);
    }
    // Pinned versions only: every package@version in an install line is exact.
    for (const [, spec] of doc.matchAll(/pnpm add (?:-D )?([^\n`]+)/g))
      for (const pkg of spec.trim().split(/\s+/)) assert.match(pkg, /@\d+\.\d+\.\d+$/, `${name}: ${pkg} is pinned`);
    assert.doesNotMatch(doc, /next\.?js|vercel/i, `${name}: no Next.js or Vercel`);
  }
});

test("add --list-addons lists each add-on with its summary", () => {
  const log = logger();
  assert.equal(listAddons("tanstack-start", { log }), 0);
  for (const name of EXPECTED) assert.match(log.text(), new RegExp(`^  ${name} +\\S`, "m"));
  assert.equal(listAddons("nope", { log: logger() }), 1);
});

test("add <pack>/<addon> copies files/ and prints only the steps still to do", () => {
  const dir = tmp();
  addPack("tanstack-start", dir, { log: logger() });
  const log = logger();
  assert.equal(addPack("tanstack-start/stripe", dir, { log }), 0);
  for (const path of [
    "src/modules/billing/server/billing.service.ts",
    "src/modules/billing/server/billing.payments.stripe.ts",
    "src/routes/api/stripe/webhook.ts",
  ])
    assert.ok(exists(dir, path), path);
  assert.ok(!exists(dir, "ADDON.md"), "ADDON.md is not copied into the project");
  assert.match(log.text(), /Copied \d+ file\(s\) from the stripe add-on/);
  assert.match(log.text(), /step 1, copying the files, is done/);
  assert.match(log.text(), /pnpm add stripe@23\.1\.0/);
  assert.match(log.text(), /composition\.ts/);
  assert.doesNotMatch(log.text(), /The CLI does this step/);
});

test("add-on files you already have are skipped unless --force", () => {
  const dir = tmp();
  addPack("tanstack-start", dir, { log: logger() });
  const before = read(dir, "src/db/client.ts");
  const log = logger();
  addAddon("tanstack-start/database-supabase", dir, { log });
  assert.equal(read(dir, "src/db/client.ts"), before);
  assert.match(log.text(), /Skipped 4 file\(s\)/);
  assert.match(log.text(), /step 1, copying the files, is not finished/);

  assert.equal(addAddon("tanstack-start/database-supabase", dir, { force: true, log: logger() }), 0);
  assert.match(read(dir, "src/db/client.ts"), /node-postgres/);
});

test("an add-on into a folder that isn't a project warns, and an unknown add-on fails", () => {
  const dir = tmp();
  put(dir, "README.md", "x\n");
  const log = logger();
  assert.equal(addAddon("tanstack-start/analytics", dir, { log }), 0);
  assert.match(log.text(), /has no package\.json/);
  const bad = logger();
  assert.equal(addAddon("tanstack-start/nope", dir, { log: bad }), 1);
  assert.match(bad.text(), /tanstack-start\/analytics/);
  assert.equal(addAddon("nope/analytics", dir, { log: logger() }), 1);
  assert.equal(addAddon("tanstack-start/analytics/extra", dir, { log: logger() }), 1);
});

test("the binary: --list-addons needs a pack; add <pack>/<addon> works", () => {
  const listed = run("add", "tanstack-start", "--list-addons");
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /r2-uploads/);
  assert.equal(run("add", "--list-addons").status, 2);
  const dir = tmp();
  const added = run("add", "tanstack-start/jobs", dir);
  assert.equal(added.status, 0, added.stderr);
  assert.ok(exists(dir, "src/server.ts"));
  assert.match(added.stdout, /wrangler\.jsonc/);
  assert.match(run("--help").stdout, /--list-addons/);
});
