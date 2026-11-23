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

// #13: `clerk env pull` writes the publishable key as VITE_CLERK_PUBLISHABLE_KEY for TanStack Start
// (clerk/cli framework.ts), the name in Clerk's quickstart. Every place the pack's keys are named
// must use it, so pulled keys work with no rename.
test("the Clerk connect block, .env.example and the env schema use Clerk's name for the publishable key", () => {
  const pack = fileURLToPath(new URL("../../stacks/tanstack-start/", import.meta.url));
  const clerk = parseProvider("clerk", readFileSync(DIR + "clerk.md", "utf8"));
  const example = readFileSync(pack + ".env.example", "utf8");
  const schema = readFileSync(pack + "src/lib/env-schema.ts", "utf8");
  const listed = [...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
  assert.ok(clerk.vars.VITE_CLERK_PUBLISHABLE_KEY, "clerk.md's connect block fills VITE_CLERK_PUBLISHABLE_KEY");
  assert.equal(clerk.vars.CLERK_PUBLISHABLE_KEY, undefined, "clerk.md's connect block still fills the old name");
  for (const name of Object.keys(clerk.vars)) {
    assert.ok(listed.includes(name), `${name} is in clerk.md's connect block but not in the pack's .env.example`);
    assert.match(schema, new RegExp(`^    ${name}: `, "m"), `${name} is not in the pack's runtime env schema`);
  }
  assert.ok(!listed.includes("CLERK_PUBLISHABLE_KEY"), ".env.example still lists the old name");
});

test("no walkthrough tells the person to rename the key Clerk's CLI writes", () => {
  const clerk = readFileSync(DIR + "clerk.md", "utf8");
  assert.doesNotMatch(clerk, /Rename `?VITE_CLERK_PUBLISHABLE_KEY/i);
  assert.doesNotMatch(clerk, /Rename one line/i);
});
