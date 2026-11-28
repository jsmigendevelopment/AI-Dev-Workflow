// #425: every add-on's lint step makes the Worker's types first and fixes only the add-on's own files, as the
// Sentry add-on's does since #320 (sentry-scoped-lint.test.mjs). The checks are in addon-lint-step.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ADDONS, addonLint } from "./addon-lint-step.mjs";
import { spawnSync } from "./child.mjs";
import { safeEnv } from "./helpers.mjs";
import { parseAddon } from "../src/addon-doc.mjs";

// Each add-on and the pack files its steps edit today: a floor, so a parser that finds nothing can't pass.
const KNOWN = {
  analytics: ["src/routes/__root.tsx", ".env.example", "src/lib/security-headers.ts", "src/lib/security-headers.test.ts"],
  "database-supabase": ["wrangler.jsonc", "src/server/composition.ts", "package.json", ".env.example", "README.md",
    "src/modules/notes/server/notes.repository.drizzle.ts", "src/modules/notes/server/notes.repository.memory.ts"],
  "email-resend": ["src/env.d.ts", "src/server/composition.ts", ".env.example"],
  jobs: ["wrangler.jsonc", "src/server/composition.ts", "knip.jsonc"],
  "r2-uploads": ["wrangler.jsonc", "src/server/composition.ts", "eslint.config.js", "src/components/site-header.tsx"],
  stripe: ["src/env.d.ts", "src/server/composition.ts", "eslint.config.js", ".env.example", "src/lib/open-paths.ts",
    "src/lib/site-gate.test.ts", "src/components/site-header.tsx"],
};

for (const [name, known] of Object.entries(KNOWN)) {
  const { lintBlock, assertScoped } = addonLint(name);

  test(`AC-425-1: WHEN the ${name} add-on's lint step runs THEN it makes the Worker's types first, so the typed fixes see real types`, () => {
    assert.equal(lintBlock()[0], "pnpm cf-typegen &&", "ESLint runs only once the types are made");
  });

  test(`AC-425-1: WHEN the ${name} add-on's lint step runs THEN it lints and formats only the files the add-on touched`, () => {
    assertScoped(known);
  });
}

test("AC-425-1: WHEN an add-on's Apply steps run ESLint THEN its lint step is one these checks cover", () => {
  const covered = new Set([...Object.keys(KNOWN), "sentry"]);
  const linting = readdirSync(ADDONS, { withFileTypes: true }).filter((d) => d.isDirectory())
    .filter((d) => /eslint/.test(parseAddon(readFileSync(join(ADDONS, d.name, "ADDON.md"), "utf8")).apply))
    .map((d) => d.name);
  assert.ok(linting.length >= covered.size, "every add-on in the list runs ESLint");
  for (const name of linting) assert.ok(covered.has(name), `${name} runs ESLint, so its lint step is checked here`);
});

test("AC-425-1: WHEN a lint step line names a `$` path unquoted THEN it is refused at once, never left to hang the run", () => {
  // r2-uploads' real line with the quotes taken off: the shell would expand `$id`. A regex that backtracked
  // on a line like this ran past 20 s, so the match runs in a child with a time limit.
  const line = "pnpm exec eslint --fix src/modules/files src/routes/api/files.$id.ts src/routes/files.tsx " +
    "src/server/request-actor.ts src/server/composition.ts src/components/site-header.tsx eslint.config.js";
  const url = pathToFileURL(join(import.meta.dirname, "addon-lint-step.mjs")).href;
  const code = `import { ALLOWED } from ${JSON.stringify(url)};\n` +
    `process.stdout.write(String(ALLOWED[1].re.test(${JSON.stringify(line)})));`;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", code], { env: safeEnv(), encoding: "utf8", timeout: 5000 });
  assert.equal(res.error?.code, undefined, "the match finishes within 5 s");
  assert.equal(res.stdout, "false", "the unquoted `$` path is refused");
  assert.ok(addonLint("r2-uploads").lintBlock()[1].includes("'src/routes/api/files.$id.ts'"), "the real step quotes it");
});
