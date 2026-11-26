// #185 round 1: on Windows, npm and corepack put three shims for a tool in one folder: `claude` (a sh script with no
// extension), `claude.cmd` and `claude.ps1`. Only the .cmd one starts, through cmd.exe. A fake platform and a fake
// spawn: nothing runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { realSystem, toolPath } from "../src/system.mjs";
import { updateAll } from "../src/update-all.mjs";
import { logger, put, tmp } from "./helpers.mjs";

const ComSpec = "C:\\Windows\\System32\\cmd.exe";

// A folder of npm's three shims for claude, and a Windows env whose PATH holds it. Windows matches PATHEXT in any
// case; this Linux or macOS test folder doesn't, so the list is in the shims' own case.
function npmFolder() {
  const npm = tmp("onrails-npm-");
  for (const name of ["claude", "claude.cmd", "claude.ps1"]) put(npm, name, "shim\n");
  return { npm, env: { PATH: npm, PATHEXT: ".com;.exe;.bat;.cmd", ComSpec } };
}

// A spawnSync that records what would start and answers like a tool that printed its version.
function recorder() {
  const calls = [];
  const run = (file, args) => (calls.push([file, ...args]), { status: 0, stdout: "9.9.9\n", stderr: "" });
  return { calls, run };
}

test("#185 round 1: WHEN claude, claude.cmd and claude.ps1 share an npm folder on Windows THEN doctor finds claude.cmd and runs it through cmd.exe", () => {
  const { npm, env } = npmFolder(), { calls, run } = recorder();
  const sys = realSystem({ projectDir: tmp(), platform: "win32", env, run });
  assert.equal(toolPath("claude", sys, tmp()).path, join(npm, "claude.cmd"));
  assert.equal(sys.has("claude"), true);
  const probe = sys.probe("claude", ["--version"]);
  assert.deepEqual([probe?.ok, probe?.out], [true, "9.9.9"]);
  assert.equal(sys.exec(["claude", "update"]), true);
  const line = (args) => [ComSpec, "/d", "/s", "/c", `""${join(npm, "claude.cmd")}" ${args}"`];
  assert.deepEqual(calls, [line("--version"), line("update")]);
});

test("#185 round 1: a name that already ends in a PATHEXT extension is found as it is, and the extension-less shim alone is not a tool", () => {
  const { npm, env } = npmFolder();
  put(npm, "powershell.exe", "exe\n");
  const sys = realSystem({ projectDir: tmp(), platform: "win32", env, run: recorder().run });
  assert.equal(toolPath("powershell.exe", sys, tmp()).path, join(npm, "powershell.exe"));
  put(npm, "codex", "a sh script\n");
  assert.equal(sys.has("codex"), false, "no codex.cmd: the sh script can't start on Windows");
});

test("#185 round 1: WHEN update --all runs on Windows with npm's three claude shims THEN it runs claude.cmd through cmd.exe", async () => {
  const { npm, env } = npmFolder(), { calls, run } = recorder();
  const home = tmp("onrails-home-");
  put(home, ".claude/plugins/installed_plugins.json", JSON.stringify({ version: 2, plugins: { "core@onrails": [{ scope: "user", installPath: "/x", version: "0.6.0" }] } }));
  const dir = tmp();
  const sys = { ...realSystem({ projectDir: dir, platform: "win32", env, run }), home };
  await updateAll(dir, { sys, log: logger() });
  const shim = join(npm, "claude.cmd");
  for (const args of ["plugin marketplace update onrails", "plugin update core@onrails"]) {
    assert.ok(calls.some((c) => c.join(" ") === [ComSpec, "/d", "/s", "/c", `""${shim}" ${args}"`].join(" ")), `${args}\n${calls.join("\n")}`);
  }
  assert.ok(!calls.some((c) => c[0] === join(npm, "claude")), "the extension-less shim never starts");
});
