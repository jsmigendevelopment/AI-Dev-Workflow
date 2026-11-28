// #487: the email-resend add-on's own files failed the pack's lint on a fresh app (five type-aware errors and
// two import-order errors), so `pnpm check` stopped at lint after the add-on. The full proof is a fresh app:
// `init`, `add tanstack-start`, the add-on, `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm check`.
// That needs a network install, so this test pins the code shapes that failed, in the add-on's files. A shape
// that passes here is not proof, but a shape that returns fails the build of the kit at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ADDONS } from "./addon-lint-step.mjs";

const FILES = join(ADDONS, "email-resend", "files");
const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
const sources = walk(FILES).filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ path: relative(FILES, f).replaceAll("\\", "/"), text: readFileSync(f, "utf8") }));

// Each shape is one the pack's typed ESLint rules refused, with the rule and the fix.
const SHAPES = [
  { rule: "no-unnecessary-type-assertion", re: /\bawait\s+[\w.]+\.json\(\)\)?\s+as\b/, fix: "write `await response.json<T>()`" },
  { rule: "no-base-to-string", re: /\bString\(\s*(?:init\??\.body|error|err|e)\s*\)/, fix: "read `.message`, or check `typeof body === 'string'`" },
  { rule: "no-unsafe-assignment", re: /:\s*expect\.(?:any|anything|stringContaining|stringMatching|objectContaining|arrayContaining)\(/, fix: "assert that value on its own line" },
];

test("AC-487-1: WHEN the email-resend add-on's files are linted THEN none holds a shape the pack's typed rules refused", () => {
  assert.ok(sources.some((s) => s.path === "src/server/email.resend.ts") && sources.some((s) => s.path === "src/server/email.resend.test.ts"),
    "the adapter and its test are found");
  for (const { path, text } of sources) {
    for (const { rule, re, fix } of SHAPES) assert.doesNotMatch(text, re, `${path}: ${rule} refuses this (${fix})`);
  }
});

test("AC-487-1: WHEN the shapes are run on the code that failed THEN each is found", () => {
  const failed = [
    "const data = (await response.json()) as { id?: unknown }",
    "JSON.parse(String(init?.body))",
    "expect(String(error)).toContain('422')",
    "expect(init?.headers).toMatchObject({ 'User-Agent': expect.any(String) })",
  ];
  for (const shape of SHAPES) assert.ok(failed.some((line) => shape.re.test(line)), `${shape.rule} is found in the old code`);
});

test("AC-487-1: WHEN a file imports from a package, then `@/`, then a relative path THEN each group is apart by a blank line, as the pack's import sort wants", () => {
  const rank = (spec) => (spec.startsWith(".") ? 2 : spec.startsWith("@/") ? 1 : 0);
  for (const { path, text } of sources) {
    const lines = text.split("\n");
    let last = null;
    for (const [i, line] of lines.entries()) {
      const spec = /^import\b.*?\bfrom\s+'([^']+)'/.exec(line)?.[1];
      if (!spec) continue;
      const here = rank(spec);
      if (last) {
        assert.ok(here >= last.rank, `${path}:${i + 1}: \`${spec}\` comes after a later group`);
        // A group change needs a blank line between; the same group needs none.
        assert.equal(lines[i - 1] === "", here !== last.rank, `${path}:${i + 1}: ${here !== last.rank ? "a blank line goes between import groups" : "no blank line inside an import group"}`);
      }
      last = { rank: here };
    }
  }
});
