// Tests for #249: on macOS a folder on the process registry's path whose extended ACL lets another account write it
// is refused, as a group-writable one is. macOS is a fake: fakeSys({ platform: "darwin" }) with a fake ACL reader, and
// realSys({ platform: "darwin" }) with a fake run that answers `/bin/ls -lde`. No process is started, no signal sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { processChecks } from "../src/project-checks.mjs";
import { realSys } from "../src/procs-sys.mjs";
import { macAclText } from "../src/procs-path.mjs";
import { repoAt, run, runAll, startDev, stopped } from "./procs-fake.mjs";
import { tmp } from "./helpers.mjs";

const posix = { skip: process.platform === "win32" ? "Windows has no POSIX owner or mode" : false };
const STOPS = [["stop", "stale"], ["stop", "all", "--yes"], ["stop", "p0bad", "--yes"], ["ps", "--stop", "all", "--yes"], ["session-end"]];
const head = (path, acl = true) => `drwxr-xr-x${acl ? "+" : " "} 5 me  staff  160 Nov 27 10:00 ${path}`;
const lsRun = (text, calls = []) => (cmd, args) => (calls.push([cmd, ...args]), { status: 0, stdout: text(args.slice(2)), stderr: "" });

test("AC-249-1: WHEN a folder on the registry's path has an ACL entry that lets another account write it THEN nothing under it is read for a signal", posix, async () => {
  for (const where of ["above", "root", ".onrails", "logs"]) {
    for (const argv of STOPS) {
      const above = tmp("procs-above-"), root = join(above, "repo");
      const bad = { above, root, ".onrails": join(root, ".onrails"), logs: join(root, ".onrails", "logs") }[where];
      const sys = repoAt(root, { platform: "darwin", macAcl: (p) => (p === bad ? ["group:staff (entry 0)"] : []) });
      await runAll(sys, argv);
      assert.equal(stopped(sys), false, `${where}: ${argv.join(" ")}`);
    }
  }
  const clean = repoAt(join(tmp("procs-above-"), "repo"), { platform: "darwin" });
  await run(clean, ["stop", "stale"]);
  assert.equal(stopped(clean), true, "no ACL entry: read");
});

test("AC-249-1: list, ps, session start and doctor name the folder and what to do", posix, async () => {
  const above = tmp("procs-above-");
  const sys = repoAt(join(above, "repo"), { platform: "darwin", macAcl: (p) => (p === above ? ["group:staff (entry 1)"] : []) });
  const why = `an ACL entry lets another account write ${above} (group:staff (entry 1)): run chmod -a# 1 ${above}, once for each such entry`;
  for (const argv of [["list"], ["ps"]]) assert.ok((await run(sys, argv)).out.includes(`Not read: ${why}.`), argv[0]);
  const r = await startDev(sys);
  assert.equal(r.code, 1);
  assert.ok(r.out.includes(why), "session start");
  assert.ok(processChecks(sys.cwd, { sys }).some((c) => c.label === `Process registry not read: ${why}`), "doctor");
});

test("AC-249-1: the reader finds allow entries for other accounts that write, add or delete, and leaves the user's own and root's", () => {
  const p = "/Users/me/a dir";
  const text = [head(p), " 0: user:me allow add_file,delete_child", " 1: user:root allow write", " 2: group:everyone deny delete",
    " 3: user:bob inherited allow list,add_subdirectory,file_inherit", " 4: group:staff allow list,search", " 5: group:admin allow delete_child"].join("\n");
  assert.deepEqual(macAclText(text, [p], "me").get(p), ["user:bob (entry 3)", "group:admin (entry 5)"]);
  for (const perm of ["write", "add_file", "append", "add_subdirectory", "delete_child", "delete", "writesecurity", "chown"]) {
    assert.deepEqual(macAclText(`${head(p)}\n 0: user:eve allow ${perm}\n`, [p], "me").get(p), ["user:eve (entry 0)"], perm);
  }
  assert.deepEqual(macAclText(`${head(p, false)}\n`, [p], "me").get(p), [], "no ACL");
});

test("AC-249-2: WHEN the ACL can't be read, or its output isn't known THEN it counts as can't tell, and the registry isn't read", posix, async () => {
  const p = "/Users/me/x", q = "/Users/me/y";
  assert.equal(macAclText(`${head(p)}\n 0: something new\n`, [p], "me").get(p), null, "an unknown line");
  assert.equal(macAclText(`${head(p)}\n`, [p, q], "me").get(q), undefined, "a missing block");
  assert.equal(macAclText("garbage\n", [p], "me").get(p), undefined, "output that isn't ls's");
  assert.equal(macAclText(null, [p], "me").get(p), undefined, "ls failed");
  const failed = realSys({ platform: "darwin", run: () => ({ status: 1, stdout: "", stderr: "ls: x: Permission denied" }) });
  assert.equal(failed.macAcls([p]).get(p), undefined);
  const above = tmp("procs-above-");
  const sys = repoAt(join(above, "repo"), { platform: "darwin", macAcl: (d) => (d === above ? null : []) });
  await run(sys, ["stop", "stale"]);
  assert.equal(stopped(sys), false);
  assert.ok((await run(sys, ["list"])).out.includes(`the ACL of ${above} can't be read, so who else can write it can't be told`));
});

test("AC-249-3: WHEN a macOS home folder has only its default group:everyone deny delete entry THEN it passes", () => {
  const home = "/Users/me";
  const sys = realSys({ platform: "darwin", run: lsRun(() => `${head(home)}\n 0: group:everyone deny delete\n`) });
  assert.deepEqual(sys.macAcls([home]).get(home), []);
});

test("AC-249-4: WHEN a command checks every folder on the path THEN it reads all their ACLs in one ls start", posix, async () => {
  const calls = [];
  const sys = repoAt(join(tmp("procs-above-"), "a", "b", "repo"), { platform: "darwin" });
  const read = sys.macAcls;
  sys.macAcls = (paths) => (calls.push(paths), read(paths));
  await run(sys, ["list"]);
  assert.equal(calls.length, 1, "one ls start");
  for (const dir of [sys.cwd, dirname(sys.cwd), "/"]) assert.ok(calls[0].includes(dir), dir);
  const runs = [];
  const paths = ["/a b", "/c"];
  const real = realSys({ platform: "darwin", run: lsRun((ps) => ps.map((x) => head(x, false)).join("\n"), runs) });
  assert.deepEqual([...real.macAcls(paths)], [["/a b", []], ["/c", []]]);
  assert.deepEqual(runs, [["/bin/ls", "-lde", "--", ...paths]], "one start, the paths after --");
  assert.equal(realSys({ platform: "linux", run: lsRun(() => "") }).macAcls(paths), null, "only macOS is asked");
});
