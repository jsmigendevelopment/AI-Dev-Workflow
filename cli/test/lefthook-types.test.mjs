// #425: the pack's pre-commit hook ran `eslint --fix` on the staged files before the Worker's types existed.
// worker-configuration.d.ts is git-ignored, so a fresh copy has none until a lint or typecheck runs, and
// without it the typed rules misread the code: a commit failed on `no-unsafe-argument` in src/server.ts,
// and a fix could drop a needed type assertion from a staged file. The hook now makes the types first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { fake, nodeOnly, read, safeEnv, tmp, unixOnly } from "./helpers.mjs";

const PACK = fileURLToPath(new URL("../../stacks/tanstack-start/", import.meta.url));

// The `run:` line of the pre-commit job that runs ESLint. lefthook.yml is small and flat, so a line read is enough.
function eslintRun() {
  const runs = readFileSync(join(PACK, "lefthook.yml"), "utf8").split("\n")
    .map((l) => l.match(/^\s+run: (.+)$/)?.[1]).filter((r) => r?.includes("eslint"));
  assert.equal(runs.length, 1, "one pre-commit job runs ESLint");
  return runs[0];
}

test("AC-425-2: WHEN the pre-commit hook lints the staged files THEN it makes the Worker's types first, joined by &&", () => {
  assert.equal(eslintRun(), "pnpm cf-typegen && pnpm exec eslint --fix --no-warn-ignored {staged_files}");
  // The same command the pack's own lint runs first.
  const pack = JSON.parse(readFileSync(join(PACK, "package.json"), "utf8"));
  assert.match(pack.scripts["cf-typegen"], /^wrangler types\b/);
});

test("AC-425-2: WHEN the hook runs in a copy with no generated types THEN ESLint starts only after they are made, and not at all if that fails", unixOnly, () => {
  const run = eslintRun().replace("{staged_files}", "src/server.ts");
  for (const failTypes of [false, true]) {
    const dir = tmp("onrails-lefthook-");
    const bin = nodeOnly();
    // The fake pnpm logs each call; `cf-typegen` makes the types file, as `wrangler types` does, or fails.
    fake(bin, "pnpm", `#!/bin/sh\necho "$* types=$(test -f worker-configuration.d.ts && echo yes || echo no)" >> calls.log\n` +
      `if [ "$1" = cf-typegen ]; then ${failTypes ? "exit 1" : "touch worker-configuration.d.ts"}; fi\n`);
    const res = spawnSync("sh", ["-c", run], { cwd: dir, env: safeEnv({}, { bins: [bin] }), encoding: "utf8" });
    const calls = read(dir, "calls.log").trim().split("\n");
    if (failTypes) {
      assert.notEqual(res.status, 0, "the hook fails when the types can't be made");
      assert.deepEqual(calls, ["cf-typegen types=no"], "ESLint never runs without the types");
    } else {
      assert.equal(res.status, 0, res.stderr);
      assert.deepEqual(calls, ["cf-typegen types=no", "exec eslint --fix --no-warn-ignored src/server.ts types=yes"]);
    }
  }
});
