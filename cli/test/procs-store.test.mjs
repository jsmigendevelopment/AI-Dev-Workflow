// Tests for where the process registry keeps its records (#126, #156): a registry a branch, another user
// or a broken git could have written is never read for a signal, and no symlink is followed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { put, tmp } from "./helpers.mjs";
import { NOW, fakeSys, inRepo, run, signals, startDev } from "./procs-fake.mjs";

test("a registry git tracks came with a branch: it is never read, signalled from or written", async () => {
  const tracked = (dir, args) => (args.includes("--git-common-dir") ? ".git" : args[0] === "ls-files" ? "procs.json" : null);
  const sys = fakeSys({ procs: { 4000: {} }, git: tracked });
  put(sys.cwd, ".onrails/procs.json", JSON.stringify({ version: 1, procs: [{ id: "pbad", pid: 4000, start: "start-4000", group: true, command: "x",
    session: "s-old", agent: { pid: 600, start: "start-600" }, startedAt: new Date(NOW).toISOString() }] }));
  assert.equal((await run(sys, ["list"])).out, "Nothing registered is running.");
  await run(sys, ["stop", "stale"]);
  assert.equal((await run(sys, ["reap", "--registry", join(sys.cwd, ".onrails", "procs.json"), "pbad"])).code, 1);
  assert.deepEqual(signals(sys), []);
  const start = await startDev(sys);
  assert.equal(start.code, 1);
  assert.match(start.out, /Nothing started: the registry can't be used \(git tracks files/);
  assert.ok(!sys.calls.some((c) => c.startsWith("spawn")));
});

test("symlinks: a linked registry folder, file or logs folder is refused, and a linked .gitignore is replaced, never followed", async (t) => {
  if (process.platform === "win32") return t.skip("symlinks need admin rights on Windows");
  const repo = inRepo("");
  for (const plant of ["folder", "file", "logs"]) {
    const sys = fakeSys({ git: repo });
    const elsewhere = tmp("procs-elsewhere-");
    if (plant === "folder") symlinkSync(elsewhere, join(sys.cwd, ".onrails"));
    else {
      mkdirSync(join(sys.cwd, ".onrails"));
      if (plant === "file") writeFileSync(join(elsewhere, "procs.json"), '{"procs":[]}');
      symlinkSync(plant === "file" ? join(elsewhere, "procs.json") : elsewhere, join(sys.cwd, ".onrails", plant === "file" ? "procs.json" : "logs"));
    }
    const r = await startDev(sys);
    assert.equal(r.code, 1, plant);
    assert.match(r.out, /is a symlink/, plant);
  }
  const sys = fakeSys({ git: repo });
  const target = join(tmp("procs-target-"), "keep.txt");
  writeFileSync(target, "keep\n");
  mkdirSync(join(sys.cwd, ".onrails"));
  symlinkSync(target, join(sys.cwd, ".onrails", ".gitignore"));
  assert.equal((await startDev(sys)).code, 0);
  assert.equal(readFileSync(target, "utf8"), "keep\n", "the link's target is untouched");
  assert.equal(readFileSync(join(sys.cwd, ".onrails", ".gitignore"), "utf8"), "*\n");
});

// A registry at path holding one stale record for the live PID 4000, then every command that could signal it.
async function tryAll(sys, path, mode = 0o600) {
  put(dirname(path), "procs.json", JSON.stringify({ version: 1, procs: [{ id: "pbad", kind: "process", pid: 4000, start: "start-4000", group: true,
    command: "x", why: "w", until: "u", session: "s-old", agent: { pid: 600, start: "start-600" }, startedAt: new Date(NOW).toISOString() }] }));
  chmodSync(path, mode);
  const listed = (await run(sys, ["list"])).out;
  for (const argv of [["stop", "stale"], ["stop", "all", "--yes"], ["stop", "pbad", "--yes"], ["session-end"]]) await run(sys, argv);
  const reaped = await run(sys, ["reap", "--registry", path, "pbad"]);
  const watched = await run(sys, ["watch", "--registry", path]);
  return { listed, codes: [reaped.code, watched.code] };
}

test("AC-156-4: WHEN git ls-files fails, or the registry isn't owned by the user, or is group- or world-writable THEN the registry is never read for a signal", async (t) => {
  if (process.platform === "win32") return t.skip("Windows has no POSIX owner or mode");
  const cases = {
    "git ls-files fails": () => { const sys = fakeSys({ procs: { 4000: {} }, git: inRepo(null) }); return [sys, join(sys.cwd, ".onrails", "procs.json")]; },
    "another user owns it": () => { const sys = fakeSys({ procs: { 4000: {} } }); sys.uid += 1; return [sys, join(sys.home, ".onrails", "procs.json")]; },
    "group-writable": () => { const sys = fakeSys({ procs: { 4000: {} } }); return [sys, join(sys.home, ".onrails", "procs.json"), 0o620]; },
    "world-writable": () => { const sys = fakeSys({ procs: { 4000: {} } }); return [sys, join(sys.home, ".onrails", "procs.json"), 0o602]; },
  };
  for (const [name, make] of Object.entries(cases)) {
    const [sys, path, mode] = make();
    const { listed, codes } = await tryAll(sys, path, mode);
    assert.equal(listed, "Nothing registered is running.", name);
    assert.deepEqual(codes, [1, 1], `${name}: the reaper and the watcher refuse it`);
    assert.deepEqual(signals(sys), [], name);
    assert.ok(sys.live.has(4000), name);
  }
});

test("AC-156-4: an entry in procs-index.json is read only when it is the registry of a git repo the user owns", async () => {
  const repo = tmp("procs-repo-");
  const git = (dir, args) => (!dir.startsWith(repo) ? null : args.includes("--git-common-dir") ? join(repo, ".git") : args[0] === "ls-files" ? "" : null);
  const index = (sys, path) => put(sys.home, ".onrails/procs-index.json", JSON.stringify({ registries: [path] }));
  for (const path of [join(tmp("procs-norepo-"), ".onrails", "procs.json"), join(repo, "sub", ".onrails", "procs.json")]) {
    const sys = fakeSys({ procs: { 4000: {} }, git });
    index(sys, path);
    await tryAll(sys, path);
    assert.deepEqual(signals(sys), [], path);
  }
  const sys = fakeSys({ procs: { 4000: {} }, git });
  index(sys, join(repo, ".onrails", "procs.json"));
  await run(sys, ["stop", "stale"]); // nothing there yet
  await tryAll(sys, join(repo, ".onrails", "procs.json"));
  assert.ok(signals(sys).includes("kill -4000 SIGTERM"), "the repo's own registry is still read");
});
