#!/usr/bin/env node
// The CLI, the plugin and the kit carry one version. This keeps them together.
// Usage:  node scripts/versions.mjs --check               fail if the versions differ
//         node scripts/versions.mjs --check --tag v0.5.0  also fail unless the tag is v<version>
//         node scripts/versions.mjs 0.5.0                 bump everything to 0.5.0, then bundle
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(CLI, "..");
// Files whose "version" field must match cli/package.json.
const JSON_FILES = ["cli/package.json", "plugin/.claude-plugin/plugin.json", "plugin/.codex-plugin/plugin.json"];
const FOOTER = /<sub>onRails · v(\d+\.\d+) · (\d{4}-\d{2})<\/sub>/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const COMPARE = "https://github.com/jsmigendevelopment/onRails/compare";

const read = (path) => readFileSync(join(REPO, path), "utf8");
const write = (path, text) => writeFileSync(join(REPO, path), text);
const versionOf = (path) => JSON.parse(read(path)).version;

function check(tag) {
  const want = versionOf("cli/package.json");
  const problems = [];
  for (const path of JSON_FILES.slice(1)) {
    const got = versionOf(path);
    if (got !== want) problems.push(`${path} is ${got}, cli/package.json is ${want}`);
  }
  const footer = read("AGENTS.md").match(FOOTER);
  const minor = want.split(".").slice(0, 2).join(".");
  if (!footer || footer[1] !== minor) problems.push(`AGENTS.md footer says v${footer?.[1] ?? "?"}, expected v${minor}`);
  if (tag !== undefined && tag !== `v${want}`) problems.push(`tag ${tag || "(empty)"} doesn't match v${want} in cli/package.json`);
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) return 1;
  console.log(`✓ versions match: ${want}${tag ? ` (tag ${tag})` : ""}`);
  return 0;
}

// Moves everything under [Unreleased] into a new heading, and fixes the compare links.
function bumpChangelog(text, from, to, date) {
  if (!text.includes("## [Unreleased]\n")) throw new Error("CHANGELOG.md has no ## [Unreleased] heading");
  if (text.includes(`## [${to}]`)) throw new Error(`CHANGELOG.md already has ## [${to}]`);
  return text
    .replace("## [Unreleased]\n", `## [Unreleased]\n\n## [${to}] - ${date}\n`)
    .replace(/^\[Unreleased\]: .*$/m, `[Unreleased]: ${COMPARE}/v${to}...HEAD\n[${to}]: ${COMPARE}/v${from}...v${to}`);
}

function bump(to) {
  if (!SEMVER.test(to)) throw new Error(`"${to}" isn't a version like 0.5.0`);
  const from = versionOf("cli/package.json");
  if (to === from) throw new Error(`already at ${to}`);
  const today = new Date().toISOString().slice(0, 10);
  for (const path of JSON_FILES) write(path, read(path).replace(`"version": "${from}"`, `"version": "${to}"`));
  write("AGENTS.md", read("AGENTS.md").replace(FOOTER, `<sub>onRails · v${to.split(".").slice(0, 2).join(".")} · ${today.slice(0, 7)}</sub>`));
  write("CHANGELOG.md", bumpChangelog(read("CHANGELOG.md"), from, to, today));
  // plugin/cli/ is checked in and carries the version, so rebuild it now.
  const bundle = spawnSync(process.execPath, [join(CLI, "scripts", "bundle.mjs")], { stdio: "inherit" });
  if (bundle.status !== 0) return 1;
  console.log(`bumped ${from} -> ${to}: ${JSON_FILES.join(", ")}, AGENTS.md footer, CHANGELOG.md, plugin/cli/`);
  const pinned = readdirSync(join(CLI, "test")).filter((f) => readFileSync(join(CLI, "test", f), "utf8").includes(`"${from}"`));
  if (pinned.length) console.log(`These tests name ${from}. Update the ones that mean the package version: ${pinned.join(", ")}`);
  return check();
}

const args = process.argv.slice(2);
try {
  if (args[0] === "--check") {
    const at = args.indexOf("--tag");
    process.exit(check(at === -1 ? undefined : args[at + 1] ?? ""));
  }
  if (args.length !== 1) throw new Error("usage: versions.mjs --check [--tag v1.2.3] | versions.mjs <version>");
  process.exit(bump(args[0]));
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
