// #178: `update --all` brings the plugins, the global entry skills and the project's kit to the latest.
// The machine, its fakes and the child PATH check are in update-all-helpers.mjs. PATH safety, Windows and the docs
// have their own files: update-all-path, update-all-windows and update-all-docs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { exists, put, read, tmp, unixOnly } from "./helpers.mjs";
import { esc, machine, project, version } from "./update-all-helpers.mjs";

test("AC-178-1: WHEN update --all --dry-run runs with both plugins and global skills THEN it prints the plan for all four parts and runs nothing", unixOnly, () => {
  const m = machine(), dir = project();
  const before = read(dir, ".onrails.json");
  const r = m.run(["update", dir, "--all", "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.match(out, new RegExp(`Claude Code plugin core@onrails v0\\.6\\.0: would run\\n\\s+${esc(join(m.bin, "claude"))} plugin marketplace update onrails\\n\\s+${esc(join(m.bin, "claude"))} plugin update core@onrails`));
  assert.match(out, new RegExp(`Codex plugin or@onrails v0\\.6\\.0: would run\\n\\s+${esc(join(m.bin, "codex"))} plugin marketplace upgrade onrails`));
  assert.match(out, /Global entry skills: would refresh ~\/\.claude\/skills and ~\/\.agents\/skills/);
  assert.match(out, new RegExp(`Plan \\(dry run, nothing written\\): kit v0\\.1\\.0 -> v${esc(version)}`));
  assert.match(out, /doctor: would run after the updates/);
  assert.equal(m.calls(), "", "no fake tool was called, not even for --version");
  assert.equal(read(m.home, ".claude/skills/idea/SKILL.md"), "an older idea\n");
  assert.ok(!exists(m.home, ".agents/skills/idea/SKILL.md"), "no global skill written");
  assert.equal(read(dir, ".onrails.json"), before, "the project kit is untouched");
});

test("AC-178-2: WHEN update --all runs THEN it updates both plugins, refreshes global skills and the project kit, runs doctor and prints before and after", unixOnly, () => {
  const m = machine(), dir = project();
  const r = m.run(["update", dir, "--all"]);
  assert.equal(r.status, 0, r.stderr);
  const plugin = m.calls().split("\n").filter((l) => / plugin /.test(l));
  assert.deepEqual(plugin, ["claude plugin marketplace update onrails", "claude plugin update core@onrails", "codex plugin marketplace upgrade onrails"]);
  // Global skills, the init --global way: added where missing, the person's copy kept with the kit's next to it.
  assert.ok(exists(m.home, ".agents/skills/idea/SKILL.md") && exists(m.home, ".claude/skills/back/SKILL.md"));
  assert.equal(read(m.home, ".claude/skills/idea/SKILL.md"), "an older idea\n");
  assert.ok(exists(m.home, ".claude/skills/idea/SKILL.md.onrails-new"));
  assert.equal(JSON.parse(read(dir, ".onrails.json")).kitVersion, version);
  assert.match(m.calls(), /^claude --version$/m, "doctor ran after the updates");
  const summary = r.stdout.slice(r.stdout.lastIndexOf("Summary"));
  assert.match(summary, /Claude Code plugin core@onrails: v0\.6\.0 -> v0\.7\.9/);
  assert.match(summary, /Codex plugin or@onrails: v0\.6\.0 -> v0\.7\.9/);
  assert.match(summary, new RegExp(`Global entry skills: idea differed from kit v${esc(version)} -> idea still differs`));
  assert.match(summary, new RegExp(`Project kit: v0\\.1\\.0 -> v${esc(version)}`));
  assert.match(summary, /Compare each \.onrails-new in ~\/\.claude\/skills/);
  assert.match(summary, /Claude Code: run `\/reload-plugins` in each open session/);
  assert.ok(r.stdout.indexOf("Summary") > r.stdout.indexOf("required checks"), "the summary comes after doctor");
});

test("AC-178-3: WHEN update --all runs outside a project THEN it skips the project step and says so", unixOnly, () => {
  const m = machine({ global: false }), dir = tmp();
  const r = m.run(["update", dir, "--all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Project kit: skipped, this folder isn't an onRails project \(no \.onrails\.json\)/);
  assert.ok(!exists(dir, ".onrails.json") && !exists(dir, "AGENTS.md"), "nothing installed");
  assert.match(r.stdout, /Global entry skills: skipped, init --global was never run here/);
  assert.ok(!exists(m.home, ".claude/skills"), "no global skills made");
});

test("#178: a tool runs only when it and its plugin are both there; a failed command is reported, the rest still runs, and the exit is 1", unixOnly, () => {
  const m = machine({ tools: ["claude"], plugins: ["codex"], global: false });
  let r = m.run(["update", tmp(), "--all"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(m.calls(), / plugin /);
  assert.match(r.stdout, /Claude Code plugin: not installed, skipped/);
  assert.match(r.stdout, /Codex plugin or@onrails v0\.6\.0: skipped, codex isn't on your PATH/);

  const both = machine({ global: false });
  r = both.run(["update", tmp(), "--all"], { FAKE_FAIL: "plugin marketplace update onrails" });
  assert.equal(r.status, 1);
  assert.match(both.calls(), /^codex plugin marketplace upgrade onrails$/m, "Codex still updates");
  assert.doesNotMatch(both.calls(), /claude plugin update/, "Claude Code stops at its failed step");
  assert.match(r.stdout, /Claude Code plugin core@onrails: v0\.6\.0 -> v0\.6\.0 \(FAILED: .*claude plugin marketplace update onrails\)/);
});

test("#178: plain update still updates only the project, and never calls a plugin tool", unixOnly, () => {
  const m = machine(), dir = project();
  const r = m.run(["update", dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(m.calls(), "");
  assert.equal(read(m.home, ".claude/skills/idea/SKILL.md"), "an older idea\n");
  assert.ok(!exists(m.home, ".agents/skills"));
});

test("#178: a part that throws is a FAILED row; the other parts, doctor and the summary still run, and the exit is 1", unixOnly, () => {
  // Global skills: ~/.agents is a file, so writing ~/.agents/skills fails.
  const m = machine({ tools: [], plugins: [] }), dir = project();
  put(m.home, ".agents", "not a folder\n");
  let r = m.run(["update", dir, "--all"]);
  assert.equal(r.status, 1);
  let summary = r.stdout.slice(r.stdout.lastIndexOf("Summary"));
  assert.match(summary, /Global entry skills: FAILED: .*(ENOTDIR|EEXIST)/);
  assert.match(summary, new RegExp(`Project kit: v0\\.1\\.0 -> v${esc(version)}`), "the project kit still updates");
  assert.ok(r.stdout.indexOf("Summary") > r.stdout.indexOf("4. doctor"), "doctor ran before the summary");

  // Project kit: its record is broken JSON.
  const broken = tmp();
  put(broken, ".onrails.json", "{ broken");
  r = machine({ tools: [], plugins: [], global: false }).run(["update", broken, "--all"]);
  assert.equal(r.status, 1);
  summary = r.stdout.slice(r.stdout.lastIndexOf("Summary"));
  assert.match(summary, /Project kit: FAILED: .*JSON/);
  assert.match(r.stdout, /4\. doctor/);
});
