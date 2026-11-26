import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/secrets/scripts/push-secrets.mjs", import.meta.url));
const PACK_EXAMPLE = fileURLToPath(new URL("../../stacks/tanstack-start/.env.example", import.meta.url));

// #13: what `clerk env pull --instance dev --file .env.test.local` writes for TanStack Start.
test("push-secrets sends the keys Clerk's CLI pulled, under the names the TanStack Start pack reads", () => {
  const dir = tmp("onrails-push-");
  copyFileSync(PACK_EXAMPLE, join(dir, ".env.example"));
  const pk = "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk";
  writeFileSync(join(dir, ".env.test.local"), `VITE_CLERK_PUBLISHABLE_KEY=${pk}\nCLERK_SECRET_KEY=sk_test_DO_NOT_PRINT\n`);
  const out = execFileSync("node", [SCRIPT, "--dry-run", "--wrangler", "--env", "test"], { cwd: dir, encoding: "utf8", env: safeEnv() });
  assert.match(out, /test: would set VITE_CLERK_PUBLISHABLE_KEY as a Cloudflare secret/);
  assert.match(out, /test: would set CLERK_SECRET_KEY as a Cloudflare secret/);
  assert.doesNotMatch(out, /DO_NOT_PRINT|pk_test_/);
});
