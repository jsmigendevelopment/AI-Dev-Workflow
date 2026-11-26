// #138: the two Windows bugs found in the old windowsArgv. #178 replaced it with launch, and #185 and #215 made
// toolPath find only PATHEXT names on Windows, so both are fixed on main; these tests pin that. A fake platform and
// a fake spawn: nothing runs, and no Windows machine was used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import { pnpmPlan } from "../src/installers.mjs";
import { launch, realSystem } from "../src/system.mjs";
import { put, tmp } from "./helpers.mjs";

const ComSpec = "C:\\Windows\\System32\\cmd.exe";
// Windows' default PATHEXT. Windows matches it in any case; this test folder doesn't, so it is in the files' case.
const PATHEXT = ".com;.exe;.bat;.cmd;.vbs;.vbe;.js;.jse;.wsf;.wsh;.msc";

// A spawnSync that records what would start and answers like a command that worked.
function recorder() {
  const calls = [];
  const run = (file, args, opts) => (calls.push({ argv: [file, ...args], verbatim: opts.windowsVerbatimArguments }), { status: 0, stdout: "", stderr: "" });
  return { calls, run };
}

test("AC-138-1: WHEN the CLI runs npm on Windows with Node in C:\\Program Files\\nodejs THEN it runs npm.cmd, never the extension-less npm script", () => {
  // Node's Windows folder: npm and npx as an sh script, a .cmd and a .ps1 each. No corepack, as from Node 25, so
  // doctor --fix's pnpm plan starts with npm. An earlier PATH folder (Git Bash's, say) holds only an sh `npm`.
  const nodejs = join(tmp("onrails-138-"), "Program Files", "nodejs");
  mkdirSync(nodejs, { recursive: true });
  for (const name of ["node.exe", "npm", "npm.cmd", "npm.ps1", "npx", "npx.cmd", "npx.ps1"]) put(nodejs, name, "shim\n");
  const sh = tmp("onrails-138-sh-");
  put(sh, "npm", "#!/bin/sh\n");
  const { calls, run } = recorder();
  const env = { PATH: [sh, nodejs].join(delimiter), PATHEXT, ComSpec };
  const sys = realSystem({ projectDir: tmp(), platform: "win32", env, run });
  const npm = pnpmPlan(sys).run[0];
  assert.deepEqual(npm, ["npm", "install", "-g", "corepack"]);
  assert.equal(sys.exec(npm), true);
  const shim = join(nodejs, "npm.cmd");
  assert.deepEqual(calls, [{ argv: [ComSpec, "/d", "/s", "/c", `""${shim}" install -g corepack"`], verbatim: true }]);
  assert.ok(!calls.some((c) => c.argv.some((a) => a === join(sh, "npm") || a === join(nodejs, "npm"))), "no extension-less npm starts");
});

test("AC-138-2: WHEN a command path has spaces THEN the argv built for cmd.exe quotes it the way Node's own shell mode does", () => {
  // Node's shell mode on Windows (child_process normalizeSpawnArguments) starts a command line as
  // ComSpec /d /s /c "<line>", verbatim. For the line `"C:\Program Files\nodejs\npm.cmd" install -g corepack`
  // that is the last argument below: /s drops the outer pair, so the quoted path stays one word.
  const l = launch(["C:\\Program Files\\nodejs\\npm.cmd", "install", "-g", "corepack"], { platform: "win32", env: { ComSpec } });
  assert.equal(l.file, ComSpec);
  assert.deepEqual(l.args, ["/d", "/s", "/c", "\"\"C:\\Program Files\\nodejs\\npm.cmd\" install -g corepack\""]);
  assert.equal(l.verbatim, true, "Node would escape the quotes again without windowsVerbatimArguments");
});
