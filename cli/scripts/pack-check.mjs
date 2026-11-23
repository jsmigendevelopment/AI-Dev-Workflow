#!/usr/bin/env node
// Fails if the npm package would ship anything but the CLI, the kit and the legal files.
// Run it after `npm run bundle`: it reads `npm pack --dry-run --json` and writes nothing.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = new Set(["package.json", "README.md", "LICENSE"]);
const FOLDERS = ["bin/", "src/", "kit/"];
const REQUIRED = ["package.json", "README.md", "LICENSE", "bin/cli.mjs", "kit/manifest.json", "kit/NOTICE"];

// --ignore-scripts: prepack would bundle again; the caller has bundled already.
const r = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: CLI, encoding: "utf8", shell: process.platform === "win32" });
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(1);
}
const paths = JSON.parse(r.stdout)[0].files.map((f) => f.path);
const extra = paths.filter((p) => !FILES.has(p) && !FOLDERS.some((dir) => p.startsWith(dir)));
const missing = REQUIRED.filter((p) => !paths.includes(p));
for (const p of extra) console.error(`✗ not meant to ship: ${p}`);
for (const p of missing) console.error(`✗ missing from the package: ${p}`);
if (extra.length || missing.length) process.exit(1);
console.log(`✓ package holds ${paths.length} files, all under ${[...FILES, ...FOLDERS].join(", ")}`);
