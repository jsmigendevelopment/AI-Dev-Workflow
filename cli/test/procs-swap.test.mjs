// Tests that the registry is read only through the file that passed its checks (#156): the checks and the
// read use one open file, in the survey and in update. They run on the fake machine in procs-fake.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmodSync, chownSync, lstatSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { safeEnv, tmp } from "./helpers.mjs";
import { homeRegistry, update } from "../src/procs-store.mjs";
import { NOW, fakeSys, run, signals } from "./procs-fake.mjs";

const posix = { skip: process.platform === "win32" ? "symlinks and FIFOs need Linux or macOS" : false };
const registry = (procs) => JSON.stringify({ version: 1, procs }) + "\n";
const OTHER = registry([{ id: "pbad", kind: "process", pid: 4000, start: "start-4000", group: true, command: "x", why: "w", until: "u",
  session: "s-old", agent: { pid: 600, start: "start-600" }, startedAt: new Date(NOW).toISOString() }]);

// A machine with a good home registry, and a spare that `make` puts beside it under another name. With `from` 0
// the two names trade places each time git is asked about the home folder: after the registry's name has passed
// its checks, before it is read. Otherwise they trade at every question to the machine (git or ps) from the
// `from`-th on, so the trades land at other moments too.
function trading(make, from = 0) {
  let asked = 0;
  const tick = () => { if (asked++ >= from) trade(); };
  const sys = fakeSys({ procs: { 4000: {} }, stdin: '{"session_id":"s-1"}', git: (dir) => { if (dir === sys.home || from) tick(); return null; } });
  const info = sys.info;
  sys.info = (pids) => { if (from) tick(); return info(pids); };
  const path = homeRegistry(sys), spare = `${path}.spare`;
  mkdirSync(join(sys.home, ".onrails"), { mode: 0o700 });
  writeFileSync(path, registry([]), { mode: 0o600 });
  make(spare);
  const trade = () => { renameSync(path, `${path}.was`); renameSync(spare, path); renameSync(`${path}.was`, spare); };
  return { sys, path, spare };
}

const linkTo = (text) => (spare) => {
  const target = join(tmp("procs-other-"), "procs.json");
  writeFileSync(target, text, { mode: 0o600 });
  symlinkSync(target, spare);
};
// A plain file others can write, or, when the tests run as root, one another user owns.
const fileOf = (text, mode, owner) => (spare) => {
  writeFileSync(spare, text);
  chmodSync(spare, mode);
  if (owner) chownSync(spare, owner, owner);
};
const spares = { "a symlink": linkTo(OTHER), "a group-writable file": fileOf(OTHER, 0o660) };
if (process.getuid?.() === 0) spares["another user's file"] = fileOf(OTHER, 0o600, 4242); // only root can give a file away

// A file of this user's at 0600, as the registry writes them, that holds the other records.
const written = (...paths) => paths.some((p) => {
  const s = lstatSync(p);
  return s.isFile() && s.uid === process.getuid() && (s.mode & 0o777) === 0o600 && readFileSync(p, "utf8").includes("pbad");
});

test("AC-156-4: WHEN the registry's name changes while it is checked THEN only the file that passed the checks is read, by stop, list and the hooks", posix, async () => {
  for (const [name, make] of Object.entries(spares)) {
    for (let from = 0; from < 8; from++) {
      for (const argv of [["stop", "stale"], ["list"], ["stop", "all", "--yes"], ["session-end"]]) {
        const { sys, path, spare } = trading(make, from);
        const r = await run(sys, argv).catch((error) => ({ out: error.message })); // a refusal may throw; signals still count
        const at = `${name}, from ${from}, ${argv.join(" ")}`;
        assert.deepEqual(signals(sys), [], `${at}: ${r.out}`);
        assert.ok(sys.live.has(4000), at);
        assert.ok(!written(path, spare), `${at}: the other records were written back as this user's`);
      }
    }
  }
});

test("AC-156-4: WHEN the registry's name changes while update holds it THEN nothing is read through it or written back as this user's", posix, () => {
  const { sys, path, spare } = trading(linkTo(OTHER));
  assert.throws(() => update(sys, path, (procs) => procs), /the registry can't be used/);
  assert.ok(!written(path, spare));
});

test("AC-156-4: WHEN the registry's name turns into a FIFO THEN it is refused at once, never waited on", posix, async (t) => {
  if (spawnSync("mkfifo", ["--help"], { env: safeEnv() }).error) return t.skip("no mkfifo here");
  const { sys, path } = trading((spare) => spawnSync("mkfifo", ["-m", "600", spare], { env: safeEnv() }));
  // A writer that fills the FIFO a second later, so a read that waited on it would get another record.
  const writer = spawn(process.execPath, ["-e", `setTimeout(() => require("fs").writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(OTHER)}), 1000)`], { timeout: 30_000, env: safeEnv() });
  try {
    const started = Date.now();
    const r = await run(sys, ["stop", "stale"]).catch((error) => ({ out: error.message }));
    assert.deepEqual(signals(sys), [], r.out);
    assert.ok(Date.now() - started < 1000, "it didn't wait for a writer");
  } finally {
    if (writer.exitCode === null) { writer.kill(); await once(writer, "exit"); } // the writer this test started, and only it
  }
  const held = trading((spare) => spawnSync("mkfifo", ["-m", "600", spare], { env: safeEnv() }));
  assert.throws(() => update(held.sys, held.path, (procs) => procs), /isn't a regular file/, "update writes nothing over it");
});
