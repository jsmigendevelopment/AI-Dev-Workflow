#!/usr/bin/env node
// Copies the kit from the repo (the folder above cli/) into cli/kit/, with a manifest.
// Runs before every npm pack / npm publish, so each CLI version carries one kit version.
// It also writes plugin/cli/: this CLI with the core kit only (no stack packs), so the
// plugin's skills can run `init` without npm. That copy is checked in, because a plugin
// installs from a git clone. `--check` only compares plugin/cli/ and writes nothing.
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hash, readJson, toNative, walk, writeFile } from "../src/files.mjs";
import { parseAddon } from "../src/addon-doc.mjs";
import { storedName } from "../src/kit.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(CLI, "..");
const OUT = join(CLI, "kit");
const PLUGIN_CLI = join(REPO, "plugin", "cli");

const CORE = [
  "AGENTS.md",
  "CLAUDE.md",
  ".agents/skills",
  ".claude/skills",
  ".claude/settings.json",
  ".claude/hooks",
  ".codex/config.toml",
  ".codex/hooks.json",
  ".codex/rules",
  ".github/ISSUE_TEMPLATE/slice.md",
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

// An add-on folder is stacks/<pack>-addons/<addon>/ with ADDON.md and files/ (project paths).
function bundleAddons(dir, outDir) {
  const addons = {};
  for (const name of readdirSync(dir).sort()) {
    const root = join(dir, name);
    if (!statSync(root).isDirectory()) continue;
    const doc = readFileSync(join(root, "ADDON.md"), "utf8");
    const files = collect(join(root, "files"), walk(join(root, "files"), skip));
    addons[name] = { ...parseAddon(doc), files: store(files, join(outDir, name)) };
  }
  return addons;
}

// Every file of plugin/cli/, as { "/" path: data }. Same layout as this package, core kit only.
function pluginFiles(version, coreFiles) {
  const out = {};
  for (const path of walk(join(CLI, "src"))) out[`src/${path}`] = readFileSync(toNative(join(CLI, "src"), path));
  out["bin/cli.mjs"] = readFileSync(join(CLI, "bin", "cli.mjs"));
  out["LICENSE"] = readFileSync(join(CLI, "LICENSE"));
  const pkg = readJson(join(CLI, "package.json"));
  const slim = { name: pkg.name, version, description: pkg.description, license: pkg.license, type: pkg.type, bin: pkg.bin, engines: pkg.engines };
  out["package.json"] = Buffer.from(JSON.stringify(slim, null, 2) + "\n");
  const core = {};
  for (const [path, data] of Object.entries(coreFiles)) {
    out[`kit/files/core/${storedName(path)}`] = data;
    core[path] = hash(data);
  }
  out["kit/manifest.json"] = Buffer.from(JSON.stringify({ kitVersion: version, core, packs: {}, addons: {} }, null, 2) + "\n");
  return out;
}

function checkPlugin(want) {
  const have = walk(PLUGIN_CLI);
  const problems = Object.keys(want).filter((p) => !have.includes(p) || !readFileSync(toNative(PLUGIN_CLI, p)).equals(want[p]))
    .map((p) => `differs: plugin/cli/${p}`);
  problems.push(...have.filter((p) => !(p in want)).map((p) => `not made by the bundle: plugin/cli/${p}`));
  if (problems.length) {
    console.error(problems.join("\n") + "\n\nRun: cd cli && npm run bundle");
    process.exit(1);
  }
  console.log(`plugin/cli in sync (${have.length} files)`);
}

const version = readJson(join(CLI, "package.json")).version;
const coreFiles = collect(REPO, CORE);
const plugin = pluginFiles(version, coreFiles);
if (process.argv.includes("--check")) {
  checkPlugin(plugin);
  process.exit(0);
}
rmSync(OUT, { recursive: true, force: true });

const core = store(coreFiles, join(OUT, "files", "core"));
const packs = {};
const addons = {};
const stackNames = readdirSync(join(REPO, "stacks")).filter((n) => statSync(join(REPO, "stacks", n)).isDirectory());
for (const name of stackNames.sort()) {
  if (name.endsWith("-addons")) continue;
  const files = collect(join(REPO, "stacks", name), walk(join(REPO, "stacks", name), skip));
  packs[name] = { files: store(files, join(OUT, "files", "stacks", name)), next: nextSteps(name, files) };
  const addonDir = join(REPO, "stacks", `${name}-addons`);
  if (existsSync(addonDir)) addons[name] = bundleAddons(addonDir, join(OUT, "files", "addons", name));
}

writeFile(join(OUT, "manifest.json"), JSON.stringify({ kitVersion: version, core, packs, addons }, null, 2) + "\n");
const packCount = Object.values(packs).reduce((n, p) => n + Object.keys(p.files).length, 0);
const addonCount = Object.values(addons).reduce((n, a) => n + Object.keys(a).length, 0);
console.log(`bundled kit v${version}: ${Object.keys(core).length} core files, ${Object.keys(packs).length} pack(s) with ${packCount} files, ${addonCount} add-on(s) -> cli/kit/`);

rmSync(PLUGIN_CLI, { recursive: true, force: true });
for (const [path, data] of Object.entries(plugin)) writeFile(toNative(PLUGIN_CLI, path), data);
console.log(`bundled plugin/cli/: the CLI and kit v${version} core, ${Object.keys(plugin).length} files`);
