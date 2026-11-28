// Issue #540: say which add-ons fit an app whose backend is Go. Words only: the CLI still adds any of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ADDONS_DIR = fileURLToPath(new URL("../../stacks/tanstack-start-addons/", import.meta.url));
const PRESETS_DIR = fileURLToPath(new URL("../../.agents/skills/idea/presets/", import.meta.url));
const read = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const addons = readdirSync(ADDONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

/** The value cell of the "With a Go backend" row in an ADDON.md's top table, or undefined. */
function rowValue(doc) {
  return doc.match(/^\| \*\*With a Go backend\*\* \| (.+) \|$/m)?.[1];
}

test("AC-540-1: every add-on's table has a 'With a Go backend' row that starts with 'fits' or 'TypeScript backend only'", () => {
  assert.ok(addons.length >= 7, "found the add-ons");
  for (const name of addons) {
    const value = rowValue(read(`${ADDONS_DIR}${name}/ADDON.md`));
    assert.ok(value, `${name}: has a "With a Go backend" row`);
    assert.match(value, /^(fits|TypeScript backend only)\b/, `${name}: the value starts with a verdict`);
  }
});

test("AC-540-1: a TypeScript-only add-on says where the need goes on a Go backend", () => {
  for (const name of addons) {
    const value = rowValue(read(`${ADDONS_DIR}${name}/ADDON.md`)) ?? "";
    if (value.startsWith("TypeScript backend only"))
      assert.match(value, /Go service/, `${name}: names the Go service`);
  }
});

test("AC-540-2: the add-ons README lists every add-on once with the same value as its ADDON.md", () => {
  const readme = read(`${ADDONS_DIR}README.md`);
  const section = readme.split(/^## /m).find((s) => s.startsWith("With a Go backend"));
  assert.ok(section, "README has a 'With a Go backend' section");
  const rows = [...section.matchAll(/^\| \[`([^`]+)`\]\([^)]+\) \| (.+) \|$/gm)].map(([, name, value]) => [name, value]);
  assert.deepEqual(rows.map(([name]) => name).sort(), addons, "every add-on once");
  for (const [name, value] of rows)
    assert.equal(value, rowValue(read(`${ADDONS_DIR}${name}/ADDON.md`)), `${name}: same value as its ADDON.md`);
});

test("AC-540-3: each add-on line of the saas, marketplace and api-service presets carries the note", () => {
  for (const preset of ["saas", "marketplace", "api-service"]) {
    const line = read(`${PRESETS_DIR}${preset}.md`).split("\n").find((l) => l.startsWith("- **Add-ons:**"));
    assert.ok(line, `${preset}: has an add-ons line`);
    assert.match(line, /TypeScript backend on Workers/, `${preset}: names the TypeScript backend on Workers`);
    assert.match(line, /Go backend/, `${preset}: says what a Go backend does`);
  }
});
