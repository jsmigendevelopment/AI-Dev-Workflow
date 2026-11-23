import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseProvider, shapeProblem } from "../../stacks/tanstack-start/scripts/connect/providers.ts";

const DIR = fileURLToPath(new URL("../../.agents/skills/secrets/providers/", import.meta.url));
// Supabase's only secret lives in the person's shell, so its file says why it has no block.
const NO_BLOCK = ["supabase"];

test("every provider walkthrough has a valid connect block that pnpm connect can read", () => {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
    const id = file.slice(0, -3);
    const provider = parseProvider(id, readFileSync(DIR + file, "utf8"));
    if (NO_BLOCK.includes(id)) {
      assert.equal(provider, null, `${file} should have no connect block`);
      continue;
    }
    assert.ok(provider, `${file} has no connect block`);
    for (const [name, section] of Object.entries(provider.sections)) {
      assert.ok(section.steps.length > 1, `${file}: ${name} has no steps to show`);
      for (const step of section.steps) assert.doesNotMatch(step.text, /\[[VU]\]|\*\*/, `${file}: markup left in a step`);
    }
  }
});

test("production refuses Cloudflare's documented Turnstile test keys", () => {
  const cloudflare = parseProvider("cloudflare", readFileSync(DIR + "cloudflare.md", "utf8"));
  for (const name of ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) {
    const shape = cloudflare.vars[name].shape;
    assert.match(shapeProblem(name, "1x0000000000000000000000000000000AA", shape, "production") ?? "", /documented test value/);
    assert.equal(shapeProblem(name, "1x0000000000000000000000000000000AA", shape, "local"), null);
  }
});
