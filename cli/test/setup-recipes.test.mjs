import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// #17: one setup recipe per vendor, next to the key walkthroughs in providers/.
const DIR = fileURLToPath(new URL("../../.agents/skills/secrets/setup/", import.meta.url));
const ADDONS = fileURLToPath(new URL("../../stacks/tanstack-start-addons/", import.meta.url));
const RECIPES = ["drizzle", "shadcn", "tailwind", "stripe", "supabase", "sentry", "resend", "posthog"];
const SECTIONS = ["## Ask first", "## The vendor's steps, reviewed", "## Kit rules on top", "## Verify", "## Sources"];
// Each add-on that wires a vendor points to that vendor's recipe.
const ADDON_RECIPE = { stripe: "stripe", "database-supabase": "supabase", sentry: "sentry", "email-resend": "resend", analytics: "posthog" };

const read = (name) => readFileSync(`${DIR}${name}.md`, "utf8");
const shellBlocks = (doc) => [...doc.matchAll(/```(?:sh|bash)\n([\s\S]*?)```/g)].map((m) => m[1]);

test("every vendor has a dated setup recipe with the same sections", () => {
  for (const name of RECIPES) {
    assert.ok(existsSync(`${DIR}${name}.md`), `setup/${name}.md is missing`);
    const doc = read(name);
    assert.match(doc, /^Last checked: 2026-11-23\./m, `${name}: no "Last checked" date`);
    for (const section of SECTIONS) assert.ok(doc.includes(`\n${section}`), `${name}: no "${section}"`);
  }
});

test("commands the agent or the person runs keep the kit's install rules", () => {
  for (const name of RECIPES) {
    for (const block of shellBlocks(read(name))) {
      assert.doesNotMatch(block, /@latest\b/, `${name}: @latest in a command to run`);
      assert.doesNotMatch(block, /\bnpm (?:install|i) (?:-g|--global)\b|\s--global\b/, `${name}: a global install`);
      assert.doesNotMatch(block, /\|\s*(?:ba)?sh\b/, `${name}: a script piped into a shell`);
      // `pnpm dlx <pkg> <args>` pins its one package; `pnpm add` pins every package it names.
      for (const [, verb, rest] of block.matchAll(/pnpm (dlx|add)\b([^\n]*)/g)) {
        const words = rest.trim().split(/\s+/).filter((w) => w && !w.startsWith("-"));
        for (const pkg of verb === "dlx" ? words.slice(0, 1) : words)
          assert.match(pkg, /.@\d+\.\d+\.\d+(?:-[\w.]+)?$/, `${name}: ${pkg} is not pinned exactly`);
      }
    }
  }
});

test("third-party installers are named as such and asked about first", () => {
  for (const name of RECIPES) {
    const doc = read(name);
    if (/plugins add|add-mcp/.test(doc)) assert.match(doc, /third-party installer/, `${name}: names an installer without saying who publishes it`);
  }
});

test("the Sentry handoff code is treated as a credential", () => {
  const doc = read("sentry");
  assert.match(doc, /handoff code is a credential/i);
  assert.match(doc, /never in chat/i);
});

test("each add-on that wires a vendor points to its setup recipe", () => {
  for (const [addon, recipe] of Object.entries(ADDON_RECIPE)) {
    const doc = readFileSync(`${ADDONS}${addon}/ADDON.md`, "utf8");
    assert.ok(doc.includes(`.agents/skills/secrets/setup/${recipe}.md`), `${addon}/ADDON.md doesn't point to setup/${recipe}.md`);
  }
});
