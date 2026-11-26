// #178: `update --all` runs a plugin command only with a claude or codex the person installed, never one a project
// ships. The machine and its fakes are in update-all-helpers.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fake, nodeOnly, put, read, tmp, unixOnly } from "./helpers.mjs";
import { BOTH, CLAUDE, PLANTED, esc, homeInstall, machine, pluginCalls, project, version } from "./update-all-helpers.mjs";

test("#178: update --all never runs a claude from the project, the current folder, a node_modules/.bin or a relative PATH entry", unixOnly, () => {
  const m = machine({ tools: ["claude"], plugins: ["claude"], global: false });
  const root = tmp(), dir = join(root, "app"), cwd = join(root, "here", "sub");
  // npx puts <cwd>/node_modules/.bin and each ancestor's first; the rest are a folder inside the project,
  // a folder inside the current one, one inside the project whose name starts with "..", a link into the project,
  // and a relative entry that points outside both.
  const planted = [join(dir, "node_modules", ".bin"), join(root, "node_modules", ".bin"), join(dir, "tools"), join(cwd, "bin"), join(dir, "..x"), join(root, "here", "rel")];
  for (const d of planted) fake(d, "claude", PLANTED);
  symlinkSync(join(dir, "tools"), join(root, "link"));
  mkdirSync(cwd, { recursive: true });
  const PATH = [...planted.slice(0, 5), join(root, "link"), join("..", "rel"), m.env.PATH].join(delimiter);
  const plan = m.run(["update", dir, "--all", "--dry-run"], { PATH }, cwd);
  assert.match(plan.stdout, new RegExp(`would run\\n\\s+${esc(join(m.bin, "claude"))} plugin marketplace update onrails`));
  const r = m.run(["update", dir, "--all"], { PATH }, cwd);
  assert.equal(r.status, 0, r.stderr);
  // Only plugin commands: doctor's own `claude --version` probe still uses the bare name (#185).
  assert.deepEqual(pluginCalls(m), BOTH);
});

test("#178: run from the home folder, or given it as the project, update --all still runs the claude in ~/.local/bin", unixOnly, () => {
  let m = homeInstall();
  let r = m.run(["update", "--all"], { PATH: m.PATH }, m.home);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pluginCalls(m), BOTH, r.stdout);
  // The /update skill passes the current folder as the project root when it isn't a project: here, the home folder.
  m = homeInstall();
  r = m.run(["update", m.home, "--all"], { PATH: m.PATH }, tmp());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pluginCalls(m), BOTH, r.stdout);
  // A folder that holds the home folder, and the filesystem root, are never the project either.
  m = homeInstall();
  r = m.run(["update", dirname(m.home), "--all"], { PATH: m.PATH }, "/");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pluginCalls(m), BOTH, r.stdout);
});

test("#178: a claude found only inside the project is named as that, not as missing from PATH, and doesn't run", unixOnly, () => {
  const m = homeInstall(), dir = join(m.home, "work", "app");
  fake(join(dir, "tools"), "claude", PLANTED);
  const r = m.run(["update", dir, "--all"], { PATH: [join(dir, "tools"), nodeOnly()].join(delimiter) }, tmp());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Code plugin core@onrails v0\.6\.0: skipped, claude found only inside this project, not run/);
  assert.doesNotMatch(r.stdout, /isn't on your PATH/);
  assert.deepEqual(pluginCalls(m), []);
});

test("#178: a node_modules/.bin entry written as .bin/. or ./.bin is still skipped", unixOnly, () => {
  const m = machine({ tools: ["claude"], plugins: ["claude"], global: false });
  const root = tmp(), dir = join(root, "app"), up = join(root, "node_modules");
  fake(join(up, ".bin"), "claude", PLANTED);
  mkdirSync(dir, { recursive: true });
  for (const entry of [`${up}/.bin/.`, `${up}/./.bin`]) {
    const r = m.run(["update", dir, "--all"], { PATH: [entry, m.env.PATH].join(delimiter) }, dir);
    assert.equal(r.status, 0, r.stderr);
  }
  // Only plugin commands: doctor's own `claude --version` probe still uses the bare name (#185).
  assert.deepEqual(pluginCalls(m), [...BOTH, ...BOTH], "the ancestor's node_modules/.bin never ran a plugin command");
});

test("#178: a project that holds the home folder stays a root, so a claude it ships never runs", unixOnly, () => {
  const proj = project(), home = join(proj, ".home");
  const m = machine({ tools: [], plugins: ["claude"], global: false, home });
  fake(join(proj, "tools"), "claude", PLANTED);
  // ~/.local/bin is inside the project too, so it fails safe: found only inside the project, nothing runs.
  const local = join(home, ".local", "bin");
  fake(local, "claude", CLAUDE);
  const r = m.run(["update", proj, "--all"], { PATH: [join(proj, "tools"), local, m.bin].join(delimiter) }, tmp());
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Code plugin core@onrails v0\.6\.0: skipped, claude found only inside this project, not run/);
  assert.deepEqual(pluginCalls(m), [], r.stdout);
});

test("#178: when the home folder is itself an onRails project, its claude is skipped and the message says how to run it by hand", unixOnly, () => {
  const m = homeInstall();
  put(m.home, ".onrails.json", JSON.stringify({ kitVersion: "0.1.0" }));
  const found = join(m.home, ".local", "bin", "claude");
  const r = m.run(["update", "--all", "--dry-run"], { PATH: m.PATH }, m.home);
  assert.equal(r.status, 0, r.stderr);
  const hint = `If ${found} is yours, run it by hand: ${found} plugin marketplace update onrails, then ${found} plugin update core@onrails`;
  assert.match(r.stdout, new RegExp(`skipped, claude found only inside this project, not run\\. ${esc(hint)}`));
  assert.deepEqual(pluginCalls(m), []);
});

test("#178: run from a subfolder of a project, update --all treats the nearest folder with .onrails.json as the project, so its claude never runs and its kit updates", unixOnly, () => {
  const proj = project(), sub = join(proj, "sub"), tools = join(proj, "tools");
  mkdirSync(sub);
  fake(tools, "claude", PLANTED);
  // Only the project's claude on PATH: named as found inside this project, and nothing runs.
  let m = homeInstall();
  let r = m.run(["update", "--all", "--yes"], { PATH: [tools, nodeOnly()].join(delimiter) }, sub);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Claude Code plugin core@onrails v0\.6\.0: skipped, claude found only inside this project, not run/);
  assert.deepEqual(pluginCalls(m), [], r.stdout);
  assert.match(r.stdout.slice(r.stdout.lastIndexOf("Summary")), new RegExp(`Project kit: v0\\.1\\.0 -> v${esc(version)}`));
  assert.equal(JSON.parse(read(proj, ".onrails.json")).kitVersion, version, "the project kit step found the project");
  // The project's claude first, the person's after: only the person's runs. Given the subfolder from outside, too.
  for (const [args, cwd] of [[["update", "--all", "--yes"], sub], [["update", sub, "--all", "--yes"], tmp()]]) {
    m = homeInstall();
    r = m.run(args, { PATH: [tools, m.PATH].join(delimiter) }, cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(pluginCalls(m), BOTH, r.stdout);
  }
  // Started in a HOME the project holds: the walk up passes the home folder and still finds the project.
  m = machine({ tools: [], plugins: ["claude"], global: false, home: join(proj, ".home") });
  r = m.run(["update", "--all", "--dry-run"], { PATH: [tools, m.bin].join(delimiter) }, m.home);
  assert.match(r.stdout, /skipped, claude found only inside this project, not run/);
  assert.deepEqual(pluginCalls(m), [], r.stdout);
});

test("#178: a tool found only where a project can ship one gets no by-hand command; only the home folder as the project gets one", unixOnly, () => {
  const proj = project(), home = join(proj, ".home"), tools = join(proj, "tools");
  const m = machine({ tools: [], plugins: ["claude"], global: false, home });
  fake(tools, "claude", PLANTED);
  let r = m.run(["update", proj, "--all", "--dry-run"], { PATH: [tools, m.bin].join(delimiter) }, tmp());
  assert.match(r.stdout, /skipped, claude found only inside this project, not run, because a project can ship its own claude\n/);
  assert.doesNotMatch(r.stdout, /run it by hand/);
  const bin = join(tmp(), "node_modules", ".bin");
  fake(bin, "claude", PLANTED);
  r = m.run(["update", tmp(), "--all", "--dry-run"], { PATH: [bin, m.bin].join(delimiter) }, tmp());
  assert.match(r.stdout, /skipped, claude found only in a node_modules\/\.bin, not run, because a project can ship its own claude\n/);
  assert.doesNotMatch(r.stdout, /run it by hand/);
  assert.deepEqual(pluginCalls(m), []);
});

test("#178: the shared helper refuses to start a child whose PATH holds a claude or codex that isn't one of the test's fakes", unixOnly, () => {
  const m = machine({ tools: [], plugins: [], global: false }), other = tmp();
  put(other, "codex", "#!/bin/sh\necho real codex >> \"$FAKE_LOG\"\n");
  assert.throws(() => m.run(["update", tmp(), "--all", "--dry-run"], { PATH: [other, m.env.PATH].join(delimiter) }), /isn't one of this test's fakes/);
  assert.throws(() => m.run(["update", "--all", "--dry-run"], { PATH: ["..", m.env.PATH].join(delimiter) }, join(other, "x")), /isn't one of this test's fakes/, "a relative entry too");
  assert.equal(m.calls(), "");
});
