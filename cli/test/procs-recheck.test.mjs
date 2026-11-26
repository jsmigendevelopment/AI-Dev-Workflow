// Tests that the process registry checks again at the moments that matter (#156, review round 2): each watcher
// pass asks git afresh, update and folder check the folder after the last change, start stops what it can't
// record, and a registry skipped for its mode is named, never hidden. Round 3: each command asks git afresh, and an
// index main wrote at 0664 is named and its entries kept. They run on the fake machine in procs-fake.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, chownSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmp } from "./helpers.mjs";
import { homeRegistry, logFor, update } from "../src/procs-store.mjs";
import { MIN, NOW, fakeSys, inRepo, run, seed, signals, stamp, startDev } from "./procs-fake.mjs";

const posix = { skip: process.platform === "win32" ? "Windows has no POSIX mode or symlink" : false };
const iso = (ms) => new Date(ms).toISOString();
const rec = (pid, more) => ({ id: `p${pid}`, kind: "process", pid, start: `start-${pid}`, group: true, command: "x", why: "w", until: "u",
  state: "running", pausedUntil: null, session: "s-1", agent: { pid: 500, start: "start-500" }, startedAt: iso(NOW), ...more });

test("AC-156-4: WHEN git starts tracking the registry while the watcher runs THEN its next pass reads, signals and writes nothing", async () => {
  let tracked = "";
  const sys = fakeSys({ procs: { 4000: {}, 4001: {} }, git: (dir, args) => inRepo(tracked)(dir, args) });
  const path = join(sys.cwd, ".onrails", "procs.json");
  mkdirSync(dirname(path), { mode: 0o700 });
  writeFileSync(path, JSON.stringify({ version: 1, procs: [rec(4000, { deadline: iso(NOW + 30 * MIN) })] }), { mode: 0o600 });
  stamp(path); // a session wrote it
  // What a branch brings: a record past its time, as a checkout writes it.
  const branch = JSON.stringify({ version: 1, procs: [rec(4001, { deadline: iso(NOW - MIN), session: "s-old" })] });
  const sleep = sys.sleep;
  sys.sleep = async (ms) => {
    await sleep(ms);
    if (tracked) return;
    tracked = ".onrails/procs.json";
    writeFileSync(path, branch);
    chmodSync(path, 0o644);
  };
  const r = await run(sys, ["watch", "--registry", path]);
  assert.equal(r.code, 1, "the watcher stops");
  assert.equal(tracked, ".onrails/procs.json", "the first pass ran and slept");
  assert.deepEqual(signals(sys), []);
  assert.equal(readFileSync(path, "utf8"), branch, "nothing written back");
  assert.equal(lstatSync(path).mode & 0o777, 0o644);
});

test("update checks the folder again right before it writes: a folder others can write by then gets nothing", posix, () => {
  const sys = fakeSys({ git: inRepo("") });
  const path = join(sys.cwd, ".onrails", "procs.json");
  update(sys, path, () => []);
  const before = readFileSync(path, "utf8");
  const opened = (procs) => { chmodSync(dirname(path), 0o770); return [...procs, rec(4000)]; };
  assert.throws(() => update(sys, path, opened), /can be written by other users/);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("the registry's folder is checked again once it is made: a symlink that took its name first gets nothing", posix, () => {
  const elsewhere = tmp("procs-elsewhere-");
  let planted = false;
  const git = (dir, args) => {
    if (args[0] === "ls-files" && !planted) { planted = true; symlinkSync(elsewhere, join(sys.cwd, ".onrails")); }
    return inRepo("")(dir, args);
  };
  const sys = fakeSys({ git });
  assert.throws(() => logFor(sys, join(sys.cwd, ".onrails", "procs.json"), "x"), /is a symlink/);
  assert.ok(planted);
  assert.ok(!existsSync(join(elsewhere, ".gitignore")), "nothing written through the link");
});

test("start stops what it spawned, through its own handle, when the registry can't take the record", posix, async () => {
  const sys = fakeSys({ git: inRepo("") });
  const spawn = sys.spawn;
  sys.spawn = (argv, opts) => { const pid = spawn(argv, opts); chmodSync(join(sys.cwd, ".onrails"), 0o770); return pid; };
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.match(r.out, /pnpm was stopped: the registry can't be used/);
  assert.ok(sys.calls.includes("killSpawned 7000"), sys.calls.join("\n"));
  assert.ok(!sys.live.has(7000));
});

test("a registry written before #156 at 0664 is named with its chmod 600 by list, stop all and session-start, never as nothing running", posix, async () => {
  for (const argv of [["list"], ["stop", "all", "--yes"], ["session-start"]]) {
    const sys = fakeSys({ procs: { 4000: {} } });
    seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" });
    chmodSync(homeRegistry(sys), 0o664);
    const r = await run(sys, argv);
    assert.ok(r.out.includes(`run chmod 600 ${homeRegistry(sys)}`), `${argv.join(" ")}: ${r.out}`);
    assert.doesNotMatch(r.out, /Nothing registered is running\./, argv.join(" "));
    assert.deepEqual(signals(sys), [], argv.join(" "));
  }
  const repo = fakeSys({ git: inRepo("") });
  mkdirSync(join(repo.cwd, ".onrails"));
  writeFileSync(join(repo.cwd, ".onrails", "procs.json"), JSON.stringify({ version: 1, procs: [] }));
  chmodSync(join(repo.cwd, ".onrails"), 0o775);
  assert.ok((await run(repo, ["list"])).out.includes(`run chmod 700 ${join(repo.cwd, ".onrails")}`), "its old folder too");
});

test("AC-156-4: WHEN git starts tracking the registry between two commands on one machine THEN the second asks git again and signals nothing", posix, async () => {
  let tracked = "";
  const sys = fakeSys({ procs: { 4000: {} }, git: (dir, args) => inRepo(tracked)(dir, args) });
  const path = join(sys.cwd, ".onrails", "procs.json");
  mkdirSync(dirname(path), { mode: 0o700 });
  writeFileSync(path, JSON.stringify({ version: 1, procs: [rec(4000, { session: "s-old", agent: { pid: 600, start: "start-600" } })] }), { mode: 0o600 });
  stamp(path); // a session wrote it
  assert.match((await run(sys, ["list"])).out, /p4000 · STALE/, "the first command reads it");
  tracked = ".onrails/procs.json";
  await run(sys, ["stop", "stale"]);
  assert.deepEqual(signals(sys), []);
  assert.ok(sys.live.has(4000));
});

// The index as main wrote it before #156, listing two registries in other repos.
function oldIndex(sys, mode) {
  const index = join(sys.home, ".onrails", "procs-index.json"), old = ["/elsewhere/a/.onrails/procs.json", "/elsewhere/b/.onrails/procs.json"];
  mkdirSync(dirname(index), { mode: 0o700 });
  writeFileSync(index, JSON.stringify({ registries: old }));
  chmodSync(index, mode);
  return { index, old };
}
const indexed = (index) => JSON.parse(readFileSync(index, "utf8")).registries;

test("AC-156-4: WHEN the index is 0664, as main wrote it under a 002 umask THEN list names it once with its chmod 600, and the next write keeps its entries", posix, async () => {
  const sys = fakeSys({ git: inRepo("") });
  const { index, old } = oldIndex(sys, 0o664);
  assert.equal((await run(sys, ["list"])).out, `Not read: ${index} can be written by other users: run chmod 600 ${index}, which keeps what's in it. `
    + "Until then its processes aren't listed or stopped.\nNothing else registered is running.");
  assert.equal((await startDev(sys)).code, 0);
  assert.deepEqual(indexed(index), [...old, join(sys.cwd, ".onrails", "procs.json")]);
  assert.equal(lstatSync(index).mode & 0o777, 0o600);
  assert.equal((await run(sys, ["list"])).out.includes("Not read"), false, "named only until it is written again");
});

test("AC-156-4: WHEN the index others can write, or another user's THEN the next write starts it afresh, as before", posix, async () => {
  const plants = { "world-writable": (index) => chmodSync(index, 0o666) };
  if (process.getuid?.() === 0) plants["another user's"] = (index) => chownSync(index, 4242, 4242); // only root can give a file away
  for (const [name, plant] of Object.entries(plants)) {
    const sys = fakeSys({ git: inRepo("") });
    const { index } = oldIndex(sys, 0o664);
    plant(index);
    assert.equal((await startDev(sys)).code, 0, name);
    assert.deepEqual(indexed(index), [join(sys.cwd, ".onrails", "procs.json")], name);
  }
});
