// Tests that the harness tests leave no temp folders behind (#142). Running every harness test in a child
// would double `npm run test:evals`, so one test runs a sample that uses each folder maker, and a guard
// makes sure no other test file makes its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// setup() alone, setup() with a real harness run (which makes and removes its own folder), and failedChecks().
const SAMPLE = ["^bad flags", "^fail: a failing 'with' check", "^AC-143-1"];
const FILES = ["run.test.mjs", "decision-lifts-gate.test.mjs"].map((name) => join(HERE, name));
// The folder makers, as paths from this folder: each removes what it makes, and makes it with one mkdtemp call (#180).
const MAKERS = ["harness.mjs", "failed-checks.mjs"];
// npm's own compile cache: one fixed folder every npm command on the machine shares and reuses. Not a test's.
const NPM_CACHE = "node-compile-cache";
// The nested run's env leaves these out: the parent's test context and colour switches.
const NOT_PASSED = ["NODE_TEST_CONTEXT", "FORCE_COLOR", "NO_COLOR"];
const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

test("AC-142-2: WHEN a sample of the eval tests runs with TMPDIR set to an empty folder THEN the folder is empty afterwards", { skip: skipWin }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "evals-empty-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // The nested runner must not think it's a child of this one, or it reports in the parent's format. TAP, uncoloured,
  // because newer Node prints the spec report when piped and FORCE_COLOR colours it (#277).
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !NOT_PASSED.includes(name)));
  const args = ["--test", "--test-reporter=tap", ...SAMPLE.map((p) => `--test-name-pattern=${p}`), ...FILES];
  const r = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...env, TMPDIR: dir, TMP: dir, TEMP: dir }, timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout.slice(-2000));
  assert.match(r.stdout, new RegExp(`^# pass ${SAMPLE.length}$`, "m"), "every sample test ran");
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});

const OWN = fileURLToPath(import.meta.url).split(/[\\/]/).at(-1);

const CALL = /\bmkdtemp(?:Sync)?\(/g;
// What comes just before a maker's one allowed tmpdir(: its mkdtemp call, so the folder is the one it removes.
const IN_MKDTEMP = /\bmkdtemp(?:Sync)?\(\s*(?:join\(\s*)?$/;
// The dry run's results folder: the run never makes it, and the dry-run tests check it doesn't exist.
const NEVER_MADE_BEFORE = /\bjoin\(\s*$/;
const NEVER_MADE_AFTER = /^\),\s*"evals-never"\)/;
const INTO_MKDIR = /\bmkdir(?:Sync)?\(\s*join\(\s*$/;

// Every mention of tmpdir: a call (a space before its paren too), a plain import, or the function saved or renamed (#229).
const TMPDIR = /\btmpdir\b(\s*\()?/g;
const IN_IMPORT = /\bimport\s*\{[^}]*$/;
const SAVED_AS = /\b(?:const|let|var)\s+([\w$]+)\s*=\s*join\(\s*$/;
const TEMP_ENV = /process\.env\s*(?:\??\.\s*|\[\s*["'`])(TMPDIR|TMP|TEMP)\b["'`]?\s*\]?/g;

/** Whether the never-made folder, saved to a variable just before, is later passed to a mkdir (#229). */
function madeLater(text, before) {
  const name = before.match(SAVED_AS)?.[1];
  return Boolean(name) && new RegExp(String.raw`\bmkdir(?:Sync)?\([^)]*(?<![.\w$])${name}\b`).test(text);
}

/** Whether the tmpdir mention m is allowed: imported under its own name, a maker's mkdtemp folder, or the never-made folder. */
function allowed(text, m, maker) {
  const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
  if (!m[1]) return IN_IMPORT.test(before) && /^\s*[,}]/.test(after);
  if (maker && IN_MKDTEMP.test(before)) return true;
  return NEVER_MADE_BEFORE.test(before) && NEVER_MADE_AFTER.test(after) && !INTO_MKDIR.test(before) && !madeLater(text, before);
}

// A read saved to a plain name, and the two ways that name may be used again: put back into the env, or compared.
const SAVED = /(?<![.\w$])([\w$]+)\s*=\s*$/;
const PUT_BACK = /process\.env\s*(?:\??\.\s*[\w$]+|\[[^\]]*\])\s*=\s*$/;
const COMPARED = [/[!=]==?\s*$/, /^\s*[!=]==?/];

/** The text with its one-line quoted strings and line comments blanked, so a word in a message isn't read as code. */
const code = (text) => text.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*/g, (s) => " ".repeat(s.length));

/** Whether a name the env's temp folder was saved to is used other than declared, set, put back or compared (#229 review). */
function usesSaved(text, name) {
  const body = code(text);
  const word = new RegExp(String.raw`(?<![.\w$])${name.replaceAll("$", "\\$")}(?![\w$])`, "g");
  return [...body.matchAll(word)].some((m) => {
    const before = body.slice(0, m.index), after = body.slice(m.index + m[0].length);
    if (/^\s*=(?!=)/.test(after) || PUT_BACK.test(before) || /\b(?:let|var)\s+$/.test(before)) return false;
    return !COMPARED[0].test(before) && !COMPARED[1].test(after);
  });
}

/**
 * Whether the env's temp folder is read as a folder to use. A test may set it, delete it, or save it to put back
 * (`const was = process.env.TMPDIR;`, `{ TMPDIR: process.env.TMPDIR }`); any other read counts as a use (#229).
 * A name it was saved to may only be put back or compared; a key it was saved under isn't followed.
 */
function readsTempEnv(text) {
  return [...text.matchAll(TEMP_ENV)].some((m) => {
    const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
    if (/^\s*=(?!=)/.test(after) || /\bdelete\s+$/.test(before)) return false;
    if (new RegExp(`\\b${m[1]}\\s*:\\s*$`).test(before)) return false;
    const saved = /^\s*;/.test(after) && before.match(SAVED)?.[1];
    return saved ? usesSaved(text, saved) : true;
  });
}

/** Whether a file's text makes a temp folder its maker's allowance doesn't cover, judging each mention on its own. */
function leaks(text, maker) {
  if (maker ? (text.match(CALL) ?? []).length > 1 : /mkdtemp/.test(text)) return true;
  if (readsTempEnv(text)) return true;
  return [...text.matchAll(TMPDIR)].some((m) => !allowed(text, m, maker));
}

/** The .mjs, .js and .cjs files in dir and its subfolders that make a temp folder no maker removes, as paths from dir. */
function findLeaks(dir) {
  return readdirSync(dir, { recursive: true })
    .map((name) => name.split(/[\\/]/).join("/"))
    .filter((name) => /\.[cm]?js$/.test(name) && name !== OWN)
    .filter((name) => leaks(readFileSync(join(dir, name), "utf8"), MAKERS.includes(name)));
}

test("AC-142-2: only the folder makers make temp folders, so every eval test's folders are removed", () => {
  const leaks = findLeaks(HERE);
  assert.deepEqual(leaks, [], "use setup() in harness.mjs or failedChecks() in failed-checks.mjs");
});

const IMPORT = "import { mkdtempSync } from \"node:fs\";\nimport { homedir, tmpdir } from \"node:os\";\n";
const MAKE = "const dir = mkdtempSync(join(tmpdir(), \"evals-test-\"));\n";
const OWN_FOLDER = "mkdirSync(join(tmpdir(), \"evals-mine\"), { recursive: true });\n";
// Each case is a planted folder of files, and the files the guard must name.
const PLANTED = {
  "a test file that makes its own folder": [{ "planted.test.mjs": OWN_FOLDER }, ["planted.test.mjs"]],
  "a helper in a subfolder that makes its own folder": [{ "sub/planted.mjs": OWN_FOLDER }, ["sub/planted.mjs"]],
  "a test file in a subfolder that calls mkdtemp": [{ "sub/deeper/planted.test.mjs": MAKE }, ["sub/deeper/planted.test.mjs"]],
  "a maker that gains a second mkdtemp": [{ "harness.mjs": `${MAKE}${MAKE}` }, ["harness.mjs"]],
  "a maker that also makes its own folder": [{ "failed-checks.mjs": `${MAKE}${OWN_FOLDER}` }, ["failed-checks.mjs"]],
  "a maker's name in a subfolder": [{ "sub/harness.mjs": MAKE }, ["sub/harness.mjs"]],
  // Each tmpdir( call is judged on its own, not by the line it's on (#180 review).
  "a folder made on the same line as the never-made folder": [
    { "planted.test.mjs": "mkdirSync(join(tmpdir(), \"mine\")); const never = join(tmpdir(), \"evals-never\");\n" }, ["planted.test.mjs"]],
  "the never-made folder passed to a mkdir": [
    { "planted.test.mjs": "mkdirSync(join(tmpdir(), \"evals-never\"), { recursive: true });\n" }, ["planted.test.mjs"]],
  "a maker's mkdtemp line that also makes its own folder": [
    { "harness.mjs": "const dir = mkdtempSync(join(tmpdir(), \"evals-test-\")); mkdirSync(join(tmpdir(), \"x\"));\n" }, ["harness.mjs"]],
  "a .js helper that calls mkdtemp": [{ "sub/planted.js": MAKE }, ["sub/planted.js"]],
  "a .cjs helper that calls mkdtemp": [{ "sub/planted.cjs": MAKE }, ["sub/planted.cjs"]],
  // A tmpdir saved, renamed, called with a space, TMPDIR read from the env, or the never-made folder saved then made (#229).
  "tmpdir saved to a variable": [{ "planted.test.mjs": "const t = tmpdir;\nmkdirSync(join(t(), \"x\"));\n" }, ["planted.test.mjs"]],
  "tmpdir renamed on import": [{ "planted.test.mjs": "import { tmpdir as td } from \"node:os\";\nmkdirSync(join(td(), \"x\"));\n" }, ["planted.test.mjs"]],
  "tmpdir called with a space": [{ "planted.test.mjs": "mkdirSync(join(tmpdir (), \"x\"));\n" }, ["planted.test.mjs"]],
  "TMPDIR read from the env": [{ "planted.test.mjs": "mkdirSync(join(process.env.TMPDIR, \"x\"));\n" }, ["planted.test.mjs"]],
  "the never-made folder saved, then passed to a mkdir": [
    { "planted.test.mjs": "const never = join(tmpdir(), \"evals-never\");\nmkdirSync(never, { recursive: true });\n" }, ["planted.test.mjs"]],
  "TMPDIR set, saved and put back": [{ "planted.test.mjs": "let old;\nold = process.env.TMP;\nprocess.env.TMP = old;\nconst was = process.env.TMPDIR;\nconst saved = { TMPDIR: process.env.TMPDIR };\nprocess.env.TMPDIR = dir;\ndelete process.env.TMPDIR;\nif (was === undefined) delete process.env.TMPDIR;\nelse process.env[\"TMPDIR\"] = was;\nassert.ok(found, \"no folder was found\"); // was\n" }, []],
  // A saved read used as a folder (#229 review).
  "TMPDIR saved, then joined": [{ "planted.test.mjs": "const was = process.env.TMPDIR;\nmkdirSync(was + \"/x\");\n" }, ["planted.test.mjs"]],
  "TMPDIR saved, then passed on": [{ "planted.test.mjs": "let saved;\nsaved = process.env.TEMP;\nmkdirSync(join(saved, \"x\"));\n" }, ["planted.test.mjs"]],
  "TMPDIR saved, then in a template": [{ "planted.test.mjs": "const $t = process.env.TMP;\nmkdirSync(`${$t}/x`);\n" }, ["planted.test.mjs"]],
  "TMPDIR saved to a property": [{ "planted.test.mjs": "box.dir = process.env.TMPDIR;\n" }, ["planted.test.mjs"]],
  "each maker's one mkdtemp, and a dry run's folder that is never made": [
    { "harness.mjs": `${IMPORT}${MAKE}`, "failed-checks.mjs": `${IMPORT}${MAKE}`,
      "dry-run.test.mjs": `import { tmpdir } from "node:os";\nconst never = join(tmpdir(), "evals-never");\nrun("--dry-run", "--results-dir", never);\n` }, []],
};

test("AC-180-2: WHEN a planted file in evals/test/ or a subfolder calls mkdirSync(join(tmpdir(), ...)), or an allowed file gains a second mkdtemp THEN the guard fails", (t) => {
  const root = mkdtempSync(join(tmpdir(), "evals-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [i, [name, [files, want]]] of Object.entries(PLANTED).entries()) {
    const dir = join(root, String(i));
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    assert.deepEqual(findLeaks(dir), want, name);
  }
});
