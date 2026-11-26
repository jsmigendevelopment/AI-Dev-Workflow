// #178: how `update --all` starts a Windows `.cmd` shim, with a fake platform. Nothing runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { launch } from "../src/system.mjs";
import { repo } from "./update-all-helpers.mjs";

test("#178: on Windows a .cmd shim runs through cmd.exe by its full path, from ComSpec or SystemRoot, never a bare cmd.exe", () => {
  const shim = "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd";
  const argv = [shim, "plugin", "update", "core@onrails"];
  let l = launch(argv, { platform: "win32", env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" } });
  assert.equal(l.file, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(l.args, ["/d", "/v:off", "/s", "/c", `""${shim}" plugin update core@onrails"`]);
  assert.equal(l.verbatim, true);
  assert.equal(l.env.NoDefaultCurrentDirectoryInExePath, "1", "the shim's bare `node` is never looked up in the current folder");
  assert.equal(launch(argv, { platform: "win32", env: { SystemRoot: "D:\\Win" } }).file, "D:\\Win\\System32\\cmd.exe");
  assert.equal(launch(argv, { platform: "win32", env: {} }).file, "C:\\Windows\\System32\\cmd.exe");
  l = launch(["C:\\tools\\codex.exe", "plugin"], { platform: "win32", env: {} });
  assert.deepEqual([l.file, l.args, l.verbatim], ["C:\\tools\\codex.exe", ["plugin"], undefined], "an .exe starts as it is");
  l = launch(["/bin/claude", "plugin"], { platform: "linux", env: { A: "1" } });
  assert.deepEqual(l, { file: "/bin/claude", args: ["plugin"], env: { A: "1" } });
});

test("#178: on Windows a .cmd path with a space reaches cmd.exe as one quoted word, verbatim, as preflight's commandFor does", () => {
  const shim = "C:\\Users\\John Smith\\AppData\\Roaming\\npm\\claude.cmd";
  const env = { ComSpec: "C:\\Windows\\System32\\cmd.exe" };
  const l = launch([shim, "plugin", "marketplace", "update", "onrails"], { platform: "win32", env });
  // cmd.exe /s drops the first and last quote on the line, which leaves "<path>" quoted.
  assert.deepEqual([l.file, l.args, l.verbatim], [env.ComSpec, ["/d", "/v:off", "/s", "/c", `""${shim}" plugin marketplace update onrails"`], true]);
  assert.throws(() => launch([shim, "a&b"], { platform: "win32", env }), /plain words/, "cmd.exe never reads a & or a quote from an argument");
  assert.doesNotMatch(repo("scripts/preflight-sys.mjs"), /windowsArgv/, "preflight's comment no longer names the old route");
});

test("#178: on Windows a .cmd path with a % never reaches cmd.exe, which expands it even inside quotes", () => {
  const env = { ComSpec: "C:\\Windows\\System32\\cmd.exe" };
  assert.throws(() => launch(["C:\\Users\\me\\100%PATH%\\npm\\claude.cmd", "plugin"], { platform: "win32", env }), /cmd\.exe would expand the % in/);
  const exe = launch(["C:\\tools\\100%\\codex.exe", "plugin"], { platform: "win32", env });
  assert.equal(exe.file, "C:\\tools\\100%\\codex.exe", "an .exe starts with no cmd.exe, so a % is safe there");
});
