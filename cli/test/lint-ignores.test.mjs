// #146: a new app passes its own lint. `onrails init` puts the kit's rules, skills and hooks next to
// the app, so each pack's ESLint and Prettier must ignore them: before the fix, init plus
// `add tanstack-start` gave 468 lint errors, all in .agents/ and .claude/. #152: the same for the docs
// /idea writes from the kit's templates. These tests read the ignore lists instead of running
// `pnpm install` and lint, which takes minutes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addPack } from "../src/add.mjs";
import { init } from "../src/init.mjs";
import { PROJECT_MANIFEST } from "../src/kit.mjs";
import { logger, read as readIn, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(REPO, path), "utf8");

// Every file init writes: the core kit (the checked-in plugin copy, which `bundle --check` keeps
// equal to the bundle) and the install record.
const KIT_FILES = [...Object.keys(JSON.parse(read("plugin/cli/kit/manifest.json")).core), PROJECT_MANIFEST];
const KIT_SCRIPTS = KIT_FILES.filter((path) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path));

// A flat config's global ignores: every object whose only key is `ignores`.
function eslintIgnores(path) {
  const blocks = [...read(path).matchAll(/\{\s*ignores:\s*\[([^\]]*)\]\s*,?\s*\}/g)];
  assert.ok(blocks.length, `${path} has a global ignores block`);
  return blocks.flatMap((block) => [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

const prettierIgnores = (path, text = read(path)) =>
  text.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

// The files no entry covers. A plain entry (`.agents`, `.agents/`, `.agents/**`) covers that path and
// everything under it, in both tools. Entries with other globs cover nothing here.
function uncovered(entries, files) {
  const plain = entries.map((e) => e.replace(/\/(\*\*)?$/, "")).filter((e) => !/[*?[]/.test(e));
  return files.filter((file) => !plain.some((e) => file === e || file.startsWith(`${e}/`)));
}

test("the kit file list is the real one", () => {
  for (const dir of [".agents/", ".claude/", ".codex/"]) {
    assert.ok(KIT_FILES.some((path) => path.startsWith(dir)), dir);
  }
  assert.ok(KIT_SCRIPTS.length > 20, `found ${KIT_SCRIPTS.length} kit scripts`);
});

test("AC-146-1: WHEN the kit and the TanStack Start pack are installed THEN ESLint ignores every kit script", () => {
  assert.deepEqual(uncovered(eslintIgnores("stacks/tanstack-start/eslint.config.js"), KIT_SCRIPTS), []);
});

test("AC-146-1: WHEN the kit and the TanStack Start pack are installed THEN Prettier ignores every kit file", () => {
  assert.deepEqual(uncovered(prettierIgnores("stacks/tanstack-start/.prettierignore"), KIT_FILES), []);
});

test("AC-146-2: WHEN the kit and the monorepo pack are installed THEN the root ESLint config ignores every kit script", () => {
  assert.deepEqual(uncovered(eslintIgnores("stacks/monorepo-expo/eslint.workspace.config.js"), KIT_SCRIPTS), []);
});

test("AC-146-2: WHEN the kit and the monorepo pack are installed THEN Prettier runs only inside the workspaces, away from the kit", () => {
  const { scripts } = JSON.parse(read("stacks/monorepo-expo/package.json"));
  const rootPrettier = Object.keys(scripts).filter((name) => /\bprettier\b/.test(scripts[name]));
  assert.deepEqual(rootPrettier, [], "a Prettier run at the root needs a root .prettierignore that lists the kit files");
});

test("AC-152-1: WHEN the kit and the TanStack Start pack are installed and docs/ holds every idea template THEN Prettier ignores docs/", () => {
  const app = tmp();
  assert.equal(init(app, { home: tmp(), log: logger() }), 0);
  assert.equal(addPack("tanstack-start", app, { log: logger() }), 0);
  // What /idea writes: each template copied into docs/ under its own name.
  cpSync(join(app, ".agents/skills/idea/templates"), join(app, "docs"), { recursive: true });
  const docs = readdirSync(join(app, "docs")).map((name) => `docs/${name}`);
  assert.ok(docs.filter((path) => path.endsWith(".md")).length >= 13, `found ${docs.length} docs`);
  const entries = prettierIgnores(".prettierignore", readIn(app, ".prettierignore"));
  assert.deepEqual(uncovered(entries, docs), []);
});
