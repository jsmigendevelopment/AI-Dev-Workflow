// #225, round 2 review of #242: the local gate checks the head in its own clone, with an empty home and no tokens,
// and main's pr-rules.mjs starts git with no token, no hooks and no fsmonitor, counts only what main's committed
// .gitattributes mark generated, and reads GitHub's numbers consistently. The scripts run against a fake gh in
// throwaway repos; the skill steps are text the agents read, so those tests read the text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { checkout, git, rules } from "./pr-rules-fakes.mjs";

const coordinate = () => readFileSync(fileURLToPath(new URL("../../.agents/skills/coordinate/SKILL.md", import.meta.url)), "utf8");
/** Step 6.1 of coordinate, the local checks, up to the code review. */
const localChecks = () => coordinate().slice(coordinate().indexOf("1. **Local checks**"), coordinate().indexOf("2. **Code review.**"));
/** One numbered sub-step of 6.1, up to the next one. */
const subStep = (n) => {
  const step = localChecks();
  const at = step.indexOf(`\n      ${n}. `);
  const next = step.indexOf(`\n      ${n + 1}. `, at + 1);
  return step.slice(at, next === -1 ? undefined : next);
};
const HUGE = [["src/huge.ts", 5000, 0]];
const reads = (calls, path) => calls.split("\n").filter((l) => l.endsWith(path)).length;

test("#225 round 2, must 1: step 6.1.2 checks the head out in its own fresh clone, never a worktree of your checkout, and 6.1.6 removes it", () => {
  const step = subStep(2);
  assert.match(step, /Make a clean clone of the head in a fresh folder, never one from an earlier run, and never a worktree of your checkout/);
  const at = (text) => (assert.ok(step.includes(text), text), step.indexOf(text));
  assert.ok(at("Run `mktemp -d` twice") < at("`git fetch origin pull/<n>/head`"));
  assert.ok(at("`git fetch origin pull/<n>/head`") < at("`git clone --no-local --no-checkout . <dir>`"));
  assert.ok(at("`git clone --no-local --no-checkout . <dir>`") < at("`git -C <dir> fetch origin <sha>`"));
  assert.ok(at("`git -C <dir> fetch origin <sha>`") < at("`git -C <dir> checkout --detach <sha>`"));
  assert.ok(at("`git -C <dir> checkout --detach <sha>`") < at("`git -C <dir> rev-parse HEAD` must print `<sha>`"));
  assert.doesNotMatch(localChecks(), /git worktree (?:add|remove)|worktree prune/, "no worktree of your checkout for the head");
  assert.match(subStep(6), /Remove both folders: `rm -rf <dir> <home>`/);
});

test("#225 round 2, must 1: every command in the head's clone runs with an empty home, no global or system git config and every token unset", () => {
  const run = subStep(3);
  // Round 3, nice item 5: an allow-list (`env -i`) replaces the list of unset tokens; the test below runs it.
  assert.match(run, /`env -i PATH="\$PATH" HOME=<home> XDG_CONFIG_HOME=<home> XDG_DATA_HOME=<home> GH_CONFIG_DIR=<home> GIT_CONFIG_GLOBAL=\/dev\/null GIT_CONFIG_NOSYSTEM=1 LANG="\$LANG" TERM="\$TERM" CI=1 <command>` for each command of the local gate\. Every token and key stays unset, and so do `SSH_AUTH_SOCK` \(your SSH agent can push to GitHub\) and the desktop keyring's address\./);
  assert.match(run, /it must find no stored login either: `gh`, `wrangler` and git's credential helper keep theirs under your home folder/);
  assert.match(run, /\*\*Use your tool's sandbox\*\* where it can run commands in one: run the head's commands there, with writes limited to `<dir>` and `<home>`\./);
  assert.match(run, /Without one, they still run as your OS user and can read or change what that user can, so the clone and the empty home close the easy routes, not every route \(#245\)\./);
  assert.match(subStep(2), /the second `<home>`, an empty folder for 6\.1\.3/);
});

test("#225 round 2, must 1: pr-rules.mjs starts every git with no token, no hooks, no fsmonitor and no global or system config", unixOnly, () => {
  const r = rules({ files: [["plugin/a.md", 900, 0], ["src/a.ts", 10, 5]], attributes: "plugin/** linguist-generated\n", logGit: true, env: { GH_TOKEN: "fake-coordinator-token", GITHUB_TOKEN: "fake-coordinator-token", GIT_DIR: "/nowhere" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /15 changed lines/);
  const calls = r.gitCalls();
  assert.ok(calls.some((c) => c.argv.includes("check-attr")), "the fake git saw check-attr");
  for (const call of calls) {
    assert.deepEqual(call.argv.slice(0, 4), ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"], call.argv.join(" "));
    assert.deepEqual(call.tokens, [], call.argv.join(" "));
    assert.equal(call.global, "/dev/null", call.argv.join(" "));
    assert.equal(call.nosystem, "1", call.argv.join(" "));
  }
});

test("#225 round 2, must 1: an fsmonitor or hook set in main's checkout never starts from pr-rules.mjs", unixOnly, () => {
  const dir = checkout();
  const leak = join(tmp("onrails-leak-"), "leak");
  const hooks = join(dir, "planted-hooks");
  mkdirSync(hooks);
  const planted = join(dir, "planted.sh");
  writeFileSync(planted, `#!/bin/sh\nenv >> ${leak}\n`);
  chmodSync(planted, 0o755);
  for (const hook of ["reference-transaction", "post-checkout", "post-index-change"]) {
    writeFileSync(join(hooks, hook), `#!/bin/sh\nenv >> ${leak}\n`);
    chmodSync(join(hooks, hook), 0o755);
  }
  git(dir, "config", "core.fsmonitor", planted);
  git(dir, "config", "core.hooksPath", hooks);
  const r = rules({ dir, files: HUGE, env: { GH_TOKEN: "fake-coordinator-token" } });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /5000 changed lines/);
  assert.equal(existsSync(leak), false, existsSync(leak) ? readFileSync(leak, "utf8") : "");
});

test("#225 round 2, must 2: pr-rules.mjs counts linguist-generated only from main's committed .gitattributes", unixOnly, () => {
  const marked = "* linguist-generated\n";
  const info = checkout();
  writeFileSync(join(info, ".git", "info", "attributes"), marked);
  const local = checkout();
  writeFileSync(join(local, "local.attributes"), marked);
  git(local, "config", "core.attributesFile", join(local, "local.attributes"));
  const uncommitted = checkout();
  writeFileSync(join(uncommitted, ".gitattributes"), marked);
  const xdg = tmp("onrails-xdg-");
  mkdirSync(join(xdg, "git"));
  writeFileSync(join(xdg, "git", "attributes"), marked);
  for (const [why, run] of [
    ["info/attributes", { dir: info }],
    ["core.attributesFile", { dir: local }],
    ["an uncommitted .gitattributes", { dir: uncommitted }],
    ["the global attributes file", { env: { XDG_CONFIG_HOME: xdg } }],
  ]) {
    const r = rules({ files: HUGE, ...run });
    assert.equal(r.status, 1, `${why}: ${r.stderr}`);
    assert.match(r.stderr, /5000 changed lines \(over 400/, why);
  }
  // Committed ones count, a nested one included.
  const nested = checkout("plugin/** linguist-generated\n");
  mkdirSync(join(nested, "app"));
  writeFileSync(join(nested, "app", ".gitattributes"), "gen/** linguist-generated\n");
  git(nested, "add", "-A");
  git(nested, "commit", "-q", "-m", "nested");
  const ok = rules({ dir: nested, files: [["plugin/a.md", 900, 0], ["app/gen/b.ts", 900, 0], ["src/a.ts", 10, 5]] });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /15 changed lines/);
});

test("#225 round 2, nice item 5: pr-rules.mjs reads main's checkout, wherever it is started from", unixOnly, () => {
  const dir = checkout("plugin/** linguist-generated\n");
  mkdirSync(join(dir, "src"));
  const files = [["plugin/a.md", 900, 0], ["src/a.ts", 10, 5]];
  const sub = rules({ dir, cwd: join(dir, "src"), files });
  assert.equal(sub.status, 0, sub.stderr);
  assert.match(sub.stdout, /15 changed lines/);
  const elsewhere = checkout("* linguist-generated\n");
  const away = rules({ dir: checkout(), cwd: elsewhere, files: HUGE });
  assert.equal(away.status, 1, away.stderr);
  assert.match(away.stderr, /5000 changed lines/);
});

test("#225 round 2, nice item 3: pr-rules.mjs reads the head again after the files, and fails closed when it moved", unixOnly, () => {
  const r = rules({ again: { pull: { head: { ref: "feat/5-share", sha: "e".repeat(40) } } } });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /The head moved: #9 is at e{40}, not d{40}\. Check the new head\./);
  assert.equal(r.stdout, "");
  assert.equal(reads(r.calls, "repos/acme/app/pulls/9"), 2, "the pull request, then its files, then the pull request again");
});

test("#225 round 2, nice item 3: a file listed twice counts once, and can't stand in for a file GitHub left out", unixOnly, () => {
  const hidden = rules({ files: [["src/a.ts", 10, 5], ["src/a.ts", 10, 5]], additions: 310, deletions: 155 });
  assert.equal(hidden.status, 2, hidden.stderr);
  assert.match(hidden.stderr, /GitHub listed 1 different files, but #9 changes 2, so the size can't be counted\. That's never a pass: try again next sweep\./);
  assert.equal(reads(hidden.calls, "repos/acme/app/pulls/9/files"), 2, "read twice, then decided");
  const twice = rules({ files: [["src/a.ts", 300, 0], ["src/a.ts", 300, 0], ["src/b.ts", 1, 0]], changed: 2, additions: 301, deletions: 0 });
  assert.equal(twice.status, 0, twice.stderr);
  assert.match(twice.stdout, /301 changed lines/);
});

test("#225 round 2, nice item 3: the files' changes must add up to the pull request's own additions and deletions, else exit 2", unixOnly, () => {
  const r = rules({ files: [["src/a.ts", 10, 5]], additions: 900, deletions: 5 });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /#9's files add up to 15 changed lines, but #9 says 905, so the size can't be counted\. That's never a pass/);
  assert.equal(r.stdout, "");
  const none = rules({ additions: null });
  assert.equal(none.status, 2, "no line count is never a pass");
  assert.match(none.stderr, /GitHub gave no file or line count for #9/);
});

test("#225 round 3, nice item 1: pr-rules.mjs starts every git with GIT_ATTR_NOSYSTEM=1, so the system attributes file never counts", unixOnly, () => {
  const r = rules({ files: HUGE, attributes: "plugin/** linguist-generated\n", logGit: true, env: { GIT_ATTR_NOSYSTEM: "0" } });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /5000 changed lines \(over 400/);
  const calls = r.gitCalls();
  assert.ok(calls.some((c) => c.argv.includes("check-attr")), "the fake git saw check-attr");
  for (const call of calls) assert.equal(call.attrNosystem, "1", call.argv.join(" "));
});

test("#225 round 3, nice item 2: where git init sets core.ignorecase=true, plugin/** still marks only plugin/, as GitHub matches", unixOnly, () => {
  const files = [["PLUGIN/huge.ts", 5000, 0], ["Plugin/x.ts", 500, 0], ["plugin/a.md", 900, 0]];
  const r = rules({ files, attributes: "plugin/** linguist-generated\n", ignorecase: true });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /5500 changed lines \(over 400/);
  assert.ok(r.gitCalls().some((c) => c.argv.includes("init")), "the fake git made the scratch repo");
});

/** Step 6.1.2's git commands as written, from the clone on: `<dir>` and `<sha>` filled in, split into arguments. */
const cloneCommands = (dir, sha) =>
  [...subStep(2).matchAll(/`(git [^`]+)`/g)].map((m) => m[1]).filter((c) => !c.includes("pull/<n>/head"))
    .map((c) => c.replaceAll("<dir>", dir).replaceAll("<sha>", sha).split(" ").slice(1));

test("#225 round 3, nice item 3: step 6.1.2 removes the clone's origin right after the checkout, before any head command runs", () => {
  const step = subStep(2);
  const at = (text) => (assert.ok(step.includes(text), text), step.indexOf(text));
  assert.ok(at("`git -C <dir> checkout --detach <sha>`") < at("`git -C <dir> remote remove origin`"));
  assert.ok(at("`git -C <dir> remote remove origin`") < at("`git -C <dir> rev-parse HEAD` must print `<sha>`"));
  assert.ok(subStep(3).indexOf("run the install") > -1, "the head's commands start in 6.1.3");
});

test("#225 round 3, nice item 3: after step 6.1.2's commands, the head's clone names no remote and can't push into your checkout", unixOnly, () => {
  const main = checkout();
  const sha = git(main, "rev-parse", "HEAD").trim();
  const dir = join(tmp("onrails-head-"), "clone");
  for (const args of cloneCommands(dir, sha)) git(main, ...args);
  assert.equal(git(dir, "rev-parse", "HEAD").trim(), sha);
  assert.equal(git(dir, "remote").trim(), "", "the clone has no remote");
  assert.doesNotMatch(git(dir, "config", "--list"), new RegExp(main.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "its config doesn't name your checkout");
  const push = spawnSync("git", ["-C", dir, "push", "origin", "HEAD:refs/heads/planted"], { encoding: "utf8", env: safeEnv({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }) });
  assert.notEqual(push.status, 0, push.stderr);
  assert.equal(git(main, "for-each-ref", "refs/heads/planted").trim(), "", "nothing reached your checkout");
});

test("#225 round 3, nice item 4: once step 6.1.3 starts, no git command runs in <dir>; 6.1.6's rm -rf is all that touches it", () => {
  assert.match(subStep(3), /\*\*Run no git command in `<dir>` from here on,\*\* not even a `status`: the head's commands can set hooks or `core\.fsmonitor` in its clone, and a git command there would start them with your environment and your logins\. Read what you need from the commands' output and from your checkout of main\. After 6\.1\.3 starts, the only command that touches `<dir>` is 6\.1\.6's `rm -rf`\./);
  const after = [3, 4, 5, 6].map(subStep).join("\n");
  assert.doesNotMatch(after, /git -C <dir>|cd <dir>|--git-dir|--work-tree/);
  const commands = [...after.matchAll(/`([^`]*<dir>[^`]*)`/g)].map((m) => m[1]).filter((c) => c !== "<dir>");
  assert.deepEqual(commands, ["rm -rf <dir> <home>"]);
});

test("#225 round 3, nice item 5: the head's commands start from an allow-list, so SSH_AUTH_SOCK, the keyring and every key are gone", unixOnly, () => {
  const [, command] = /`(env -[iu] [^`]*<command>)`/.exec(subStep(3)) ?? [];
  assert.ok(command, "6.1.3 names the command line");
  const home = tmp("onrails-home-");
  const secrets = {
    SSH_AUTH_SOCK: "/fake/agent.sock", DBUS_SESSION_BUS_ADDRESS: "unix:path=/fake/bus", GH_TOKEN: "fake", GITHUB_TOKEN: "fake",
    CLOUDFLARE_API_TOKEN: "fake", AWS_SECRET_ACCESS_KEY: "fake", OPENAI_API_KEY: "fake", NPM_CONFIG__AUTH: "fake", GIT_ASKPASS: "/fake/askpass",
  };
  const r = spawnSync("sh", ["-c", command.replaceAll("<home>", home).replace("<command>", "env")], { encoding: "utf8", env: safeEnv({ ...secrets, LANG: "C.UTF-8", TERM: "dumb" }) });
  assert.equal(r.status, 0, r.stderr);
  const got = Object.fromEntries(r.stdout.trim().split("\n").map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  assert.deepEqual(Object.keys(got).sort(), ["CI", "GH_CONFIG_DIR", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "HOME", "LANG", "PATH", "TERM", "XDG_CONFIG_HOME", "XDG_DATA_HOME"]);
  assert.equal(got.HOME, home);
  assert.equal(got.CI, "1");
  assert.match(subStep(3), /To skip a fresh download, add `XDG_CACHE_HOME`, `npm_config_store_dir` and `PLAYWRIGHT_BROWSERS_PATH` before `<command>`, set to the ones you use: caches hold no logins\./);
  assert.match(subStep(3), /Behind a proxy, add `HTTPS_PROXY`, `NO_PROXY` and `NODE_EXTRA_CA_CERTS` the same way, but only when the proxy's address holds no password\./);
});
