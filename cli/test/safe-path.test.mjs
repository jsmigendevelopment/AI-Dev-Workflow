// #191: tests never run the person's real claude or codex. helpers.mjs gives every child (and each test file's own
// process) a PATH of the test's fakes, a copy of node and the system folders, and checks it before a child starts.
// These tests run a sample of the suite with fakes next to node, check that guard, and scan every test file for a
// child that would get the shell's PATH. The scan reads this file too, so its samples are built from pieces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPath, fake, nodeOnly, put, safeEnv, safePath, tmp, unixOnly } from "./helpers.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
// doctor and research-library run doctor in-process; cli and rename run `doctor` through the binary. On main these
// ran the claude and codex next to node 15 times each.
const SAMPLE = ["doctor", "research-library", "cli", "rename"].map((name) => `${HERE}${name}.test.mjs`);

test("AC-191-1: WHEN the CLI suite runs with a fake claude and codex placed next to node THEN neither fake is ever called", unixOnly, () => {
  const bin = nodeOnly(tmp("onrails-next-to-node-"));
  const log = join(tmp(), "calls.log");
  for (const name of ["claude", "codex"]) fake(bin, name, `#!/bin/sh\necho "${name} $*" >> '${log}'\necho 1.0.0\n`);
  // Started as the copy, so the sample's own process.execPath is in the folder with the fakes, first on its PATH.
  const node = join(bin, basename(process.execPath));
  const env = safeEnv({ NODE_TEST_CONTEXT: undefined }, { bins: [bin] });
  const r = spawnSync(node, ["--test", ...SAMPLE], { encoding: "utf8", env, timeout: 120_000 });
  assert.equal(r.status, 0, r.stdout.slice(-2000));
  assert.match(r.stdout, /^# pass [1-9]/m, "the sample ran");
  assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "", "a test ran the claude or codex next to node");
});

test("#191: a safe PATH holds a copy of node, never a link back to Node's own folder, and finds no other claude", unixOnly, () => {
  const [, nodeDir] = safePath(tmp()).split(delimiter);
  const node = join(nodeDir, basename(process.execPath));
  assert.equal(lstatSync(node).isSymbolicLink(), false);
  const r = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8", env: safeEnv() });
  assert.equal(dirname(r.stdout.trim()), nodeDir, "a child started as `node` runs the copy");
  assert.notEqual(dirname(r.stdout.trim()), dirname(process.execPath));
  const which = spawnSync("sh", ["-c", "command -v claude codex"], { encoding: "utf8", env: safeEnv() });
  assert.equal(which.stdout, "", "no claude or codex on a safe PATH");
});

test("#191: the runtime guard reads every casing of the PATH key, and lets only the test's own fakes through", unixOnly, () => {
  const other = tmp(), mine = tmp();
  put(other, "claude", "#!/bin/sh\necho real claude\n");
  fake(mine, "codex", "#!/bin/sh\necho fake codex\n");
  for (const key of ["PATH", "Path", "path"]) {
    assert.throws(() => safeEnv({ [key]: [mine, other].join(delimiter) }), /isn't one of this test's fakes/, key);
    assert.throws(() => checkPath({ PATH: "", [key]: other }), /isn't one of this test's fakes/, `${key} next to an empty PATH`);
  }
  assert.throws(() => safeEnv({}, { bins: [other] }), /isn't one of this test's fakes/, "a folder of fakes holding a real one");
  assert.equal(safeEnv({}, { bins: [mine] }).PATH.split(delimiter)[0], mine);
  assert.throws(() => checkPath({ PATH: ".." }, join(other, "x")), /isn't one of this test's fakes/, "a relative entry too");
});

// The forms that give a child the shell's PATH. Each pattern is written so it can't match its own source.
const READS_PATH = /process\.env\s*(?:\??\.\s*path\b|\[\s*["'`]path["'`]\s*\])(?!\s*=[^=])/i;
const WHOLE_ENV = /process\.env\b(?!\s*(?:\??\.|\[))/;
const PATH_KEY = /\bPath\s*:|["'`][Pp]ath["'`]\s*:/;
// helpers.mjs strips every PATH key from the shell's env on the same line; a lookup (findCommand, commandFor) starts
// nothing, so its Path key is a test of Windows casing.
const STRIPS = "PATH_KEY.test(";
const LOOKUP = /\b(?:findCommand|commandFor)\(/;
const CHILD_PROCESS = /["'](?:node:)?child_process["']/;

// The text from just after an opening paren to its closing one.
function args(text, start) {
  let depth = 1, i = start;
  for (; i < text.length && depth > 0; i++) depth += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
  return text.slice(start, i - 1);
}

/** Each way the file's text could start a child with the shell's PATH, one line each. */
function inherits(text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    if (READS_PATH.test(line)) found.push(`line ${i + 1}: reads the shell's PATH`);
    if (WHOLE_ENV.test(line) && !line.includes(STRIPS)) found.push(`line ${i + 1}: passes the shell's whole env`);
    if (PATH_KEY.test(line) && !LOOKUP.test(line)) found.push(`line ${i + 1}: sets a Path key`);
  });
  const imports = [...text.matchAll(/import\s*(\{[^}]*\}|\*\s*as\s+\w+)\s*from\s*(["'][^"']+["'])/g)].filter((m) => CHILD_PROCESS.test(m[2]));
  if (imports.some((m) => m[1].startsWith("*")) || /require\(\s*["'](?:node:)?child_process["']\s*\)/.test(text)) {
    found.push("child_process isn't imported by name, so its calls can't be checked");
  }
  const names = imports.flatMap((m) => m[1].slice(1, -1).split(",")).map((n) => n.trim().split(/\s+as\s+/).at(-1)).filter((n) => /^[\w$]+$/.test(n));
  for (const name of names) {
    for (const m of text.matchAll(new RegExp(`(?<![.\\w$])${name}\\(`, "g"))) {
      if (!/(?<![.\w$])env\s*[:,}]/.test(args(text, m.index + m[0].length))) found.push(`${name}() with no env inherits the shell's PATH`);
    }
  }
  return found;
}

test("AC-191-2: WHEN a test file spawns the CLI with the inherited PATH THEN the guard test fails", () => {
  const E = "process" + ".env", S = "spawn" + "Sync", CP = '"node:child' + '_process"';
  const imp = `import { ${S} } from ${CP};\n`;
  const run = `${S}(process.execPath, [CLI, "doctor"], { encoding: "utf8", env });`;
  const bad = [
    `const env = { HOME: h, PATH: ${E}.PATH };\n${run}`,
    `const env = { PATH: ${E}.Path };\n${run}`,
    `const env = { PATH: ${E}?.path };\n${run}`,
    `const env = { PATH: ${E}["PATH"] };\n${run}`,
    `const env = { ...${E}, HOME: h };\n${run}`,
    `const env = Object.fromEntries(Object.entries(${E}));\n${run}`,
    `${S}(process.execPath, [CLI], { env: ${E} });`,
    `const env = { PATH: "", ${"Pa" + "th"}: bin };\n${run}`,
    `${imp}${S}(process.execPath, [CLI, "doctor"], { encoding: "utf8" });`,
    `${imp}${S}("git", ["init", dir]);`,
    `import { ${S} as go } from ${CP};\ngo(process.execPath, [CLI]);`,
    `import * as cp from ${CP};\ncp.${S}(process.execPath, [CLI]);`,
  ];
  for (const form of bad) assert.notDeepEqual(inherits(form), [], form);
  const good = [
    `${imp}${S}(process.execPath, [CLI, "doctor"], { encoding: "utf8", env: safeEnv() });`,
    `${imp}const env = safeEnv({ HOME: h });\n${S}(process.execPath, [CLI], { cwd, env, input: "" });`,
    `${imp}${S}(process.execPath, [CLI], { env: checkPath({ PATH: bin, HOME: h }) });`,
    `const log = ${E}.FAKE_LOG;`,
    `assert.equal(findCommand("codex", { env: { ${"Pa" + "th"}: bin } }), null);`,
  ];
  for (const form of good) assert.deepEqual(inherits(form), [], form);
  const files = readdirSync(HERE).filter((name) => name.endsWith(".mjs"));
  assert.ok(files.includes(basename(fileURLToPath(import.meta.url))), "the scan reads this file too");
  const leaks = files.flatMap((name) => inherits(readFileSync(join(HERE, name), "utf8")).map((why) => `${name}: ${why}`));
  assert.deepEqual(leaks, [], "give each child env: safeEnv(...) from helpers.mjs");
});
