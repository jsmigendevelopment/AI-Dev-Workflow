// #245: step 6.1.3 runs the head's commands through main's fence.mjs, which wraps them in the operating system's
// sandbox, tests that sandbox from outside before each command, and names it on the `Checks:` comment. The skill
// steps are text the agents read, so those tests read the text; the script runs for real where bubblewrap works.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fake, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { bwrapArgs, main, profile } from "../../.agents/skills/coordinate/scripts/fence.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/fence.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const coordinate = () => read(".agents/skills/coordinate/SKILL.md");
/** Step 6.1 of coordinate, the local checks, up to the code review. */
const localChecks = () => coordinate().slice(coordinate().indexOf("1. **Local checks**"), coordinate().indexOf("2. **Code review.**"));
/** One numbered sub-step of 6.1, up to the next one. */
const subStep = (n) => {
  const step = localChecks();
  const at = step.indexOf(`\n      ${n}. `);
  const next = step.indexOf(`\n      ${n + 1}. `, at + 1);
  return step.slice(at, next === -1 ? undefined : next);
};
const linuxOnly = { skip: process.platform === "linux" ? false : "bubblewrap is the Linux fence" };
const bwrapWorks = () => {
  const r = spawnSync("bwrap", ["--ro-bind", "/", "/", "--dev", "/dev", "--", "true"], { encoding: "utf8", env: safeEnv() });
  return r.status === 0;
};
const PROBES = (folder) => readdirSync(folder).filter((f) => f.startsWith(".onrails-fence-probe-"));

/** A fake coordinator: a home folder with stored logins, the head's clone and an empty `<home>`. */
function setup() {
  const you = tmp("onrails-you-");
  mkdirSync(join(you, ".config", "gh"), { recursive: true });
  writeFileSync(join(you, ".config", "gh", "hosts.yml"), "github.com:\n  oauth_token: fake-coordinator-token\n");
  mkdirSync(join(you, ".ssh"));
  writeFileSync(join(you, ".ssh", "id_ed25519"), "fake-ssh-key\n");
  return { you, dir: tmp("onrails-clone-"), home: tmp("onrails-home-") };
}

/** fence.mjs run in the clone, as 6.1.3 starts it, with `script` as the head's command. */
function fenced({ you, dir, home }, script, { flags = [], bins = [] } = {}) {
  const env = safeEnv({ HOME: you, GH_TOKEN: "fake-coordinator-token" }, { bins, cwd: dir });
  return spawnSync(process.execPath, [SCRIPT, "run", "--home", home, ...flags, "--", "sh", "-c", script], { cwd: dir, encoding: "utf8", env });
}

const ESCAPE = (s) => `echo planted > ${s.you}/planted; echo planted > ${dirname(s.dir)}/planted-${s.dir.split("/").pop()}; echo planted > ${ROOT}planted-245; ` +
  `cat ${s.you}/.config/gh/hosts.yml; cat ${s.you}/.ssh/id_ed25519; ls ${ROOT}; echo "token=$GH_TOKEN"; echo inside > ok; echo inside > ${s.home}/ok`;

test("AC-245-1: WHEN step 6.1.3 runs the head's commands THEN bubblewrap limits writes to the clone and <home>, and the Checks: comment names it", { ...linuxOnly, skip: linuxOnly.skip || (!bwrapWorks() && "bubblewrap isn't usable here") }, () => {
  const s = setup();
  const r = fenced(s, ESCAPE(s));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr.split("\n")[0], /^Fence: bubblewrap \(checked: writes reach only the clone and <home>; your checkout of main and your stored logins can't be read\)$/);
  assert.equal(existsSync(join(s.you, "planted")), false, "no write to your home folder");
  assert.equal(existsSync(join(dirname(s.dir), `planted-${s.dir.split("/").pop()}`)), false, "no write beside the clone");
  assert.equal(existsSync(join(ROOT, "planted-245")), false, "no write to your checkout of main");
  assert.doesNotMatch(r.stdout, /fake-coordinator-token|fake-ssh-key/, "no stored login and no token reached it");
  assert.doesNotMatch(r.stdout, /AGENTS\.md/, "your checkout of main can't be listed");
  assert.equal(readFileSync(join(s.dir, "ok"), "utf8"), "inside\n");
  assert.equal(readFileSync(join(s.home, "ok"), "utf8"), "inside\n");
  for (const folder of [s.dir, s.home, s.you, dirname(s.dir), ROOT]) assert.deepEqual(PROBES(folder), [], `the fence check cleaned up ${folder}`);
});

test("AC-245-1: the fence is checked, not trusted: a bwrap that fences nothing is refused and the command never runs", { ...unixOnly, ...linuxOnly }, () => {
  const s = setup();
  const bin = tmp("onrails-bin-");
  fake(bin, "bwrap", '#!/bin/sh\nwhile [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"\n');
  const r = fenced(s, "echo ran > ran", { bins: [bin] });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /^Fence: none \(bubblewrap let a write through to [^)]*\)\. Nothing ran/);
  assert.equal(existsSync(join(s.dir, "ran")), false);
  for (const folder of [s.dir, s.home, s.you, dirname(s.dir), ROOT]) assert.deepEqual(PROBES(folder), [], `the fence check cleaned up ${folder}`);
});

test("AC-245-1: bubblewrap's arguments: the system read-only, a private /tmp, the clone and <home> writable, your checkout and logins hidden", () => {
  const p = { dir: "/w/clone", home: "/w/home", main: "/m", you: "/u", hidden: [{ path: "/m", folder: true }, { path: "/u/.ssh", folder: true }, { path: "/u/.netrc", folder: false }] };
  const args = bwrapArgs(p).join(" ");
  assert.match(args, /^--die-with-parent --new-session --ro-bind \/ \/ --dev \/dev --proc \/proc --tmpfs \/tmp /);
  assert.match(args, /--bind \/w\/clone \/w\/clone --bind \/w\/home \/w\/home --tmpfs \/m --tmpfs \/u\/\.ssh --ro-bind \/dev\/null \/u\/\.netrc --chdir \/w\/clone --$/);
  assert.doesNotMatch(args, /--share-|--bind \/ |--bind \/u /, "nothing else writable");
});

test("AC-245-1: the macOS profile denies writes outside the clone and <home>, reads of your checkout and logins, and the Keychain", () => {
  const p = { dir: "/w/clone", home: "/w/home", main: "/m", you: "/u", hidden: [{ path: "/m", folder: true }, { path: "/u/.netrc", folder: false }] };
  const text = profile(p);
  assert.match(text, /\(deny file-write\* \(require-all \(require-not \(subpath "\/w\/clone"\)\) \(require-not \(subpath "\/w\/home"\)\)/);
  assert.match(text, /\(deny file-read\* file-write\* \(subpath "\/m"\) \(literal "\/u\/\.netrc"\)\)/);
  assert.match(text, /\(deny mach-lookup \(global-name "com\.apple\.SecurityServer"\)/);
  assert.throws(() => profile({ ...p, dir: '/w/a"b' }), /can't write/);
});

test("AC-245-1: the Checks: comment carries the Fence: line, and 6.1.3 starts every head command through main's fence.mjs", () => {
  assert.match(subStep(5), /Then the `Fence:` line from 6\.1\.3, each command and its result/);
  assert.match(subStep(3), /`node <main>\/\.agents\/skills\/coordinate\/scripts\/fence\.mjs run --home <home> -- env -i \.\.\. <command>`, where `<main>` is your checkout of main's full path/);
  assert.match(subStep(3), /It tests the fence from outside before each command and prints `Fence: <name>` first: that line goes in the `Checks:` comment\./);
});

test("AC-245-1: fence.mjs won't fence your checkout of main or your home folder", unixOnly, () => {
  const s = setup();
  const env = safeEnv({ HOME: s.you }, { cwd: ROOT });
  const r = spawnSync(process.execPath, [SCRIPT, "run", "--home", s.home, "--", "true"], { cwd: ROOT, encoding: "utf8", env });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /inside or around your checkout of main/);
  const away = spawnSync(process.execPath, [SCRIPT, "run", "--home", s.you, "--", "true"], { cwd: s.dir, encoding: "utf8", env: safeEnv({ HOME: s.you }, { cwd: s.dir }) });
  assert.equal(away.status, 2, away.stderr);
  assert.match(away.stderr, /holds your home folder/);
});

/** main() in-process, in the clone, with no bwrap on its PATH: what it returned and printed. */
function noFence(s, flags) {
  const lines = [];
  const was = { cwd: process.cwd(), error: console.error };
  console.error = (...a) => lines.push(a.join(" "));
  process.chdir(s.dir);
  try {
    const status = main(["run", "--home", s.home, ...flags, "--", "sh", "-c", "echo ran > ran"], { platform: "linux", path: join(s.dir, "no-bin") });
    return { status, stderr: lines.join("\n") };
  } finally {
    process.chdir(was.cwd);
    console.error = was.error;
  }
}

test("AC-245-2: WHEN no fence is available THEN fence.mjs says so, runs nothing, and runs unfenced only when --unfenced asks", unixOnly, () => {
  const s = setup();
  const refused = noFence(s, []);
  assert.equal(refused.status, 3);
  assert.match(refused.stderr, /^Fence: none \(bubblewrap \(bwrap\) isn't installed\)\. Nothing ran/);
  assert.equal(existsSync(join(s.dir, "ran")), false);
  const ran = noFence(s, ["--unfenced"]);
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(ran.stderr, /^Fence: none \(bubblewrap \(bwrap\) isn't installed\)\. Running unfenced, as --unfenced asks/);
  assert.equal(readFileSync(join(s.dir, "ran"), "utf8"), "ran\n");
});

test("AC-245-2: with no working fence, the Checks: comment says so; Full runs unfenced with an FYI, below Full it's a decision", () => {
  const step = subStep(3);
  assert.match(step, /\*\*No working fence:\*\* `fence\.mjs` exits 3, prints `Fence: none` and why, and runs nothing\. Put that line in the `Checks:` comment\./);
  assert.match(step, /On Full, run each command again with `--unfenced` after `run`, and send one ℹ️ FYI per run of the loop/);
  assert.match(step, /Below Full, run nothing more on it and post no verdict: send one ⏳ decision through `ask`/);
  const decision = read("docs/decisions/245-1.md");
  assert.match(decision, /^# Decision 245-1\n/);
  assert.match(decision, /--unfenced/);
  assert.match(decision, /\*\*Originator:\*\* AI pick, not reviewed/);
});

test("AC-245-3: the recorded decision says a builder's worktree doesn't need the gate's fence, and coordinate step 4 follows it", () => {
  const decision = read("docs/decisions/245-2.md");
  assert.match(decision, /^# Decision 245-2\n/);
  assert.match(decision, /worktree/);
  assert.match(coordinate(), /A builder's worktree doesn't get 6\.1\.3's fence \(decision 245-2\)\./);
});

test("#245 scope comment: the skill's env -i line passes the proxy variables, upper and lower case, only without user info", () => {
  const [, line] = /`(env -i [^`]*<command>)`/.exec(subStep(3)) ?? [];
  const [, proxy] = /`(HTTPS_PROXY=[^`]+)`/.exec(subStep(3)) ?? [];
  assert.ok(line && proxy, "6.1.3 names both");
  const home = tmp("onrails-home-");
  const run = (vars) => {
    const r = spawnSync("sh", ["-c", line.replaceAll("<home>", home).replace("<command>", `${proxy} env`)], { encoding: "utf8", env: safeEnv({ LANG: "C.UTF-8", TERM: "dumb", ...vars }) });
    assert.equal(r.status, 0, r.stderr);
    return Object.fromEntries(r.stdout.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  };
  const base = ["CI", "GH_CONFIG_DIR", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "HOME", "LANG", "PATH", "TERM", "XDG_CONFIG_HOME", "XDG_DATA_HOME"];
  const names = [...base, "HTTPS_PROXY", "NODE_EXTRA_CA_CERTS", "NO_PROXY", "https_proxy", "no_proxy"].sort();
  const plain = run({ HTTPS_PROXY: "http://proxy.local:3128", https_proxy: "http://proxy.local:3129", NO_PROXY: "localhost", no_proxy: ".local", NODE_EXTRA_CA_CERTS: "/etc/ca.pem", HTTP_PROXY: "http://other:1" });
  assert.deepEqual(Object.keys(plain).sort(), names);
  assert.deepEqual([plain.HTTPS_PROXY, plain.https_proxy, plain.NO_PROXY, plain.no_proxy, plain.NODE_EXTRA_CA_CERTS], ["http://proxy.local:3128", "http://proxy.local:3129", "localhost", ".local", "/etc/ca.pem"]);
  for (const login of ["http://user:fake-pass@proxy.local:3128", "http://fake-user@proxy.local:3128"]) {
    const upper = run({ HTTPS_PROXY: login, https_proxy: "http://proxy.local:3129", NO_PROXY: "localhost", no_proxy: ".local" });
    assert.deepEqual(Object.keys(upper).sort(), names);
    assert.deepEqual([upper.HTTPS_PROXY, upper.https_proxy], ["", "http://proxy.local:3129"], login);
    const lower = run({ HTTPS_PROXY: "http://proxy.local:3128", https_proxy: login });
    assert.deepEqual([lower.HTTPS_PROXY, lower.https_proxy], ["http://proxy.local:3128", ""], login);
    assert.doesNotMatch(JSON.stringify([upper, lower]), /fake-/, login);
  }
});
