// The build and pr-review checklists and web-security read the same for a TypeScript backend and a Go one (#534):
// the rule stays on the line, the how lives in the conventions guide for the stack, and web-security has a Go section.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const build = read(".agents/skills/build/SKILL.md");
const review = read(".agents/skills/pr-review/SKILL.md");
const security = read(".agents/skills/web-security/SKILL.md");

/** The text between `start` and the next `end` after it. */
function between(text, start, end) {
  const from = text.indexOf(start);
  assert.ok(from > -1, `"${start}" is in the skill`);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? undefined : to);
}

// The lines that name a rule the Go guide has a version of: label -> the rule number in both conventions guides.
const BUILD_LABELS = { Errors: 5, Logs: 13, API: 8, Money: 10, Time: 11, Database: 12, Env: 16 };
const REVIEW_LABELS = { Errors: 5, "API versions": 8, OpenAPI: 15, Money: 10, Time: 11, Database: 12, Logging: 13, Env: 16 };

/** The checklist line that starts with `- <box>**<label>:**`, or fails the test. */
function line(block, box, label) {
  const found = block.split("\n").map((l) => l.trimStart()).find((l) => l.startsWith(`- ${box}**${label}:**`));
  assert.ok(found, `a "${label}" line is there`);
  return found;
}

const buildRules = between(build, "## App rules", "\n## Never");
const reviewStep6 = between(review, "6. **App conventions**", "\n7. **Bugs");

// A TypeScript file or library, which a Go builder would be told to use.
const TS_ONLY = /\blib\/[\w-]+\.ts\b|\b[\w-]+\.tsx?\b|\bZod\b|\bDrizzle\b|\bAppError\b|server function|TanStack/i;

test("AC-534-1: WHEN the test reads build's App rules THEN the server-side lines name no TypeScript file or library and each points at both conventions guides", () => {
  for (const [label, rule] of Object.entries(BUILD_LABELS)) {
    const l = line(buildRules, "", label);
    assert.doesNotMatch(l, TS_ONLY, `build's ${label} line names a TypeScript file or library`);
    assert.match(l, /app-conventions\.md`/, `build's ${label} line points at the TypeScript guide`);
    assert.match(l, /app-conventions-go\.md`/, `build's ${label} line points at the Go guide`);
    assert.match(l, new RegExp(`\\brules? ${rule}\\b`, "i"), `build's ${label} line names rule ${rule}`);
  }
});

test("AC-534-1: WHEN the test reads pr-review's step 6 THEN the server-side lines name no TypeScript file or library and each points at both conventions guides", () => {
  for (const [label, rule] of Object.entries(REVIEW_LABELS)) {
    const l = line(reviewStep6, "[ ] ", label);
    assert.doesNotMatch(l, TS_ONLY, `pr-review's ${label} line names a TypeScript file or library`);
    assert.match(l, /app-conventions\.md`/, `pr-review's ${label} line points at the TypeScript guide`);
    assert.match(l, /app-conventions-go\.md`/, `pr-review's ${label} line points at the Go guide`);
    assert.match(l, new RegExp(`\\brules? ${rule}\\b`, "i"), `pr-review's ${label} line names rule ${rule}`);
  }
});

test("AC-534-1: WHEN the test reads the code rules and the other step 6 lines THEN none names a TypeScript file or library, and the intro names the Backend row", () => {
  const codeRules = between(build, "## Code rules", "\n## App rules");
  for (const label of ["No escape hatches", "Names and imports"]) {
    const l = line(codeRules, "", label);
    assert.match(l, /code-style-go\.md/, `build's ${label} line points at the Go code style guide`);
    assert.match(l, /code-style\.md/, `build's ${label} line points at the TypeScript code style guide`);
  }
  assert.doesNotMatch(line(codeRules, "", "Names and imports"), /index\.ts|kebab-case/, "build's Names and imports line moved its how to the guide");
  for (const label of ["No barrels", "Translations", "Events"]) {
    assert.doesNotMatch(line(reviewStep6, "[ ] ", label), TS_ONLY, `pr-review's ${label} line names a TypeScript file or library`);
  }
  for (const label of ["Text and events"]) {
    assert.doesNotMatch(line(buildRules, "", label), TS_ONLY, `build's ${label} line names a TypeScript file or library`);
  }
  for (const text of [buildRules, reviewStep6]) assert.match(text, /Backend row/);
});

test("AC-534-1: WHEN the test reads build's References table THEN it lists both conventions guides and each file is there", () => {
  const refs = between(build, "## References", "\n---");
  for (const name of ["app-conventions.md", "app-conventions-go.md"]) {
    assert.match(refs, new RegExp(`\\| \`references/${name.replace(".", "\\.")}\` \\|`), `the table has a row for ${name}`);
    const copy = new URL(`.agents/skills/build/references/${name}`, root);
    assert.ok(existsSync(copy), `${name} is in build/references`);
    assert.equal(readFileSync(copy, "utf8"), read(`guide/${name}`), `${name} in build/references is the guide's text`);
  }
});

test("AC-534-2: WHEN the test reads web-security THEN it has an On a Go API section and rule 4 names DisallowUnknownFields beside z.strictObject", () => {
  assert.match(security, /^## On a Go API\b/m);
  const rule4 = security.split("\n").find((l) => l.startsWith("4. "));
  assert.ok(rule4, "rule 4 is there");
  assert.match(rule4, /`z\.strictObject`/);
  assert.match(rule4, /`json\.Decoder\.DisallowUnknownFields`/);
  assert.match(rule4, /additionalProperties: false/);
});

test("AC-534-5: WHEN the test reads the On a Go API section THEN each bullet carries a checked date and a source, and the host is decision 340-1's", () => {
  const section = between(security, "## On a Go API", "\n## ");
  const bullets = section.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bullets.length >= 4, "the section has its bullets");
  for (const b of bullets) assert.match(b, /\(checked 20\d\d-\d\d(-\d\d)?; [^)]+\)/, `no date and source on: ${b.slice(0, 60)}`);
  assert.match(section, /decision 340-1/);
  for (const word of ["MaxBytesReader", "ReadHeaderTimeout", "TimeoutHandler", "security headers"]) assert.ok(section.includes(word), `${word} is in the section`);
});
