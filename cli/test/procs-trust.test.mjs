// Tests for the folders around the process registry (#156, review round 2): the repo root that holds the name
// .onrails, the index in ~/.onrails, and how far ~/.onrails may be shared. They run on the fake machine in procs-fake.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmp } from "./helpers.mjs";
import { soleMember } from "../src/procs-sys.mjs";
import { NOW, fakeSys, inRepo, run, seed, signals, startDev } from "./procs-fake.mjs";

const posix = { skip: process.platform === "win32" ? "Windows has no POSIX owner, mode, symlink or FIFO" : false };
const STALE = { id: "pbad", kind: "process", pid: 4000, start: "start-4000", group: true, command: "x", why: "w", until: "u",
  session: "s-old", agent: { pid: 600, start: "start-600" }, startedAt: new Date(NOW).toISOString() };
const REGISTRY = JSON.stringify({ version: 1, procs: [STALE] });
const STOPS = [["stop", "stale"], ["stop", "all", "--yes"], ["stop", "pbad", "--yes"]];

// A folder holding a registry with one stale record for the live PID 4000, at the modes a checkout gives.
function folderWithStale(dir, mode = 0o755, fileMode = 0o644) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "procs.json"), REGISTRY);
  chmodSync(join(dir, "procs.json"), fileMode);
  chmodSync(dir, mode);
}

test("AC-156-4: WHEN others can write the repo root THEN its registry is never read for a signal, unless the root is sticky or only the user's own group can write it", posix, async () => {
  const cases = [
    // [root mode, the user is the only member of the root's group, the root's group is the user's own, signalled]
    [0o755, false, true, true],
    [0o775, true, true, true],
    [0o1775, false, true, true],
    [0o775, false, true, false],
    [0o775, null, true, false],
    [0o775, true, false, false],
    [0o777, true, true, false],
    [0o1777, true, true, false],
  ];
  for (const [mode, sole, own, signalled] of cases) {
    for (const argv of STOPS) {
      const sys = fakeSys({ procs: { 4000: {} }, git: inRepo(""), privateGroup: sole });
      if (!own) sys.gid += 1;
      folderWithStale(join(sys.cwd, ".onrails"));
      chmodSync(sys.cwd, mode);
      await run(sys, argv);
      const at = `root ${mode.toString(8)}, sole member ${sole}, own group ${own}, ${argv.join(" ")}`;
      assert.equal(signals(sys).includes("kill -4000 SIGTERM"), signalled, at);
    }
  }
  const sys = fakeSys({ git: inRepo("") });
  chmodSync(sys.cwd, 0o775);
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.ok(r.out.includes(`run chmod g-w ${sys.cwd}`), r.out);
  assert.ok(!sys.calls.some((c) => c.startsWith("spawn")));
});

test("AC-156-4: WHEN the .onrails name changes while a group-writable root is checked THEN nothing under the new name is read for a signal", posix, async () => {
  const spares = {
    "another folder": (spare) => folderWithStale(spare),
    "a symlink": (spare) => { const elsewhere = join(tmp("procs-elsewhere-"), "x"); folderWithStale(elsewhere, 0o700, 0o600); symlinkSync(elsewhere, spare); },
  };
  for (const [name, make] of Object.entries(spares)) {
    for (const argv of STOPS) {
      let swapped = false;
      const git = (dir, args) => {
        if (args[0] === "ls-files" && !swapped) {
          swapped = true;
          renameSync(join(sys.cwd, ".onrails"), join(sys.cwd, ".onrails-was"));
          renameSync(join(sys.cwd, "spare"), join(sys.cwd, ".onrails"));
        }
        return inRepo("")(dir, args);
      };
      const sys = fakeSys({ procs: { 4000: {} }, git });
      mkdirSync(join(sys.cwd, ".onrails"), { mode: 0o700 });
      writeFileSync(join(sys.cwd, ".onrails", "procs.json"), JSON.stringify({ version: 1, procs: [] }), { mode: 0o600 });
      make(join(sys.cwd, "spare"));
      chmodSync(sys.cwd, 0o775);
      await run(sys, argv).catch((error) => error);
      assert.deepEqual(signals(sys), [], `${name}, ${argv.join(" ")}`);
      assert.ok(sys.live.has(4000), `${name}, ${argv.join(" ")}`);
    }
  }
});

// Runs one command on the fake machine in a child process, so a read that blocks shows as a timeout, not a hung test.
// Its result is the line after RESULT: helpers.mjs loads node:test, which writes its own report to stdout too.
const FAKE = fileURLToPath(new URL("./procs-fake.mjs", import.meta.url));
function runApart(home, cmd) {
  const code = `import { fakeSys, run } from ${JSON.stringify(pathToFileURL(FAKE).href)};
    const sys = fakeSys({ stdin: '{"session_id":"s-1"}' });
    sys.home = process.argv[1];
    console.log("RESULT:" + JSON.stringify(await run(sys, [process.argv[2]])));`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code, home, cmd], { encoding: "utf8", timeout: 10_000, killSignal: "SIGKILL" });
}

test("AC-156-4: WHEN procs-index.json is a FIFO or a link to /dev/zero THEN list and the session hooks still finish at once", posix, (t) => {
  if (spawnSync("mkfifo", ["--help"]).error) return t.skip("no mkfifo here");
  const plants = {
    "a FIFO": (index) => spawnSync("mkfifo", ["-m", "600", index]),
    "a link to /dev/zero": (index) => symlinkSync("/dev/zero", index),
  };
  for (const [name, plant] of Object.entries(plants)) {
    const home = tmp("procs-index-home-");
    mkdirSync(join(home, ".onrails"));
    chmodSync(join(home, ".onrails"), 0o775); // row 59: ~/.onrails may be group-writable
    plant(join(home, ".onrails", "procs-index.json"));
    for (const cmd of ["list", "session-start", "session-end"]) {
      const started = Date.now();
      const r = runApart(home, cmd);
      assert.equal(r.error?.code, undefined, `${name}, ${cmd}: it didn't finish`);
      assert.equal(r.status, 0, `${name}, ${cmd}: ${r.stderr}`);
      const result = JSON.parse(r.stdout.split("\n").find((l) => l.startsWith("RESULT:")).slice("RESULT:".length));
      assert.equal(result.code, 0, `${name}, ${cmd}`);
      if (cmd === "list") assert.equal(result.out, "Nothing registered is running.", name);
      assert.ok(Date.now() - started < 8000, `${name}, ${cmd}`);
    }
  }
});

test("AC-156-4: WHEN ~/.onrails is world-writable THEN nothing in it is read or written; group-writable is still used", posix, async () => {
  for (const mode of [0o777, 0o1777, 0o757]) {
    const sys = fakeSys({ procs: { 4000: {} } });
    seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" });
    chmodSync(join(sys.home, ".onrails"), mode);
    await run(sys, ["stop", "stale"]);
    assert.deepEqual(signals(sys), [], mode.toString(8));
    const r = await startDev(sys);
    assert.equal(r.code, 1, mode.toString(8));
    assert.ok(r.out.includes(`run chmod o-w ${join(sys.home, ".onrails")}`), r.out);
  }
  const sys = fakeSys({ procs: { 4000: {} } });
  seed(sys, { id: "pold1", pid: 4000, start: "start-4000", command: "pnpm dev" });
  chmodSync(join(sys.home, ".onrails"), 0o775);
  await run(sys, ["stop", "stale"]);
  assert.ok(signals(sys).includes("kill -4000 SIGTERM"), "a group-writable ~/.onrails is still read");
  // The index in it names the repos to look at: not read from a world-writable ~/.onrails either.
  const repo = tmp("procs-repo-");
  const git = (dir, args) => (!dir.startsWith(repo) ? null : args.includes("--git-common-dir") ? join(repo, ".git") : args[0] === "ls-files" ? "" : null);
  for (const mode of [0o777, 0o775]) {
    const other = fakeSys({ procs: { 4000: {} }, git });
    folderWithStale(join(repo, ".onrails"), 0o700, 0o600);
    mkdirSync(join(other.home, ".onrails"));
    writeFileSync(join(other.home, ".onrails", "procs-index.json"), JSON.stringify({ registries: [join(repo, ".onrails", "procs.json")] }), { mode: 0o600 });
    chmodSync(join(other.home, ".onrails"), mode);
    await run(other, ["stop", "stale"]);
    assert.equal(signals(other).includes("kill -4000 SIGTERM"), mode === 0o775, `the index in a ${mode.toString(8)} ~/.onrails`);
  }
});

test("AC-156-4: a group counts as the user's own only when the user is its one member, in /etc/group, getent and /etc/passwd", () => {
  const passwd = "root:x:0:0::/root:/bin/sh\nalice:x:1000:1000::/home/alice:/bin/bash\n";
  const ask = (group, more = {}) => soleMember(1000, "alice", { group, passwd, getent: null, ...more });
  assert.equal(ask("root:x:0:\nalice:x:1000:\n"), true);
  assert.equal(ask("alice:x:1000:alice\n"), true);
  assert.equal(ask("alice:x:1000:bob\n"), false, "another member");
  assert.equal(ask("alice:x:1000:\n", { passwd: `${passwd}bob:x:1001:1000::/home/bob:/bin/sh\n` }), false, "another user's primary group");
  assert.equal(ask("alice:x:1000:\n", { getent: "alice:x:1000:carol\n" }), false, "a member only getent knows");
  assert.equal(ask("staff:x:1000:\n"), false, "a group not named after the user");
  assert.equal(ask("root:x:0:\n"), null, "no entry: can't tell");
  assert.equal(ask(null, { getent: "alice:*:1000:\n" }), true, "getent alone");
  assert.equal(ask(null), null, "nothing to read: can't tell");
});
