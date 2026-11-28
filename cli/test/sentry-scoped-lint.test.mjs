// #320: the Sentry add-on's lint step ran `eslint --fix .` before the Worker's types existed. Without
// worker-configuration.d.ts (git-ignored, made by `wrangler types`) the typed rules' fixes misread the
// code: they dropped needed type assertions in files the add-on never touched, and typecheck failed.
// The step now makes the types first and lints and formats only the add-on's files. Applying the
// add-on needs a network install, so this reads ADDON.md; the full run on a fresh app is checked by hand.
// The checks themselves are in addon-lint-step.mjs, shared with the other add-ons (#425).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PACK, addonLint } from "./addon-lint-step.mjs";

const { lintBlock, assertScoped } = addonLint("sentry");
// The files the steps edit today: a floor, so a parser that finds nothing can't pass.
const KNOWN = ["src/env.d.ts", "wrangler.jsonc", "vite.config.ts", "eslint.config.js", ".env.example",
  "src/lib/security-headers.ts"];

test("AC-320-1: WHEN the Sentry add-on's lint step runs THEN it lints and formats only the files the add-on touched", () => {
  assertScoped(KNOWN);
});

test("AC-320-1: WHEN the Sentry add-on's lint step runs THEN it makes the Worker's types first, so the typed fixes see real types", () => {
  assert.equal(lintBlock()[0], "pnpm cf-typegen &&", "ESLint runs only once the types are made");
  // Why it's needed: the pack's own lint does the same, and a fresh copy has no generated types.
  const pack = JSON.parse(readFileSync(join(PACK, "package.json"), "utf8"));
  assert.match(pack.scripts["cf-typegen"], /^wrangler types\b/);
  assert.match(pack.scripts.lint, /^pnpm cf-typegen && eslint/);
  assert.match(readFileSync(join(PACK, ".gitignore"), "utf8"), /^worker-configuration\.d\.ts$/m);
  assert.ok(!existsSync(join(PACK, "worker-configuration.d.ts")), "the pack ships no generated types");
});
