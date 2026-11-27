import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const folders = ["cli/test", "evals/test"].map((f) => join(root, f));

// A put-back line: `process.env.NAME = saved;` or `process.env[key] = saved;`, where `saved` was read from process.env.
const PUT_BACK = /^\s*(?:(else)\s+)?process\.env(?:\.[A-Za-z_]+|\[[^\]]+\])\s*=\s*([A-Za-z_$][\w$]*)\s*;/;
const SAVED = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\b/g;

/** Lines that put a saved env value back without an `else` after an unset check. */
function unsafePutBacks(text) {
  const saved = new Set([...text.matchAll(SAVED)].map((m) => m[1]));
  const bad = [];
  text.split("\n").forEach((line, i) => {
    const m = PUT_BACK.exec(line);
    if (m && !m[1] && saved.has(m[2])) bad.push(i + 1);
  });
  return bad;
}

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(join(dir, e.name)) : /\.m?js$/.test(e.name) ? [join(dir, e.name)] : []);

test("AC-282-2: WHEN a test file puts back an env variable that was unset THEN it deletes it, never stores \"undefined\"", () => {
  assert.deepEqual(unsafePutBacks("const saved = process.env.ONRAILS_X;\nprocess.env.ONRAILS_X = saved;\n"), [2], "the scan misses a bare put-back");
  assert.deepEqual(unsafePutBacks("const saved = process.env.ONRAILS_X;\nif (saved === undefined) delete process.env.ONRAILS_X;\nelse process.env.ONRAILS_X = saved;\n"), []);
  const found = files(folders[0]).concat(files(folders[1]))
    .flatMap((f) => unsafePutBacks(readFileSync(f, "utf8")).map((n) => `${relative(root, f)}:${n}`));
  assert.deepEqual(found, [], "put an unset variable back with `delete process.env.X`, inside `if (saved === undefined) … else …`");
});

