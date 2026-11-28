import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseProvider, shapeProblem } from "../../stacks/tanstack-start/scripts/connect/providers.ts";
import { groupsFor } from "../../stacks/tanstack-start/scripts/connect/places.ts";

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

// #227: on ci = "local", connect writes no GitHub values (#139), and the sentry add-on's deploys read these three
// from the deploy's shell, kept in .env.sentry.local (its ADDON.md, step 8).
test("AC-227-2: WHEN pnpm connect sentry runs on ci = \"local\" THEN the three Sentry deploy values have a local place", () => {
  const sentry = parseProvider("sentry", readFileSync(DIR + "sentry.md", "utf8"));
  for (const name of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]) {
    const places = groupsFor(sentry.vars[name], "none").flatMap((g) => g.places);
    assert.deepEqual(places.map((p) => p.kind === "file" && p.path), [".env.sentry.local"], name);
    // On ci = "actions" the GitHub places stay.
    assert.ok(groupsFor(sentry.vars[name], "environment").flatMap((g) => g.places).some((p) => p.kind === "github"), name);
  }
});

// #444: on ci = "local" .env.sentry.local feeds both deploys, so its one group is named for them.
test("AC-444-1: WHEN pnpm connect sentry runs on ci = \"local\" THEN its three deploy values are asked for every deploy (test and production)", () => {
  const sentry = parseProvider("sentry", readFileSync(DIR + "sentry.md", "utf8"));
  for (const name of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"])
    assert.deepEqual(groupsFor(sentry.vars[name], "none").map((g) => g.name), ["every deploy (test and production)"], name);
});

test("AC-444-2: WHEN pnpm connect sentry runs on ci = \"actions\" THEN its three deploy values keep today's groups", () => {
  const sentry = parseProvider("sentry", readFileSync(DIR + "sentry.md", "utf8"));
  for (const name of ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"])
    for (const mode of ["environment", "repository"])
      assert.deepEqual(groupsFor(sentry.vars[name], mode).map((g) => g.name), ["local and test", "production"], `${name} (${mode})`);
});

// #459: the "every deploy" name comes from a rule on the places (decision 444-1), so a new provider value could trip
// it. These two tests walk every provider file and fail when one does.
const EVERY_DEPLOY = "every deploy (test and production)";

/** Every var of every provider file, with each group it is asked in, in each secrets mode. */
function connectGroups() {
  const rows = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
    const provider = parseProvider(file.slice(0, -3), readFileSync(DIR + file, "utf8"));
    if (!provider) continue;
    for (const [name, spec] of Object.entries(provider.vars))
      for (const mode of ["none", "environment", "repository"])
        for (const group of groupsFor(spec, mode)) rows.push({ provider: provider.id, name, spec, mode, group });
  }
  return rows;
}

test("AC-459-1: WHEN the connect places are built for every provider THEN only Sentry's three values carry the \"every deploy\" group name", () => {
  const named = connectGroups().filter((r) => r.group.name === EVERY_DEPLOY);
  assert.deepEqual(
    named.map((r) => `${r.provider}:${r.name}:${r.mode}`).sort(),
    ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"].map((name) => `sentry:${name}:none`),
  );
});

test("AC-459-2: WHEN a value in the \"every deploy\" group has a key-prefix rule THEN no such value exists to apply the production rule to", () => {
  // No value in that group has a prefix shape today, so the shape check has no rule to apply: the guard is that none
  // appears. One that does needs the group counted as production in prefixesFor (providers.ts); decision 459-1.
  const withPrefix = connectGroups().filter((r) => r.group.name === EVERY_DEPLOY && r.spec.shape?.prefix);
  assert.deepEqual(withPrefix.map((r) => `${r.provider}:${r.name}`), []);
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
