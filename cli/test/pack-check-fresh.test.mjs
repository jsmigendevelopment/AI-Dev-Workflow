// #319, #421: a fresh copy of the TanStack Start pack passes its own `pnpm check`. This reads the pack's files
// instead of running `pnpm install` and `pnpm check`, which takes minutes; the full run on a fresh app is checked
// by hand on pack changes. Two parts of that check are cheap enough to pin here:
// - knip: lefthook is really used (its `hooks` script and lefthook.yml), so knip is never told to ignore it, and
//   nothing in the knip script or config may hide an unused dependency;
// - Prettier: `pnpm lint` ends with `prettier --check .`, so a pack file Prettier would change fails a fresh app.
//   The test runs the pack's own pinned Prettier with the pack's own config, when that version is on hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { safeEnv, tmp, put } from "./helpers.mjs";

const PACK = fileURLToPath(new URL("../../stacks/tanstack-start", import.meta.url));
const read = (path) => readFileSync(join(PACK, path), "utf8");
const pack = () => JSON.parse(read("package.json"));

// knip.jsonc is JSON with // comments and trailing commas. Strings are kept whole, so the "//" in the $schema URL stays.
function parseJsonc(text) {
  let out = "";
  for (let i = 0, quoted = false; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      out += c;
      if (c === "\\") out += text[++i];
      else if (c === '"') quoted = false;
    } else if (c === '"') {
      quoted = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

// Knip settings that stop it reporting an unused dependency, a missing one or an unused binary, each named.
const HIDING_KEYS = ["ignoreDependencies", "ignoreBinaries", "ignoreUnresolved", "rules", "workspaces", "include", "exclude"];
const DEPENDENCY_ISSUES = ["dependencies", "devDependencies", "optionalPeerDependencies", "unlisted", "binaries", "unresolved"];
function hiddenKnipSettings(config, scripts) {
  const found = [];
  if (scripts.knip !== "knip") found.push(`the knip script is ${JSON.stringify(scripts.knip)}, not "knip"`);
  if (!scripts.check?.includes("pnpm knip")) found.push("the check script doesn't run pnpm knip");
  for (const key of HIDING_KEYS) if (key in config) found.push(`knip.jsonc sets ${key}`);
  for (const [glob, kinds] of Object.entries(config.ignoreIssues ?? {})) {
    for (const kind of kinds.filter((k) => DEPENDENCY_ISSUES.includes(k))) found.push(`ignoreIssues hides ${kind} for ${glob}`);
  }
  return found;
}

test("AC-319-1: WHEN the pack's files are read for a knip run with no git hook installed THEN lefthook is used by a script knip sees, not by the hook", () => {
  const { devDependencies, scripts } = pack();
  assert.ok(devDependencies.lefthook, "the pack ships lefthook");
  assert.ok(existsSync(join(PACK, "lefthook.yml")), "lefthook.yml uses it");
  assert.match(read("pnpm-workspace.yaml"), /^\s+lefthook: true$/m, "its install script may run, to install the hook");
  assert.equal(scripts.hooks, "lefthook install", "the hooks script is a real use knip sees without .git/hooks");
});

test("AC-421-1: WHEN knip reads the pack's config THEN lefthook is not in an ignore list, so knip prints no 'Remove from ignoreDependencies' hint", () => {
  assert.equal(parseJsonc(read("knip.jsonc")).ignoreDependencies, undefined);
});

test("AC-421-1: WHEN pnpm install runs before git init THEN nothing in the pack makes it fail, so no prepare or postinstall script runs lefthook", () => {
  const { scripts } = pack();
  for (const name of ["prepare", "postinstall", "install", "preinstall"]) assert.equal(scripts[name], undefined, `no ${name} script`);
});

test("AC-421-3: WHEN the pack's knip script and config are read THEN nothing in them hides an unused dependency", () => {
  assert.deepEqual(hiddenKnipSettings(parseJsonc(read("knip.jsonc")), pack().scripts), []);
});

test("AC-421-3: WHEN the pack has any other place knip reads config THEN there is none, so knip.jsonc is the whole of it", () => {
  assert.equal(pack().knip, undefined, "no knip key in package.json");
  for (const name of ["knip.json", "knip.ts", "knip.js", "knip.config.ts", "knip.config.js", ".knip.json", ".knip.jsonc"]) {
    assert.equal(existsSync(join(PACK, name)), false, `${name} would be read besides knip.jsonc`);
  }
});

test("AC-421-3: WHEN the knip script or config would hide unused dependencies THEN the guard names each way", () => {
  const scripts = { knip: "knip", check: "pnpm lint && pnpm knip" };
  assert.deepEqual(hiddenKnipSettings({}, scripts), []);
  assert.deepEqual(hiddenKnipSettings({ ignoreIssues: { "src/**": ["files", "exports"] } }, scripts), []);
  assert.deepEqual(hiddenKnipSettings({}, { ...scripts, knip: "knip --exclude dependencies" }), [
    'the knip script is "knip --exclude dependencies", not "knip"',
  ]);
  assert.deepEqual(hiddenKnipSettings({}, { ...scripts, check: "pnpm lint" }), ["the check script doesn't run pnpm knip"]);
  for (const key of HIDING_KEYS) assert.deepEqual(hiddenKnipSettings({ [key]: key === "rules" ? {} : [] }, scripts), [`knip.jsonc sets ${key}`]);
  assert.deepEqual(hiddenKnipSettings({ ignoreIssues: { "package.json": ["dependencies"] } }, scripts), ["ignoreIssues hides dependencies for package.json"]);
});

test("AC-421-3: WHEN a knip.jsonc has comments and trailing commas THEN it still reads, with the $schema URL whole", () => {
  const config = parseJsonc('// note\n{\n  "$schema": "https://x.test/a//b", // why\n  "ignore": ["a",],\n}\n');
  assert.deepEqual(config, { $schema: "https://x.test/a//b", ignore: ["a"] });
});

// The pack's pinned Prettier. Looked for in the pack's own node_modules, in the folder ONRAILS_PRETTIER_DIR names, or,
// when ONRAILS_PRETTIER_INSTALL=1, installed into a temp folder (needs the network). Only the exact pinned version counts:
// another one may format differently, and the test would then fail on a file a fresh app accepts.
function prettierBin() {
  const pin = pack().devDependencies.prettier;
  const folders = [process.env.ONRAILS_PRETTIER_DIR, join(PACK, "node_modules", "prettier")].filter(Boolean);
  if (process.env.ONRAILS_PRETTIER_INSTALL === "1") {
    const dir = tmp("onrails-prettier-");
    const res = spawnSync("npm", ["install", "--prefix", dir, "--ignore-scripts", "--no-audit", "--no-fund", `prettier@${pin}`], { env: safeEnv(), encoding: "utf8" });
    if (res.status === 0) folders.push(join(dir, "node_modules", "prettier"));
  }
  for (const folder of folders) {
    const manifest = join(folder, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).version === pin) return join(folder, "bin", "prettier.cjs");
  }
  return null;
}

const bin = prettierBin();
const noPrettier = {
  skip: bin ? false : `Prettier ${pack().devDependencies.prettier} isn't here: put it in the pack's node_modules, name its folder in ONRAILS_PRETTIER_DIR, or set ONRAILS_PRETTIER_INSTALL=1 (needs the network)`,
};

// Runs `prettier --check` in cwd with the config found there. Returns the exit status and the files it would change.
function prettierCheck(cwd, target = ".") {
  const res = spawnSync(process.execPath, [bin, "--check", target], { cwd, env: safeEnv(), encoding: "utf8" });
  const files = `${res.stdout}${res.stderr}`.split("\n").map((l) => l.match(/^\[warn\] (.+)$/)?.[1]).filter((f) => f && !f.startsWith("Code style issues"));
  return { status: res.status, files };
}

test("AC-421-2: WHEN a pack file has a line Prettier would change THEN the check fails and names that file, and only it", noPrettier, () => {
  const dir = tmp("onrails-pack-prettier-");
  put(dir, ".prettierrc.json", read(".prettierrc.json"));
  put(dir, "clean.ts", "export const a = 1\n");
  put(dir, "long-line.ts", `export const b = [${Array.from({ length: 30 }, (_, i) => i * 1000).join(", ")}]\n`);
  assert.deepEqual(prettierCheck(dir), { status: 1, files: ["long-line.ts"] });
});

test("AC-421-2: WHEN Prettier checks every file in the TanStack Start pack with the pack's own config THEN it would change none", noPrettier, () => {
  const { status, files } = prettierCheck(PACK);
  assert.deepEqual(files, [], `Prettier would change: ${files.join(", ")}. Run \`pnpm exec prettier --write <file>\` in a copy of the pack.`);
  assert.equal(status, 0);
});
