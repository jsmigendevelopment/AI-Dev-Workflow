// Projects and machines set up before the rename to onRails keep working: the old names are
// read as fallbacks, and nothing is moved or deleted without a yes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runChecks } from "../src/checks.mjs";
import { doctorFix } from "../src/fix.mjs";
import { homeDir, offerHomeMove } from "../src/home.mjs";
import { init } from "../src/init.mjs";
import { mergeDeny } from "../src/merge.mjs";
import { profilePath, profileShow } from "../src/profile.mjs";
import { readProjectManifest } from "../src/sync.mjs";
import { update } from "../src/update.mjs";
import { exists, fakeAsk, fakeSystem, logger, makeKit, put, read, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const labels = (checks) => checks.map((c) => `${c.status} ${c.label}`).join("\n");

// A project as the old CLI left it: .ai-dev-workflow.json, and AGENTS.kit.md next to the person's AGENTS.md.
function oldProject(core = { "AGENTS.md": "rules v1\n", ".codex/config.toml": "codex v1\n", "a.md": "a v1\n" }) {
  const dir = tmp();
  put(dir, "AGENTS.md", "ours\n");
  put(dir, ".codex/config.toml", "our codex\n");
  init(dir, { kitDir: makeKit("0.1.0", core), log: logger() });
  const manifest = JSON.parse(read(dir, ".onrails.json"));
  const files = {};
  for (const [path, sha] of Object.entries(manifest.files)) {
    const old = path.replace("AGENTS.onrails.md", "AGENTS.kit.md").replace("config.onrails.toml", "config.kit.toml");
    files[old] = sha;
    if (old !== path) put(dir, old, read(dir, path));
  }
  for (const path of [".onrails.json", "AGENTS.onrails.md", ".codex/config.onrails.toml"]) rmSync(`${dir}/${path}`);
  put(dir, ".ai-dev-workflow.json", JSON.stringify({ kitVersion: "0.1.0", files }));
  return dir;
}
const v2 = { "AGENTS.md": "rules v2\n", ".codex/config.toml": "codex v2\n", "a.md": "a v2\n" };

test("the old project record is read when .onrails.json is missing, and init refuses to install twice", () => {
  const dir = oldProject();
  assert.equal(readProjectManifest(dir).kitVersion, "0.1.0");
  const log = logger();
  assert.equal(init(dir, { kitDir: makeKit("0.2.0", v2), log }), 1);
  assert.match(log.text(), /npx onrails update/);
});

test("update renames the old record after a yes, and moves an untouched AGENTS.kit.md and config.kit.toml", async () => {
  const dir = oldProject();
  const log = logger();
  assert.equal(await update(dir, { kitDir: makeKit("0.2.0", v2), ask: fakeAsk(["y"]), log }), 0);
  assert.ok(!exists(dir, ".ai-dev-workflow.json"));
  const files = JSON.parse(read(dir, ".onrails.json")).files;
  assert.ok("AGENTS.onrails.md" in files && !("AGENTS.kit.md" in files));
  assert.ok(".codex/config.onrails.toml" in files && !(".codex/config.kit.toml" in files));
  assert.equal(read(dir, "AGENTS.onrails.md"), "rules v2\n");
  assert.equal(read(dir, ".codex/config.onrails.toml"), "codex v2\n");
  assert.ok(!exists(dir, "AGENTS.kit.md") && !exists(dir, ".codex/config.kit.toml"));
  assert.equal(read(dir, "AGENTS.md"), "ours\n");
  assert.equal(read(dir, "a.md"), "a v2\n");
  assert.match(log.text(), /delete \(renamed\) AGENTS\.kit\.md \(now AGENTS\.onrails\.md\)/);
});

test("update keeps the old record name after a no, and --yes renames it without asking", async () => {
  const dir = oldProject();
  const no = logger();
  assert.equal(await update(dir, { kitDir: makeKit("0.2.0", v2), ask: fakeAsk(["n"]), log: no }), 0);
  assert.equal(JSON.parse(read(dir, ".ai-dev-workflow.json")).kitVersion, "0.2.0");
  assert.ok(!exists(dir, ".onrails.json"));
  assert.match(no.text(), /Kept \.ai-dev-workflow\.json/);

  const ask = fakeAsk([]);
  await update(dir, { kitDir: makeKit("0.2.0", v2), ask, yes: true, log: logger() });
  assert.equal(ask.questions.length, 0);
  assert.ok(exists(dir, ".onrails.json") && !exists(dir, ".ai-dev-workflow.json"));
});

test("update --dry-run on an old project writes nothing and says it would offer the rename", async () => {
  const dir = oldProject();
  const log = logger();
  await update(dir, { kitDir: makeKit("0.2.0", v2), dryRun: true, log });
  assert.ok(exists(dir, ".ai-dev-workflow.json") && exists(dir, "AGENTS.kit.md") && !exists(dir, ".onrails.json"));
  assert.match(log.text(), /offer to rename it \.onrails\.json/);
});

test("update keeps an AGENTS.kit.md you edited, and leaves one you merged and deleted gone", async () => {
  const edited = oldProject();
  put(edited, "AGENTS.kit.md", "half merged\n");
  const log = logger();
  await update(edited, { kitDir: makeKit("0.2.0", v2), yes: true, log });
  assert.equal(read(edited, "AGENTS.kit.md"), "half merged\n");
  assert.equal(read(edited, "AGENTS.onrails.md"), "rules v2\n");
  assert.match(log.text(), /You edited AGENTS\.kit\.md, so it was kept/);

  const merged = oldProject();
  rmSync(`${merged}/AGENTS.kit.md`);
  const same = { ...v2, "AGENTS.md": "rules v1\n" };
  await update(merged, { kitDir: makeKit("0.2.0", same), yes: true, log: logger() });
  assert.ok(!exists(merged, "AGENTS.onrails.md"), "the kit's AGENTS.md didn't change, so nothing comes back");
  await update(merged, { kitDir: makeKit("0.3.0", v2), yes: true, log: logger() });
  assert.equal(read(merged, "AGENTS.onrails.md"), "rules v2\n", "a newer kit AGENTS.md is offered again");
});

test("update lists .kit-new copies still waiting from the old CLI and leaves them", async () => {
  const dir = oldProject();
  put(dir, "a.md.kit-new", "old offer\n");
  const log = logger();
  await update(dir, { kitDir: makeKit("0.2.0", v2), yes: true, log });
  assert.equal(read(dir, "a.md.kit-new"), "old offer\n");
  assert.match(log.text(), /Still waiting from before the rename .*a\.md\.kit-new/);
});

test("the kit's settings.json hooks are recognised in a project set up by the old CLI: no duplicates", () => {
  const kit = read(REPO, ".claude/settings.json");
  assert.equal(mergeDeny(kit, kit), null, "the hook commands didn't change in the rename");
  const old = JSON.parse(kit);
  old.model = "opus";
  const merged = mergeDeny(JSON.stringify(old), kit);
  assert.equal(merged, null);
});

test("homeDir uses ~/.onrails, or ~/.ai-dev-workflow while only that one exists", () => {
  const home = tmp();
  assert.equal(homeDir(home), `${home}/.onrails`);
  put(home, ".ai-dev-workflow/profile.toml", "old\n");
  assert.equal(homeDir(home), `${home}/.ai-dev-workflow`);
  assert.equal(profilePath(home), `${home}/.ai-dev-workflow/profile.toml`);
  const log = logger();
  assert.equal(profileShow({ home, log }), 0);
  assert.match(log.text(), /old/);
  put(home, ".onrails/profile.toml", "new\n");
  assert.equal(homeDir(home), `${home}/.onrails`);
});

test("offerHomeMove asks y/N, keeps the old folder on a no, and moves it on a yes or --yes", async () => {
  const home = tmp();
  assert.equal(await offerHomeMove({ home, ask: fakeAsk(["y"]), log: logger() }), false, "nothing to move");

  put(home, ".ai-dev-workflow/boards/app.md", "board\n");
  const no = logger();
  const ask = fakeAsk(["n"]);
  assert.equal(await offerHomeMove({ home, ask, log: no }), false);
  assert.match(ask.questions[0], /\[y\/N\]/);
  assert.ok(exists(home, ".ai-dev-workflow/boards/app.md") && !exists(home, ".onrails"));
  assert.equal(await offerHomeMove({ home, ask: fakeAsk([""]), log: logger() }), false, "Enter means no");

  assert.equal(await offerHomeMove({ home, ask: fakeAsk(["y"]), log: logger() }), true);
  assert.equal(read(home, ".onrails/boards/app.md"), "board\n");
  assert.ok(!exists(home, ".ai-dev-workflow"));

  const other = tmp();
  put(other, ".ai-dev-workflow/profile.toml", "p\n");
  assert.equal(await offerHomeMove({ home: other, yes: true, log: logger() }), true);
  assert.equal(read(other, ".onrails/profile.toml"), "p\n");
});

test("doctor reports the old folder and record, and doctor --fix moves the folder only after a yes", async () => {
  const home = tmp(), dir = oldProject();
  put(home, ".ai-dev-workflow/profile.toml", "p\n");
  const text = labels(runChecks(dir, { sys: fakeSystem({ home }) }));
  assert.match(text, /✗ Your onRails folder still has its old name, ~\/\.ai-dev-workflow/);
  assert.match(text, /Kit v0\.1\.0 installed/, "the old record is read");
  assert.match(text, /– The kit's record still has its old name, \.ai-dev-workflow\.json/);

  await doctorFix(dir, { sys: fakeSystem({ home }), ask: fakeAsk(["n", "n", "n"]), log: logger() });
  assert.ok(exists(home, ".ai-dev-workflow/profile.toml") && !exists(home, ".onrails"));
  await doctorFix(dir, { sys: fakeSystem({ home }), yes: true, log: logger() });
  assert.equal(read(home, ".onrails/profile.toml"), "p\n");

  put(home, ".ai-dev-workflow/stale", "x");
  assert.match(labels(runChecks(dir, { sys: fakeSystem({ home }) })), /– ~\/\.ai-dev-workflow is still there next to ~\/\.onrails/);
});

test("the binary offers the move on a run, keeps the folder on a piped no, and moves it with --yes", () => {
  const home = tmp();
  put(home, ".ai-dev-workflow/profile.toml", 'github_owner = "old"\n');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const kept = spawnSync(process.execPath, [CLI, "profile", "show"], { encoding: "utf8", env, input: "n\n" });
  assert.equal(kept.status, 0, kept.stderr);
  assert.match(kept.stdout, /Move it to ~\/\.onrails\? .*\[y\/N\]/);
  assert.match(kept.stdout, /github_owner = "old"/);
  assert.ok(exists(home, ".ai-dev-workflow/profile.toml"));

  const doctor = spawnSync(process.execPath, [CLI, "doctor", tmp()], { encoding: "utf8", env, input: "" });
  assert.doesNotMatch(doctor.stdout, /Move it to/, "doctor stays read-only");

  const moved = spawnSync(process.execPath, [CLI, "profile", "show", "--yes"], { encoding: "utf8", env, input: "" });
  assert.equal(moved.status, 0, moved.stderr);
  assert.match(moved.stdout, /Moved ~\/\.ai-dev-workflow to ~\/\.onrails/);
  assert.ok(exists(home, ".onrails/profile.toml") && !exists(home, ".ai-dev-workflow"));
});

// The scripts the skills and hooks call.
const script = (path, args, home, extra = {}) =>
  spawnSync(process.execPath, [`${REPO}${path}`, ...args], { encoding: "utf8", cwd: tmp(), env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: "", ...extra } });

test("worklog.mjs and board.mjs use ~/.onrails, or the old folder while only it exists", () => {
  const fresh = tmp();
  script(".agents/skills/afk/scripts/worklog.mjs", ["presence", "afk", "lunch"], fresh);
  assert.ok(exists(fresh, ".onrails/presence.json"));
  assert.match(script(".agents/skills/coordinate/scripts/board.mjs", ["path", "--project", "app"], fresh).stdout, /\.onrails[\\/]boards[\\/]app\.md/);

  const old = tmp();
  put(old, ".ai-dev-workflow/presence.json", '{"status":"here"}\n');
  script(".agents/skills/afk/scripts/worklog.mjs", ["presence", "afk", "lunch"], old);
  assert.match(read(old, ".ai-dev-workflow/presence.json"), /"away"/);
  assert.ok(!exists(old, ".onrails"));
  assert.match(script(".agents/skills/coordinate/scripts/board.mjs", ["path", "--project", "app"], old).stdout, /\.ai-dev-workflow[\\/]boards[\\/]app\.md/);
});

test("notify.mjs reads presence from the old folder and still honours ADW_NOTIFY_PRINT", () => {
  const home = tmp();
  put(home, ".ai-dev-workflow/presence.json", '{"status":"away"}\n');
  const args = ["--level", "blocker", "--title", "x"];
  const old = script(".claude/hooks/notify.mjs", args, home, { ADW_NOTIFY_PRINT: "1" });
  assert.match(old.stdout, /"held"|"recorded"|away/i);
  assert.ok(exists(home, ".ai-dev-workflow/notify-batch.json") && !exists(home, ".onrails"));
  const now = script(".claude/hooks/notify.mjs", args, tmp(), { ONRAILS_NOTIFY_PRINT: "1" });
  assert.match(now.stdout, /"sent"|"batched"|"held"|"recorded"/);
});

test("the session-start hook reads .onrails.json, or the old .ai-dev-workflow.json", () => {
  const dir = tmp();
  const run = () => spawnSync(process.execPath, [`${REPO}.claude/hooks/session-start.mjs`], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } }).stdout;
  put(dir, ".ai-dev-workflow.json", '{"kitVersion":"0.3.0"}');
  assert.match(run(), /Kit: v0\.3\.0/);
  put(dir, ".onrails.json", '{"kitVersion":"0.4.0"}');
  assert.match(run(), /Kit: v0\.4\.0/);
});
