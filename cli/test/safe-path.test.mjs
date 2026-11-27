// #191: tests never run the person's real claude or codex. safe-path-preload.mjs (loaded by `npm test` and by
// helpers.mjs) gives each test process a PATH of a copy of node and the system folders, and helpers.mjs gives every
// child that PATH with the test's fakes, checked before the child starts.
// These tests run a sample of the suite with fakes next to node, check that guard, and scan every test file for a
// child that would get the shell's PATH. The scan reads this file too, so its samples are built from pieces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "./child.mjs";
import { chmodSync, existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPath, fake, nodeOnly, put, safeEnv, safePath, tmp, unixOnly } from "./helpers.mjs";
import { inherits } from "./safe-path-scan.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CLI = fileURLToPath(new URL("..", import.meta.url));
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

test("#197: the runtime guard never skips an empty PATH item, which a child reads as its own working folder", () => {
  const a = tmp(), b = tmp(), other = tmp();
  put(other, "claude", "#!/bin/sh\necho real claude\n");
  for (const PATH of ["", `${a}${delimiter}`, `${delimiter}${a}`, [a, "", b].join(delimiter)]) {
    assert.throws(() => checkPath({ PATH }), /an empty item/, `${JSON.stringify(PATH)} with no working folder named`);
    assert.throws(() => checkPath({ PATH }, other), /isn't one of this test's fakes/, `${JSON.stringify(PATH)} run in a folder with a claude`);
    assert.deepEqual(checkPath({ PATH }, b), { PATH }, `${JSON.stringify(PATH)} run in a folder with none`);
  }
  assert.throws(() => checkPath({ PATH: a, path: `${b}${delimiter}` }), /an empty item/, "on any casing of the key");
  assert.deepEqual(checkPath({ PATH: [a, b].join(delimiter) }), { PATH: [a, b].join(delimiter) });
});

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
  // Good forms import from child.mjs (#229); the same call from child_process is flagged by AC-229-2.
  const mine = `import { ${S} } from "./child.mjs";\n`;
  const good = [
    `${mine}${S}(process.execPath, [CLI, "doctor"], { encoding: "utf8", env: safeEnv() });`,
    `${mine}const env = safeEnv({ HOME: h });\n${S}(process.execPath, [CLI], { cwd, env, input: "" });`,
    `${mine}${S}(process.execPath, [CLI], { env: checkPath({ PATH: bin, HOME: h }) });`,
    `const log = ${E}.FAKE_LOG;`,
    `assert.equal(findCommand("codex", { env: { ${"Pa" + "th"}: bin } }), null);`,
  ];
  for (const form of good) assert.deepEqual(inherits(form), [], form);
  // child.mjs is the one file that calls node:child_process itself.
  const files = readdirSync(HERE).filter((name) => name.endsWith(".mjs") && name !== "child.mjs");
  assert.ok(files.includes(basename(fileURLToPath(import.meta.url))), "the scan reads this file too");
  const leaks = files.flatMap((name) => inherits(readFileSync(join(HERE, name), "utf8")).map((why) => `${name}: ${why}`));
  assert.deepEqual(leaks, [], "give each child env: safeEnv(...) from helpers.mjs");
});

test("#197: the scan flags a claude or codex started by its path in node's own folder, which no PATH guard sees", () => {
  const X = "process" + ".execPath", Q = (name) => `"${name}"`;
  const run = (file) => `spawnSync(${file}, ["--version"], { encoding: "utf8", env: safeEnv() });`;
  const bad = [
    run(`join(dirname(${X}), ${Q("cla" + "ude")})`),
    run(`resolve(${X}, "..", ${Q("co" + "dex.cmd")})`),
    run(`\`\${dirname(${X})}/${"cla" + "ude"}\``),
    `const tool = join(${Q("co" + "dex")}, dirname(${X}));`,
  ];
  for (const form of bad) assert.notDeepEqual(inherits(form), [], form);
  const good = [run(X), run(`join(dirname(${X}), "npm")`), `const env = safeEnv({ CLAUDE_PROJECT_DIR: dirname(${X}) });`];
  for (const form of good) assert.deepEqual(inherits(form), [], form);
});

test("AC-229-1: WHEN a test checks folder A and spawns in folder B holding a claude reachable through an empty or relative PATH item THEN the helper throws and nothing runs", unixOnly, () => {
  const a = tmp(), b = tmp(), log = join(tmp(), "calls.log");
  put(b, "claude", `#!/bin/sh\necho ran >> '${log}'\n`);
  chmodSync(join(b, "claude"), 0o755);
  for (const entry of ["", ".", "./"]) {
    const env = safeEnv({ PATH: [entry, safePath()].join(delimiter) }, { cwd: a });
    assert.throws(() => spawnSync("claude", ["--version"], { cwd: b, env }), /isn't one of this test's fakes/, JSON.stringify(entry));
    assert.throws(() => spawn("claude", [], { cwd: b, env }), /isn't one of this test's fakes/, `spawn ${JSON.stringify(entry)}`);
    const url = pathToFileURL(b);
    assert.throws(() => spawnSync("claude", ["--version"], { cwd: url, env }), /isn't one of this test's fakes/, `a URL cwd ${JSON.stringify(entry)}`);
    // Args left as undefined or null: node:child_process still reads the third argument as the options (#229 review).
    for (const none of [undefined, null]) {
      assert.throws(() => spawnSync("claude", none, { cwd: b, env }), /isn't one of this test's fakes/, `args ${none} ${JSON.stringify(entry)}`);
      assert.throws(() => spawn("claude", none, { cwd: b, env }), /isn't one of this test's fakes/, `spawn, args ${none} ${JSON.stringify(entry)}`);
    }
  }
  assert.equal(existsSync(log), false, "the claude in folder B ran");
});

test("AC-229-2: WHEN a CLI test file starts a child without the helper THEN the safe-PATH scan flags it", () => {
  const CP = '"node:child' + '_process"', S = "spawn" + "Sync", run = `(process.execPath, [CLI], { env: safeEnv() });`;
  for (const name of [S, "spawn", "execFile" + "Sync", "execFile"]) {
    assert.notDeepEqual(inherits(`import { ${name} } from ${CP};\n${name}${run}`), [], name);
    assert.notDeepEqual(inherits(`import { ${name} as go } from ${CP};\ngo${run}`), [], `${name} renamed`);
    assert.deepEqual(inherits(`import { ${name} } from "./child.mjs";\n${name}${run}`), [], `${name} from child.mjs`);
  }
  assert.deepEqual(inherits(`import { ${S} } from "./child.mjs";\n${S}("git", ["init"]);`), [`${S}() with no env inherits the shell's PATH`]);
  // A default, mixed or run-time import of child_process (#229 review).
  const bad = [
    `import cp from ${CP};\ncp.${S}${run}`,
    `import cp from ${CP};\ncp?.${S}${run}`,
    `import cp from ${CP};\ncp["${S}"]${run}`,
    `import cp, { ${S} } from ${CP};\n${S}${run}`,
    `import cp, { ${S} as go } from ${CP};\ngo${run}`,
    `import cp from ${CP};\nconst go = cp.${S};\ngo${run}`,
    `import cp from ${CP};\nconst { ${S} } = cp;\n${S}${run}`,
    `import cp from ${CP};\nstart(cp);`,
    `const { ${S} } = await import(${CP});\n${S}${run}`,
    `const cp = await import(${CP});\ncp.${S}${run}`,
    `const cp = createRequire(import.meta.url)(${CP});\ncp.${S}${run}`,
    `createRequire(import.meta.url)(${CP}).${S}${run}`,
  ];
  for (const form of bad) assert.notDeepEqual(inherits(form), [], form);
  // A stub: assigned to, and the real one saved under its own name to put back (windows-npx-ci-local.test.mjs).
  const stub = `import cp from ${CP};\nconst real = { ${S}: cp.${S} };\ncp.${S} = () => ({ status: 0 });\ncp.${S} = real.${S};`;
  assert.deepEqual(inherits(stub), [], "a stub of the default import");
});

// #197: `npm test` loads the safe PATH before any test file. These run test files the way it does: node with the
// test script's flags before --test, from cli/, as a fresh run that makes its own copy of node.
const FLAGS = JSON.parse(readFileSync(join(CLI, "package.json"), "utf8")).scripts.test.split(/\s+--test\b/)[0].split(/\s+/).slice(1);
const asUrl = (file) => JSON.stringify(pathToFileURL(file).href);

function npmTest(files, { node = process.execPath, bins = [], extra = {} } = {}) {
  const env = safeEnv({ NODE_TEST_CONTEXT: undefined, ONRAILS_TEST_NODE: undefined, ...extra }, { bins });
  return spawnSync(node, [...FLAGS, "--test", ...files], { cwd: CLI, encoding: "utf8", env, timeout: 120_000 });
}

test("AC-197-1: WHEN a test file that never imports helpers.mjs runs doctor in-process with a fake claude next to node THEN the fake is never called", unixOnly, () => {
  const bin = nodeOnly(tmp("onrails-next-to-node-"));
  const log = join(tmp(), "calls.log");
  for (const name of ["claude", "codex"]) fake(bin, name, `#!/bin/sh\necho "${name} $*" >> '${log}'\necho 1.0.0\n`);
  const dir = tmp();
  put(dir, "doctor.test.mjs", [
    `import { test } from "node:test";`,
    `import { doctor } from ${asUrl(join(CLI, "src", "doctor.mjs"))};`,
    `test("doctor in-process", () => { doctor(${JSON.stringify(dir)}, { log: () => {} }); });`,
  ].join("\n"));
  const r = npmTest([join(dir, "doctor.test.mjs")], { node: join(bin, basename(process.execPath)), bins: [bin] });
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr);
  assert.match(r.stdout, /^# pass 1$/m, "doctor ran");
  assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "", "doctor ran the claude or codex next to node");
});

test("AC-197-2: WHEN the runtime guard throws at import THEN no node copy is left in TMPDIR", unixOnly, () => {
  // A system folder holding a claude that isn't a fake makes the guard throw as each process loads.
  const system = tmp(), dir = tmp();
  put(system, "claude", "#!/bin/sh\necho real claude\n");
  put(dir, "loads.test.mjs", `import ${asUrl(join(HERE, "helpers.mjs"))};\n`);
  for (const [how, flags] of [["npm test", FLAGS], ["a file run alone", []]]) {
    const temp = tmp();
    const env = safeEnv({ NODE_TEST_CONTEXT: undefined, ONRAILS_TEST_NODE: undefined, ONRAILS_TEST_SYSTEM_DIRS: system, TMPDIR: temp });
    const r = spawnSync(process.execPath, [...flags, "--test", join(dir, "loads.test.mjs")], { cwd: CLI, encoding: "utf8", env, timeout: 120_000 });
    assert.match(r.stdout + r.stderr, /isn't one of this test's fakes/, `${how}: the guard threw`);
    assert.deepEqual(readdirSync(temp), [], `${how}: a node copy or temp folder was left behind`);
  }
});

test("#229: WHEN a test file run alone throws while it loads THEN no node copy is left in TMPDIR", unixOnly, () => {
  // Run alone, not under `npm test`, the file's own process makes the copy; Node 22 fires no `exit` event after this throw.
  const dir = tmp();
  put(dir, "throws.test.mjs", `import ${asUrl(join(HERE, "helpers.mjs"))};\nthrow new Error("broken while loading");\n`);
  for (const [how, flags] of [["node --test", ["--test"]], ["node", []]]) {
    const temp = tmp();
    const env = safeEnv({ NODE_TEST_CONTEXT: undefined, ONRAILS_TEST_NODE: undefined, TMPDIR: temp });
    const r = spawnSync(process.execPath, [...flags, join(dir, "throws.test.mjs")], { cwd: CLI, encoding: "utf8", env, timeout: 120_000 });
    assert.match(r.stdout + r.stderr, /broken while loading/, `${how}: the file threw`);
    assert.deepEqual(readdirSync(temp), [], `${how}: the node copy was left behind`);
  }
});

test("#197: WHEN ONRAILS_TEST_SYSTEM_DIRS holds an empty or relative entry THEN the preload throws before any test runs", unixOnly, () => {
  // The test file runs a claude by name in a folder that holds one. An empty or relative PATH item finds it there.
  const dir = tmp(), log = join(tmp(), "calls.log");
  fake(dir, "claude", `#!/bin/sh\necho "claude $*" >> '${log}'\n`);
  const S = "spawn" + "Sync", CP = '"node:child' + '_process"';
  put(dir, "runs.test.mjs", [
    `import { test } from "node:test";`,
    `import { ${S} } from ${CP};`,
    `test("runs claude by name", () => { ${S}("claude", ["--version"], { cwd: ${JSON.stringify(dir)} }); });`,
  ].join("\n"));
  for (const system of ["", ["/usr/bin", "", "/bin"].join(delimiter), ".", "bin"]) {
    const temp = tmp();
    const r = npmTest([join(dir, "runs.test.mjs")], { extra: { ONRAILS_TEST_SYSTEM_DIRS: system, TMPDIR: temp } });
    const how = `ONRAILS_TEST_SYSTEM_DIRS=${JSON.stringify(system)}`;
    assert.notEqual(r.status, 0, `${how}: the run passed`);
    assert.match(r.stderr, /ONRAILS_TEST_SYSTEM_DIRS takes only absolute folders/, how);
    assert.doesNotMatch(r.stdout, /^# (?:pass|fail) [1-9]/m, `${how}: a test ran`);
    assert.equal(existsSync(log) ? readFileSync(log, "utf8") : "", "", `${how}: the claude in the test's working folder ran`);
    assert.deepEqual(readdirSync(temp), [], `${how}: a node copy was left behind`);
  }
});

test("AC-197-3: WHEN npm test runs THEN at most one node copy is made", unixOnly, () => {
  const dir = tmp(), temp = tmp(), log = join(tmp(), "copies.log");
  // Each file logs where its copy of node is, and whether nodeOnly() hard-linked that copy rather than copying again.
  const files = ["a", "b", "c"].map((name) => {
    put(dir, `${name}.test.mjs`, [
      `import { test } from "node:test";`,
      `import { appendFileSync, statSync } from "node:fs";`,
      `import { delimiter, join } from "node:path";`,
      `import { nodeOnly, safePath } from ${asUrl(join(HERE, "helpers.mjs"))};`,
      `test("${name}", () => {`,
      `  const copy = join(safePath().split(delimiter)[0], "node");`,
      `  const linked = statSync(join(nodeOnly(), "node")).ino === statSync(copy).ino;`,
      `  appendFileSync(${JSON.stringify(log)}, copy + " " + linked + "\\n");`,
      `});`,
    ].join("\n"));
    return join(dir, `${name}.test.mjs`);
  });
  const r = npmTest(files, { extra: { TMPDIR: temp } });
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr);
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 3, "each file logged its copy");
  assert.ok(lines.every((line) => line.endsWith(" true")), "nodeOnly() hard-links the copy, never copies it again");
  assert.equal(new Set(lines).size, 1, `one copy of node for the whole run:\n${lines.join("\n")}`);
  assert.deepEqual(readdirSync(temp), [], "the run removed its copy when it ended");
});
