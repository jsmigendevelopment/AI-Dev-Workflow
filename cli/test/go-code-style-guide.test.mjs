// The Go version of the code rules that name a TypeScript tool (#533): one section per such rule of
// guide/code-style.md, numbered the same, linked from the guide index and the original, and the two
// TypeScript-only lines of AGENTS.md naming the stack's equivalent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { safeEnv } from "./helpers.mjs";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const GO_GUIDE = "guide/code-style-go.md";

// A rule "names a TypeScript tool" when its text holds one of these.
const TS_TOOL = /lib\/[\w-]+\.ts|\.tsx|`any`|ts-ignore|eslint|knip|index\.ts|`@\//i;

// Rules that name no tool but that AC-533-5 compares with AGENTS.md's Code rules: file size, no empty
// catch, comments say why. Their Go sections keep the same number.
const SHARED = [5, 11, 12];

/** Every `### <n>. <title>` section of a guide, as Map(n -> {title, body}). */
function sections(text) {
  const found = new Map();
  const parts = text.split(/^(?=### \d+\. )/m).filter((p) => /^### \d+\. /.test(p));
  for (const part of parts) {
    const [head] = part.split("\n");
    const n = Number(head.match(/^### (\d+)\. /)[1]);
    found.set(n, { title: head, body: part.split(/^## /m)[0] });
  }
  return found;
}

const tsRules = () => [...sections(read("guide/code-style.md"))].filter(([, s]) => TS_TOOL.test(s.body)).map(([n]) => n);

test("AC-533-1: WHEN the test reads both guides THEN each numbered section of code-style.md that names a TypeScript tool has a matching section in the Go guide", () => {
  assert.ok(existsSync(new URL(GO_GUIDE, root)), `${GO_GUIDE} exists`);
  const ts = sections(read("guide/code-style.md"));
  const go = sections(read(GO_GUIDE));
  const named = tsRules();
  assert.deepEqual(named, [3, 4, 14, 15], "the TypeScript-tool rules are 3, 4, 14 and 15");
  for (const n of [...named, ...SHARED]) {
    assert.ok(ts.has(n), `rule ${n} is in code-style.md`);
    assert.ok(go.has(n), `rule ${n} is in ${GO_GUIDE}`);
    assert.match(go.get(n).body, /^```go$/m, `rule ${n} has a short Go example`);
    assert.match(go.get(n).body, /^\*\*Kept by:\*\* /m, `rule ${n} says what keeps it`);
    assert.match(go.get(n).body, /^\*\*Why:\*\* /m, `rule ${n} says why`);
  }
  // The same topic in both: the heading of each Go section shares a word with the original's.
  for (const n of [...named, ...SHARED]) {
    const words = (s) => new Set(s.replace(/^### \d+\. /, "").toLowerCase().match(/[a-z]{4,}/g));
    const shared = [...words(go.get(n).title)].filter((w) => words(ts.get(n).title).has(w));
    assert.ok(shared.length > 0, `rule ${n} has the same topic in both guides`);
  }
});

test("AC-533-1 support: the Go sections carry the rules the issue names", () => {
  const go = sections(read(GO_GUIDE));
  assert.match(go.get(3).body, /fmt\.Print/);
  assert.match(go.get(4).body, /interface\{\}/);
  assert.match(go.get(4).body, /`\/\/nolint`/);
  assert.match(go.get(5).body, /funlen/);
  assert.match(go.get(5).body, /file-length-limit/);
  assert.match(go.get(11).body, /%w/);
  assert.match(go.get(14).body, /gofmt/);
  assert.match(go.get(14).body, /`init\(\)`/);
  assert.match(go.get(14).body, /util/);
  assert.match(go.get(15).body, /internal\/platform\/money/);
  assert.match(go.get(15).body, /internal\/platform\/clock/);
});

test("AC-533-1 support: the lint table has a row for each Go section and names the tools the toolchain dossier picked", () => {
  const go = read(GO_GUIDE);
  const table = go.slice(go.search(/^## What tools enforce/m));
  assert.ok(table.length > 0, "the guide ends with a table of what tools enforce");
  for (const n of [3, 4, 5, 11, 12, 14, 15]) assert.match(table, new RegExp(`^\\| ${n} \\|`, "m"), `row ${n}`);
  for (const tool of ["golangci-lint", "depguard", "funlen", "nolintlint", "revive", "go-arch-lint", "gofmt"]) {
    assert.ok(table.includes(tool), `the table names ${tool}`);
  }
});

test("AC-533-2: WHEN the test reads the Go guide THEN it names no .tsx, ESLint, knip, Zod, Drizzle or lib/*.ts path, and it is under 300 lines", () => {
  const go = read(GO_GUIDE);
  assert.ok(!/\.tsx/.test(go), "names .tsx");
  assert.ok(!/lib\/[\w-]*\.ts\b|lib\/\*\.ts/.test(go), "names a lib/*.ts path");
  for (const name of ["ESLint", "knip", "Zod", "Drizzle"]) {
    assert.ok(!go.toLowerCase().includes(name.toLowerCase()), `${GO_GUIDE} names ${name}`);
  }
  const lines = go.replace(/\n$/, "").split("\n").length;
  assert.ok(lines < 300, `${GO_GUIDE} has ${lines} lines`);
});

test("AC-533-3: WHEN the test reads the guide index and code-style.md THEN both link to the Go guide", () => {
  assert.match(read("guide/README.md"), /\]\(code-style-go\.md\)/);
  assert.match(read("guide/code-style.md"), /\]\(code-style-go\.md\)/);
});

/** The lines of AGENTS.md's Code rules found by what they say, not by line number: they move. */
function codeRule(re) {
  const hits = read("AGENTS.md").split("\n").filter((l) => l.startsWith("- ") && re.test(l));
  assert.equal(hits.length, 1, `exactly one AGENTS.md rule matches ${re}`);
  return hits[0];
}

test("AC-533-4: WHEN the test reads AGENTS.md THEN the escape-hatch and barrel rules name the stack's equivalent (//nolint in Go), and sync-skills passes", () => {
  const hatches = codeRule(/@ts-ignore/);
  const barrel = codeRule(/barrel/);
  // The TypeScript meaning stays word for word.
  assert.match(hatches, /No `any`, `@ts-ignore`, `as unknown as` or `eslint-disable`/);
  assert.match(hatches, /unless a comment gives the reason and an issue number\.$/);
  assert.match(barrel, /^- No barrel `index\.ts` files/);
  assert.match(barrel, /Import from the file itself\. Lint guards module boundaries\.$/);
  // The Go equivalent is added to both.
  assert.match(hatches, /the stack's equivalent \(`\/\/nolint` in Go\)/);
  assert.match(barrel, /the stack's equivalent \(in Go, a package that only re-exports\)/);
  const sync = spawnSync(process.execPath, ["scripts/sync-skills.mjs", "--check"], { cwd: fileURLToPath(root), env: safeEnv(), encoding: "utf8" });
  assert.equal(sync.status, 0, `sync-skills --check: ${sync.stdout}${sync.stderr}`);
});

// AC-533-5 is an `agent` check (a reviewer compares the Go guide with AGENTS.md's Code rules). This only
// guards the numbers that rule leans on, so a rewrite can't quietly change one of them.
test("AC-533-5 support: the Go guide keeps the 300 and 500 line limits and the 60 line function, like AGENTS.md", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /Files warn at 300 lines and stop at 500\. Functions stay under about 60\. No empty catch\. Comments say why\./);
  const five = sections(read(GO_GUIDE)).get(5).body;
  assert.match(five, /300/);
  assert.match(five, /500/);
  assert.match(five, /60/);
  assert.match(sections(read(GO_GUIDE)).get(11).body, /empty/i);
  assert.match(sections(read(GO_GUIDE)).get(12).body, /why/i);
});
