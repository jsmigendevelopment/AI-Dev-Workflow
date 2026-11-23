#!/usr/bin/env node
// Copies the kit from the repo (the folder above cli/) into cli/kit/, with a manifest.
// Runs before every npm pack / npm publish, so each CLI version carries one kit version.
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hash, readJson, toNative, walk, writeFile } from "../src/files.mjs";
import { storedName } from "../src/kit.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(CLI, "..");
const OUT = join(CLI, "kit");

const CORE = [
  "AGENTS.md",
  "CLAUDE.md",
  ".agents/skills",
  ".claude/skills",
  ".claude/settings.json",
  ".codex/config.toml",
  ".codex/rules",
  ".github/ISSUE_TEMPLATE",
];

// Never bundled: installs, build output, local state, test output, secrets, OS junk.
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", ".output", ".vite", ".tanstack", ".wrangler",
  "test-results", "playwright-report", "blob-report", "coverage",
]);
function skip(name) {
  if (SKIP_DIRS.has(name) || name === ".DS_Store" || name === "worker-configuration.d.ts") return true;
  if (name.endsWith(".log") || name.startsWith(".dev.vars")) return true;
  return (name === ".env" || name.startsWith(".env.")) && name !== ".env.example";
}

function collect(root, entries) {
  const out = {};
  for (const entry of entries) {
    const native = toNative(root, entry);
    const paths = walk(native, skip);
    const list = paths.length ? paths.map((p) => `${entry}/${p}`) : [entry];
    for (const path of list) out[path] = readFileSync(toNative(root, path));
  }
  return out;
}

function store(files, outDir) {
  const shas = {};
  for (const [path, data] of Object.entries(files)) {
    writeFile(toNative(outDir, storedName(path)), data);
    shas[path] = hash(data);
  }
  return shas;
}

// What to tell someone right after `add <pack>`, read from the pack's own package.json.
function nextSteps(name, files) {
  const pkg = files["package.json"] ? JSON.parse(files["package.json"].toString("utf8")) : null;
  if (!pkg) return [];
  const pm = (pkg.packageManager || "npm").split("@")[0];
  const steps = ['Set "name" in package.json (and any other config the pack README names).', `${pm} install`];
  if (pkg.scripts?.check) steps.push(`${pm} check`);
  steps.push(`Read the pack's README.md. Agents: load the stack-${name} skill.`);
  return steps;
}

const version = readJson(join(CLI, "package.json")).version;
rmSync(OUT, { recursive: true, force: true });

const core = store(collect(REPO, CORE), join(OUT, "files", "core"));
const packs = {};
const stackNames = readdirSync(join(REPO, "stacks")).filter((n) => statSync(join(REPO, "stacks", n)).isDirectory());
for (const name of stackNames.sort()) {
  const files = collect(join(REPO, "stacks", name), walk(join(REPO, "stacks", name), skip));
  packs[name] = { files: store(files, join(OUT, "files", "stacks", name)), next: nextSteps(name, files) };
}

writeFile(join(OUT, "manifest.json"), JSON.stringify({ kitVersion: version, core, packs }, null, 2) + "\n");
const packCount = Object.values(packs).reduce((n, p) => n + Object.keys(p.files).length, 0);
console.log(`bundled kit v${version}: ${Object.keys(core).length} core files, ${Object.keys(packs).length} pack(s) with ${packCount} files -> cli/kit/`);
