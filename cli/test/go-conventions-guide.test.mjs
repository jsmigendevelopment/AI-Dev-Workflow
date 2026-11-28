// The Go version of the server-side app conventions (#348): one section per server-side rule of
// guide/app-conventions.md, numbered the same, and linked from the guide index and the original.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const GO_GUIDE = "guide/app-conventions-go.md";

// Rule number -> a word its heading must hold, in both guides.
const SECTIONS = new Map([
  [5, /error/i],
  [8, /API/],
  [10, /money/i],
  [11, /time/i],
  [12, /database/i],
  [13, /logging/i],
  [14, /event/i],
  [15, /OpenAPI/],
  [16, /environment/i],
  [18, /access/i],
]);

/** The body of `## <n>. ...` up to the next `## ` heading, or null when there is none. */
function section(text, n) {
  const start = text.search(new RegExp(`^## ${n}\\. `, "m"));
  if (start < 0) return null;
  const rest = text.slice(start);
  const next = rest.slice(3).search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next + 3);
}

test("AC-348-1: WHEN the test reads both guides THEN each of sections 5, 8, 10, 11, 12, 13, 14, 15, 16 and 18 has a matching section in the Go guide", () => {
  assert.ok(existsSync(new URL(GO_GUIDE, root)), `${GO_GUIDE} exists`);
  const ts = read("guide/app-conventions.md");
  const go = read(GO_GUIDE);
  for (const [n, word] of SECTIONS) {
    const original = section(ts, n);
    const goVersion = section(go, n);
    assert.ok(original, `section ${n} is in app-conventions.md`);
    assert.ok(goVersion, `section ${n} is in ${GO_GUIDE}`);
    assert.match(original.split("\n")[0], word, `section ${n} of app-conventions.md is the ${word} section`);
    assert.match(goVersion.split("\n")[0], word, `section ${n} of the Go guide has the same topic`);
    assert.match(goVersion, /^```/m, `section ${n} has a short example`);
  }
});

test("AC-348-2: WHEN the test reads the Go guide THEN it names no TypeScript library and stays under 300 lines", () => {
  const go = read(GO_GUIDE);
  for (const name of ["Zod", "Drizzle", "TanStack", "createServerFn"]) {
    assert.ok(!go.toLowerCase().includes(name.toLowerCase()), `${GO_GUIDE} names ${name}`);
  }
  const lines = go.replace(/\n$/, "").split("\n").length;
  assert.ok(lines < 300, `${GO_GUIDE} has ${lines} lines`);
});

test("AC-348-3: WHEN the test reads the guide index and the TypeScript guide THEN both link to the Go guide", () => {
  assert.match(read("guide/README.md"), /\]\(app-conventions-go\.md\)/);
  assert.match(read("guide/app-conventions.md"), /\]\(app-conventions-go\.md\)/);
});

// AC-348-4 is an `agent` check (a reviewer compares the guide with AGENTS.md's Code rules). This only
// guards the words that rule leans on, so a rewrite can't quietly drop one.
test("AC-348-4 support: the Go guide's money, time, logs, events and access sections name the same things as AGENTS.md", () => {
  const go = read(GO_GUIDE);
  assert.match(section(go, 10), /integer minor units/i);
  assert.match(section(go, 10), /currency/i);
  assert.match(section(go, 11), /UTC/);
  assert.match(section(go, 13), /log\/slog/);
  assert.match(section(go, 14), /track\(\)/);
  assert.match(section(go, 18), /check\(user, action, object\)/);
});
