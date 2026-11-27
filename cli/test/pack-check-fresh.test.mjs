// #319: a fresh copy of the TanStack Start pack passes its own `pnpm check`. Knip counts lefthook as used
// only when it finds lefthook's hook in .git/hooks (or CI is set), and that hook is missing when
// `pnpm install` ran before `git init`, in a git worktree, or with LEFTHOOK=0. So knip must be told about
// lefthook's real use: its install script and lefthook.yml. This reads the files instead of running
// `pnpm install` and `pnpm check`, which takes minutes; the full run on a fresh app is checked by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PACK = fileURLToPath(new URL("../../stacks/tanstack-start", import.meta.url));
const read = (path) => readFileSync(join(PACK, path), "utf8");

// The names in knip.jsonc's ignoreDependencies list.
function knipIgnoredDependencies() {
  const list = read("knip.jsonc").match(/"ignoreDependencies":\s*\[([^\]]*)\]/);
  return list ? [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

test("AC-319-1: WHEN a fresh copy of the TanStack Start pack runs knip with no git hook installed THEN lefthook counts as used, because it is really used", () => {
  const { devDependencies } = JSON.parse(read("package.json"));
  assert.ok(devDependencies.lefthook, "the pack ships lefthook");
  assert.ok(existsSync(join(PACK, "lefthook.yml")), "lefthook.yml uses it");
  assert.match(read("pnpm-workspace.yaml"), /^\s+lefthook: true$/m, "its install script may run, to install the hook");
  assert.ok(knipIgnoredDependencies().includes("lefthook"), "knip.jsonc names lefthook in ignoreDependencies");
});

test("AC-319-1: WHEN knip is told to ignore a dependency THEN it is only lefthook, so every other unused dependency still fails", () => {
  assert.deepEqual(knipIgnoredDependencies(), ["lefthook"]);
});
