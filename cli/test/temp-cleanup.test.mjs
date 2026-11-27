// Tests that the CLI suite leaves no temp folders behind (#142). Running the whole suite in a child
// would double `npm test`'s time, so one test runs a sample that uses every helper that makes a folder,
// and a guard makes sure every other test file gets its folders from those helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { put, safeEnv, tmp } from "./helpers.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// tmp() and makeKit (rename, update), fakeSystem (fix), fakeGh (local-gate), a spawned CLI (rename, procs), presence.
const SAMPLE = ["rename", "update", "fix", "local-gate", "procs", "presence"].map((name) => `${HERE}${name}.test.mjs`);
// npm's own compile cache: one fixed folder every npm command on the machine shares and reuses. Not a test's.
const NPM_CACHE = "node-compile-cache";

test("AC-142-1: WHEN a sample of the CLI suite runs with TMPDIR set to an empty folder THEN the folder is empty afterwards", () => {
  const dir = tmp("onrails-empty-");
  // The nested runner must not think it's a child of this one, or it reports in the parent's format.
  const env = safeEnv({ NODE_TEST_CONTEXT: undefined, TMPDIR: dir, TMP: dir, TEMP: dir });
  const r = spawnSync(process.execPath, ["--test", ...SAMPLE], { encoding: "utf8", env, timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout.slice(-2000));
  assert.match(r.stdout, /^# pass [1-9]/m, "the sample ran");
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});

// The files that make temp folders and remove them: helpers.mjs when a test file ends, and safe-path-preload.mjs (the
// run's copy of node) when its process exits, which AC-197-2 and AC-197-3 check in safe-path.test.mjs.
// As paths from this folder; each makes its folders with one mkdtemp call (#180).
const REMOVERS = ["helpers.mjs", "safe-path-preload.mjs"];
const OWN = fileURLToPath(import.meta.url).split(/[\\/]/).at(-1);

const CALL = /\bmkdtemp(?:Sync)?\(/g;
// What comes just before a remover's one allowed tmpdir(: its mkdtemp call, so the folder is the one it removes.
const IN_MKDTEMP = /\bmkdtemp(?:Sync)?\(\s*(?:join\(\s*)?$/;

// Every mention of tmpdir: a call (a space before its paren too), a plain import, or the function saved or renamed (#229).
const TMPDIR = /\btmpdir\b(\s*\()?/g;
const IN_IMPORT = /\bimport\s*\{[^}]*$/;
const TEMP_ENV = /process\.env\s*(?:\??\.\s*|\[\s*["'`])(TMPDIR|TMP|TEMP)\b["'`]?\s*\]?/g;

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

/** Whether the tmpdir mention m is allowed: imported under its own name, or called inside a remover's mkdtemp. */
function allowed(text, m, remover) {
  const before = text.slice(0, m.index);
  if (!m[1]) return IN_IMPORT.test(before) && /^\s*[,}]/.test(text.slice(m.index + m[0].length));
  return remover && IN_MKDTEMP.test(before);
}

/** Whether a file's text makes a temp folder it may not: a remover may make one, with one mkdtemp call. Each call counts. */
function leaks(text, remover) {
  if (remover ? (text.match(CALL) ?? []).length > 1 : /mkdtemp/.test(text)) return true;
  if (readsTempEnv(text)) return true;
  return [...text.matchAll(TMPDIR)].some((m) => !allowed(text, m, remover));
}

/** The .mjs, .js and .cjs files in dir and its subfolders that make a temp folder no remover removes, as paths from dir. */
function findLeaks(dir) {
  return readdirSync(dir, { recursive: true })
    .map((name) => name.split(/[\\/]/).join("/"))
    .filter((name) => /\.[cm]?js$/.test(name) && name !== OWN)
    .filter((name) => leaks(readFileSync(join(dir, name), "utf8"), REMOVERS.includes(name)));
}

test("AC-142-1: every CLI test file makes its temp folders through helpers.mjs, which removes them", () => {
  const leaks = findLeaks(HERE);
  assert.deepEqual(leaks, [], "use tmp() from helpers.mjs, so the folder is removed when the file ends");
});

const IMPORT = "import { mkdtempSync } from \"node:fs\";\nimport { homedir, tmpdir } from \"node:os\";\n";
const MAKE = "const dir = mkdtempSync(join(tmpdir(), \"onrails-\"));\n";
const OWN_FOLDER = "mkdirSync(join(tmpdir(), \"onrails-mine\"), { recursive: true });\n";
// Each case is a planted folder of files, and the files the guard must name.
const PLANTED = {
  "a test file that makes its own folder": [{ "planted.test.mjs": OWN_FOLDER }, ["planted.test.mjs"]],
  "a helper in a subfolder that makes its own folder": [{ "sub/planted.mjs": OWN_FOLDER }, ["sub/planted.mjs"]],
  "a test file in a subfolder that calls mkdtemp": [{ "sub/deeper/planted.test.mjs": MAKE }, ["sub/deeper/planted.test.mjs"]],
  "a remover that gains a second mkdtemp": [{ "helpers.mjs": `${MAKE}${MAKE}` }, ["helpers.mjs"]],
  "a remover that also makes its own folder": [{ "safe-path-preload.mjs": `${MAKE}${OWN_FOLDER}` }, ["safe-path-preload.mjs"]],
  "a remover's name in a subfolder": [{ "sub/helpers.mjs": MAKE }, ["sub/helpers.mjs"]],
  // Each tmpdir( call is judged on its own, not by the line it's on (#180 review).
  "a remover's mkdtemp line that also makes its own folder": [
    { "helpers.mjs": "const dir = mkdtempSync(join(tmpdir(), \"onrails-\")); mkdirSync(join(tmpdir(), \"mine\"));\n" }, ["helpers.mjs"]],
  "a .js helper that calls mkdtemp": [{ "sub/planted.js": MAKE }, ["sub/planted.js"]],
  "a .cjs helper that calls mkdtemp": [{ "sub/planted.cjs": MAKE }, ["sub/planted.cjs"]],
  // A tmpdir saved, renamed, called with a space, or TMPDIR read from the env (#229).
  "tmpdir saved to a variable": [{ "planted.test.mjs": "const t = tmpdir;\nmkdirSync(join(t(), \"x\"));\n" }, ["planted.test.mjs"]],
  "tmpdir renamed on import": [{ "planted.test.mjs": "import { tmpdir as td } from \"node:os\";\nmkdirSync(join(td(), \"x\"));\n" }, ["planted.test.mjs"]],
  "tmpdir called with a space": [{ "planted.test.mjs": "mkdirSync(join(tmpdir (), \"x\"));\n" }, ["planted.test.mjs"]],
  "TMPDIR read from the env": [{ "planted.test.mjs": "mkdirSync(join(process.env.TMPDIR, \"x\"));\n" }, ["planted.test.mjs"]],
  "TMPDIR read from the env with brackets": [{ "planted.test.mjs": "const dir = join(process.env[\"TMPDIR\"], \"x\");\n" }, ["planted.test.mjs"]],
  "TMPDIR set, saved and put back": [{ "planted.test.mjs": "let old;\nold = process.env.TMP;\nprocess.env.TMP = old;\nconst was = process.env.TMPDIR;\nconst saved = { TMPDIR: process.env.TMPDIR };\nprocess.env.TMPDIR = dir;\ndelete process.env.TMPDIR;\nif (was === undefined) delete process.env.TMPDIR;\nelse process.env[\"TMPDIR\"] = was;\nassert.ok(found, \"no folder was found\"); // was\n" }, []],
  // A saved read used as a folder (#229 review).
  "TMPDIR saved, then joined": [{ "planted.test.mjs": "const was = process.env.TMPDIR;\nmkdirSync(was + \"/x\");\n" }, ["planted.test.mjs"]],
  "TMPDIR saved, then passed on": [{ "planted.test.mjs": "let saved;\nsaved = process.env.TEMP;\nmkdirSync(join(saved, \"x\"));\n" }, ["planted.test.mjs"]],
  "TMPDIR saved, then in a template": [{ "planted.test.mjs": "const $t = process.env.TMP;\nmkdirSync(`${$t}/x`);\n" }, ["planted.test.mjs"]],
  "TMPDIR saved to a property": [{ "planted.test.mjs": "box.dir = process.env.TMPDIR;\n" }, ["planted.test.mjs"]],
  "a remover's renamed tmpdir in its mkdtemp": [
    { "helpers.mjs": "import { tmpdir as td } from \"node:os\";\nconst dir = mkdtempSync(join(td(), \"onrails-\"));\n" }, ["helpers.mjs"]],
  "each remover's one mkdtemp": [{ "helpers.mjs": `${IMPORT}${MAKE}`, "safe-path-preload.mjs": `${IMPORT}${MAKE}` }, []],
};

test("AC-180-2: WHEN a planted file in cli/test/ or a subfolder calls mkdirSync(join(tmpdir(), ...)), or a remover gains a second mkdtemp THEN the CLI guard fails", () => {
  const root = tmp("onrails-guard-");
  for (const [i, [name, [files, want]]] of Object.entries(PLANTED).entries()) {
    const dir = join(root, String(i));
    for (const [path, text] of Object.entries(files)) put(dir, path, text);
    assert.deepEqual(findLeaks(dir), want, name);
  }
});

// Logs the path of every rmSync call. Loaded with --require, before a test file's own imports bind node:fs.
const COUNT_REMOVALS = `const fs = require("fs");
const rm = fs.rmSync;
fs.rmSync = (path, options) => { fs.appendFileSync(process.env.ONRAILS_RM_LOG, path + "\\n"); return rm(path, options); };
require("module").syncBuiltinESMExports();
`;
const PREFLIGHT = readdirSync(HERE).filter((name) => /^preflight.*\.test\.mjs$/.test(name)).map((name) => join(HERE, name));

/** Runs test files the way `npm test` does, with TMPDIR set to dir and every rmSync logged to log. */
function runCounted(dir, log, files) {
  const counter = join(dirname(log), "count-removals.cjs");
  put(dirname(log), "count-removals.cjs", COUNT_REMOVALS);
  // The nested runner must not think it's a child of this one, or it reports in the parent's format.
  const env = safeEnv({ NODE_TEST_CONTEXT: undefined, TMPDIR: dir, TMP: dir, TEMP: dir, ONRAILS_RM_LOG: log });
  const preload = join(HERE, "safe-path-preload.mjs");
  return spawnSync(process.execPath, ["--require", counter, "--require", preload, "--test", ...files], { encoding: "utf8", env, timeout: 120_000 });
}

// Each registration removes its folder once when the file ends, so a folder removed twice was registered twice.
test("AC-180-3: WHEN the preflight tests run THEN no folder is registered twice, and none is left", () => {
  const root = tmp("onrails-removals-");
  const dir = join(root, "tmp");
  const log = join(root, "removed.log");
  mkdirSync(dir);
  const r = runCounted(dir, log, PREFLIGHT);
  assert.equal(r.status, 0, r.stdout.slice(-2000));
  const removed = readFileSync(log, "utf8").split("\n").filter((path) => dirname(path) === dir);
  assert.ok(removed.length > 0, "the preflight tests made temp folders");
  assert.deepEqual(removed.filter((path, i) => removed.indexOf(path) !== i), [], "removed twice");
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});

test("#180 item 5: WHEN a test file makes a folder with tmp() while it loads and then throws THEN the folder is removed", () => {
  const root = tmp("onrails-throws-");
  const dir = join(root, "tmp");
  mkdirSync(dir);
  const helpers = pathToFileURL(join(HERE, "helpers.mjs")).href;
  put(root, "throws.test.mjs", `import { tmp } from ${JSON.stringify(helpers)};\ntmp("onrails-loading-");\nthrow new Error("broken while loading");\n`);
  const r = runCounted(dir, join(root, "removed.log"), [join(root, "throws.test.mjs")]);
  assert.notEqual(r.status, 0, "the file threw");
  assert.match(r.stdout, /broken while loading/);
  assert.deepEqual(readdirSync(dir).filter((name) => name !== NPM_CACHE), []);
});
