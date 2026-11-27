// #320: the Sentry add-on's lint step ran `eslint --fix .` before the Worker's types existed. Without
// worker-configuration.d.ts (git-ignored, made by `wrangler types`) the typed rules' fixes misread the
// code: they dropped needed type assertions in files the add-on never touched, and typecheck failed.
// The step now makes the types first and lints and formats only the add-on's files. Applying the
// add-on needs a network install, so this reads ADDON.md; the full run on a fresh app is checked by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAddon } from "../src/addon-doc.mjs";

const ADDON = fileURLToPath(new URL("../../stacks/tanstack-start-addons/sentry/", import.meta.url));
const PACK = fileURLToPath(new URL("../../stacks/tanstack-start/", import.meta.url));
const { apply } = parseAddon(readFileSync(join(ADDON, "ADDON.md"), "utf8"));

// The pack's files the Apply steps edit by hand: every backticked path outside a code block that is
// a file in the pack. The package.json and lockfile that `pnpm add` writes are named only in code.
const isPackFile = (f) => existsSync(join(PACK, f)) && statSync(join(PACK, f)).isFile();
const EDITED = [...new Set([...apply.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\s]+)`/g)].map((m) => m[1]))]
  .filter(isPackFile);
// The ones the steps edit today: a floor, so a parser that finds nothing can't pass.
const KNOWN = ["src/env.d.ts", "wrangler.jsonc", "vite.config.ts", "eslint.config.js", ".env.example",
  "src/lib/security-headers.ts"];

function copied(dir = join(ADDON, "files")) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? copied(join(dir, d.name)) : [relative(join(ADDON, "files"), join(dir, d.name))]);
}
const touched = new Set([...copied(), ...EDITED]);

// The commands in the step that runs ESLint: each line of its sh block, or each part of an inline one.
function lintStep() {
  const step = apply.split(/\n(?=\d+\. )/).find((s) => /eslint --fix/.test(s));
  assert.ok(step, "an Apply step runs ESLint");
  const block = step.match(/```sh\n([\s\S]*?)```/)?.[1] ?? step.match(/`([^`]*eslint --fix[^`]*)`/)[1];
  return block.split(/\n|&&/).map((l) => l.trim()).filter(Boolean);
}
const args = (cmd) => cmd.split(/\s+/).slice(cmd.startsWith("pnpm exec") ? 3 : 2).filter((a) => !a.startsWith("-"));

test("AC-320-1: WHEN the Sentry add-on's lint step runs THEN it lints and formats only the files the add-on touched", () => {
  for (const f of KNOWN) assert.ok(EDITED.includes(f), `Apply edits ${f}`);
  const cmds = lintStep();
  const eslint = cmds.find((c) => c.startsWith("pnpm exec eslint --fix"));
  const prettier = cmds.find((c) => c.startsWith("pnpm exec prettier --write"));
  assert.ok(eslint, "the step runs eslint --fix");
  for (const cmd of [eslint, prettier].filter(Boolean)) {
    const files = args(cmd);
    assert.ok(files.length > 0, `${cmd} names its files`);
    for (const f of files) assert.ok(touched.has(f), `${f} is a file the add-on touched`);
  }
  assert.ok(!cmds.some((c) => /^pnpm (format|lint)\b/.test(c)), "no whole-project format or lint");
  assert.ok(prettier, "the step formats the add-on's files with prettier --write");
  // Every source file the add-on touched still gets its imports sorted, and every file Prettier
  // formats is formatted, or step 12's `prettier --check` fails.
  const linted = new Set(args(eslint));
  for (const f of touched) if (/\.(ts|tsx|js)$/.test(f)) assert.ok(linted.has(f), `${f} is linted`);
  const formatted = new Set(args(prettier));
  for (const f of touched) if (/\.(ts|tsx|js|json|jsonc)$/.test(f)) assert.ok(formatted.has(f), `${f} is formatted`);
});

test("AC-320-1: WHEN the Sentry add-on's lint step runs THEN it makes the Worker's types first, so the typed fixes see real types", () => {
  const cmds = lintStep();
  const typegen = cmds.indexOf("pnpm cf-typegen");
  assert.ok(typegen >= 0, "the step runs pnpm cf-typegen");
  assert.ok(typegen < cmds.findIndex((c) => c.includes("eslint")), "before ESLint");
  assert.match(apply, /pnpm cf-typegen &&\s+pnpm exec eslint --fix/, "ESLint runs only once the types are made");
  // Why it's needed: the pack's own lint does the same, and a fresh copy has no generated types.
  const pack = JSON.parse(readFileSync(join(PACK, "package.json"), "utf8"));
  assert.match(pack.scripts["cf-typegen"], /^wrangler types\b/);
  assert.match(pack.scripts.lint, /^pnpm cf-typegen && eslint/);
  assert.match(readFileSync(join(PACK, ".gitignore"), "utf8"), /^worker-configuration\.d\.ts$/m);
  assert.ok(!existsSync(join(PACK, "worker-configuration.d.ts")), "the pack ships no generated types");
});
