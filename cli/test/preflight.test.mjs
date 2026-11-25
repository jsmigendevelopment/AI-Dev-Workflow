// Tests for preflight (#100): one table from probes of the agent's own session, a fix ladder
// for every failure, one batched message for the person, and a record that lets /back skip
// the slow probes. The probes run against a fake system, so nothing here needs a network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, detectTool, fingerprint, main, probe, readRecord, render, satisfies, withRecord } from "../src/preflight.mjs";
import { logger, put, tmp } from "./helpers.mjs";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const SCRIPT = fileURLToPath(new URL("../../.agents/skills/ask/scripts/preflight.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const NOW = Date.parse("2026-11-25T22:10:00Z");

// A fake session. `answers` maps the start of a command line to { ok, out }; anything else
// answers ok with no output. `missing` commands aren't installed. Every call is recorded.
function fakeSys({ env = {}, answers = {}, missing = [], loopback = { ok: true, detail: "127.0.0.1:40001" }, node = "22.23.5", hostname = "box-1" } = {}) {
  const calls = [];
  return {
    env, node, hostname, platform: "linux", now: () => NOW, calls,
    loopback: async () => loopback,
    run(cmd, args = []) {
      const line = [cmd, ...args].join(" ");
      calls.push(line);
      if (missing.includes(cmd)) return null;
      const key = Object.keys(answers).filter((k) => line.startsWith(k)).sort((a, b) => b.length - a.length)[0];
      return key ? { ok: answers[key].ok, out: answers[key].out ?? "" } : { ok: true, out: "" };
    },
  };
}

// A healthy repo: git works, the registry answers, GitHub answers, pnpm is there.
const HEALTHY = {
  "git rev-parse --show-toplevel": { ok: true, out: "/repo" },
  "git rev-parse --verify HEAD": { ok: true, out: "abc" },
  "npm config get registry": { ok: true, out: "https://registry.npmjs.org/" },
  "npm view": { ok: true, out: "12.0.0" },
  "git remote get-url origin": { ok: true, out: "https://github.com/acme/app.git" },
  "git ls-remote": { ok: true, out: "abc\trefs/heads/main" },
  "gh api rate_limit": { ok: true, out: "{}" },
  "pnpm --version": { ok: true, out: "10.28.0" },
};
const BLOCKED = {
  ...HEALTHY,
  "git branch": { ok: false, out: "fatal: cannot lock ref: Read-only file system" },
  "git config": { ok: false, out: "error: could not lock config file .git/config: Read-only file system" },
  "npm view": { ok: false, out: "npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/npm failed" },
};

function project(files = {}) {
  const dir = tmp("onrails-preflight-");
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  return dir;
}
const status = (report, id) => report.results.find((r) => r.id === id).status;

test("AC-100-1: preflight prints one table with a row for every check, and exits 0 when all pass", async () => {
  const dir = project({ "package.json": JSON.stringify({ engines: { node: ">=22" }, packageManager: "pnpm@10.28.0" }) });
  const log = logger();
  const code = await main([dir], { sys: fakeSys({ answers: HEALTHY, env: { CLAUDECODE: "1" } }), log });
  assert.equal(code, 0, log.text());
  const text = log.text();
  assert.equal(text.match(/^\| Check \| Result \| Detail \|$/gm).length, 1, "exactly one table");
  for (const label of ["Write the repo", "Write .git", "Package registry", "GitHub", "Loopback", "A browser", "Node and package manager", "Model and effort"]) {
    assert.match(text, new RegExp(`^\\| ${label.replace(".", "\\.")} \\|`, "m"), label);
  }
  assert.equal(CHECKS.length, 8);
  assert.doesNotMatch(text, /Setup step for you/);
});

test("AC-100-1: /idea, /join, /back and build each run preflight as a first step", () => {
  for (const skill of ["idea", "join", "back", "build"]) {
    const text = read(`.agents/skills/${skill}/SKILL.md`);
    assert.match(text, /\.agents\/skills\/ask\/scripts\/preflight\.mjs/, `${skill} names the preflight script`);
    assert.match(text, /references\/preflight\.md/, `${skill} points to the ladder`);
  }
  assert.match(read(".agents/skills/ask/SKILL.md"), /\| `references\/preflight\.md` \|/);
});

test("AC-100-2: a blocked registry, .git and loopback give one table, every fix for the tool, and ONE message", async () => {
  const dir = project({ "package.json": "{}" });
  const sys = fakeSys({ answers: BLOCKED, loopback: { ok: false, detail: "listen EPERM 127.0.0.1" }, env: { CODEX_SANDBOX: "seatbelt" } });
  const log = logger();
  const code = await main([dir], { sys, log });
  assert.equal(code, 1);
  const text = log.text();
  for (const label of ["Write \\.git", "Package registry", "Loopback"]) assert.match(text, new RegExp(`^\\| ${label} \\| ✗ \\|`, "m"), label);
  // The Codex fix from the issue, word for word where it matters.
  assert.match(text, /Trust this project so `\.codex\/config\.toml` loads \(it sets `network_access = true`\), then restart Codex/);
  // One batched message, with a numbered fix for each of the three.
  assert.equal(text.match(/^Setup step for you · /gm).length, 1, "one message, never one per problem");
  const message = text.slice(text.indexOf("Setup step for you · "));
  assert.equal(message.match(/^\d+\. /gm).length, 3, "one numbered fix per blocked check");
  assert.match(message, /^When it worked: /m);
});

test("AC-100-2: installs blocked means no scaffolding: the output says so, and so does the reference", async () => {
  const log = logger();
  await main([project()], { sys: fakeSys({ answers: BLOCKED }), log });
  assert.match(log.text(), /Installs are blocked: don't scaffold or build/);
  assert.match(read(".agents/skills/ask/references/preflight.md"), /Never scaffold/);
});

test("AC-100-3: a yes to the strongest tier covers the session, and no skill tells the person to restart for a model", () => {
  const routing = read(".agents/skills/routing/SKILL.md");
  assert.match(routing, /once per session/i);
  assert.match(routing, /\*\*Strongest tier:\*\*/, "the yes is written to docs/state.md");
  assert.match(routing, /Never tell the person to start a new session/);
  assert.doesNotMatch(read(".agents/skills/idea/SKILL.md"), /Start a new session on your strongest model/);
  assert.match(read(".agents/skills/idea/templates/state.md"), /\*\*Strongest tier:\*\*/);
  assert.match(read(".agents/skills/idea/SKILL.md"), /ask_before_strongest/);
});

test("AC-100-4: after a passing --record, --if-changed skips every probe; a changed sandbox runs them again", async () => {
  const dir = project({ "package.json": "{}", "docs/state.md": "# State\n\n- **Updated:** today\n" });
  const first = fakeSys({ answers: HEALTHY });
  assert.equal(await main([dir, "--record"], { sys: first, log: logger() }), 0);
  const state = readFileSync(join(dir, "docs/state.md"), "utf8");
  assert.match(state, /^- \*\*Environment:\*\* ok · checked 2026-11-25T22:10Z · /m);
  assert.match(state, /\*\*Updated:\*\* today/, "the rest of the file is kept");

  const same = fakeSys({ answers: HEALTHY });
  const log = logger();
  assert.equal(await main([dir, "--if-changed"], { sys: same, log }), 0);
  assert.deepEqual(same.calls, [], "no probe ran");
  assert.match(log.text(), /nothing changed/i);
  assert.doesNotMatch(log.text(), /\| Check \|/);

  const moved = fakeSys({ answers: HEALTHY, hostname: "box-2" });
  assert.equal(await main([dir, "--if-changed"], { sys: moved, log: logger() }), 0);
  assert.ok(moved.calls.some((c) => c.startsWith("npm view")), "a new machine probes again");
});

test("AC-100-4: an open item on record is probed again, and the record names what's open", async () => {
  const dir = project({ "docs/state.md": "# State\n" });
  await main([dir, "--record"], { sys: fakeSys({ answers: BLOCKED }), log: logger() });
  const record = readRecord(readFileSync(join(dir, "docs/state.md"), "utf8"));
  assert.equal(record.ok, false);
  assert.deepEqual(record.open, ["git", "registry"]);
  const again = fakeSys({ answers: BLOCKED });
  assert.equal(await main([dir, "--if-changed"], { sys: again, log: logger() }), 1);
  assert.ok(again.calls.length > 0);
});

test("AC-100-4: with no docs/state.md, --record writes nothing and says so", async () => {
  const dir = project();
  const log = logger();
  await main([dir, "--record"], { sys: fakeSys({ answers: HEALTHY }), log });
  assert.throws(() => readFileSync(join(dir, "docs/state.md")));
  assert.match(log.text(), /No docs\/state\.md yet: not recorded/);
});

test("AC-100-6: every failure lists the ladder in order, workarounds before the person, and the message has a Tried line", async () => {
  const report = await probe(project({ "package.json": "{}" }), fakeSys({ answers: BLOCKED, loopback: { ok: false, detail: "EPERM" }, env: { CODEX_SANDBOX: "seatbelt" } }));
  for (const id of ["git", "registry", "loopback"]) {
    const r = report.results.find((x) => x.id === id);
    assert.equal(r.status, "blocked", id);
    assert.deepEqual(r.ladder.map((l) => l.rung), [1, 2, 3, 4], `${id} has all four rungs, in order`);
  }
  const registry = report.results.find((r) => r.id === "registry").ladder;
  assert.match(registry[0].text, /--prefer-offline/);
  assert.match(registry[0].text, /project-local/);
  assert.match(registry[1].text, /on-request/);
  const loopback = report.results.find((r) => r.id === "loopback").ladder[0].text;
  assert.match(loopback, /another port/);
  assert.match(loopback, /--webpack/);
  assert.match(loopback, /same process/);
  const text = render(report);
  assert.match(text, /^Tried: /m);
  assert.ok(text.indexOf("1. In the sandbox") < text.indexOf("4. The person, last"));
  assert.match(read(".agents/skills/ask/references/preflight.md"), /lists? what (you|it) tried/i);
});

test("no git repo yet is the agent's own fix, not a question for the person", async () => {
  const report = await probe(project(), fakeSys({ answers: { ...HEALTHY, "git rev-parse --show-toplevel": { ok: false, out: "fatal: not a git repository" } } }));
  const git = report.results.find((r) => r.id === "git");
  assert.equal(git.status, "fix");
  assert.match(git.ladder[0].text, /git init/);
  assert.doesNotMatch(render(report), /Setup step for you/);
  assert.equal(report.ok, false, "it still isn't a pass until the agent has fixed it");
});

test("GitHub missing is limited, not blocked: the loop has a local mode", async () => {
  const answers = { ...HEALTHY, "git remote get-url origin": { ok: false, out: "" }, "gh api rate_limit": { ok: false, out: "HTTP 401" } };
  const report = await probe(project(), fakeSys({ answers }));
  assert.equal(status(report, "github"), "limited");
  assert.match(report.results.find((r) => r.id === "github").detail, /local mode/);
  assert.equal(report.ok, true);
});

test("a browser is checked only when the project's tests need one", async () => {
  const none = await probe(project({ "package.json": "{}" }), fakeSys({ answers: HEALTHY }));
  assert.equal(status(none, "browser"), "skip");
  const dir = project({ "package.json": JSON.stringify({ devDependencies: { "@playwright/test": "1.60.0" } }) });
  mkdirSync(join(dir, "node_modules", "@playwright", "test"), { recursive: true });
  const broken = await probe(dir, fakeSys({ answers: { ...HEALTHY, "node -e": { ok: false, out: "browserType.launch: Executable doesn't exist" } } }));
  const browser = broken.results.find((r) => r.id === "browser");
  assert.equal(browser.status, "fix");
  assert.match(browser.ladder[0].text, /playwright install chromium/);
  const fine = await probe(dir, fakeSys({ answers: { ...HEALTHY, "node -e": { ok: true, out: "ok" } } }));
  assert.equal(status(fine, "browser"), "ok");
});

test("Node and the package manager are checked against the project's engines", async () => {
  const dir = project({ "package.json": JSON.stringify({ engines: { node: ">=24" }, packageManager: "pnpm@10.28.0" }) });
  const old = await probe(dir, fakeSys({ answers: HEALTHY, node: "22.23.5" }));
  assert.equal(status(old, "versions"), "blocked");
  assert.match(old.results.find((r) => r.id === "versions").detail, /Node 22\.23\.5, the project needs >=24/);
  const noPnpm = await probe(dir, fakeSys({ answers: HEALTHY, node: "24.1.0", missing: ["pnpm"] }));
  assert.equal(status(noPnpm, "versions"), "fix");
  assert.match(noPnpm.results.find((r) => r.id === "versions").ladder[0].text, /corepack/);
  assert.equal(satisfies("22.23.5", ">=22"), true);
  assert.equal(satisfies("22.23.5", ">=22.24.0"), false);
  assert.equal(satisfies("20.1.0", "^22"), false);
  assert.equal(satisfies("24.0.0", "22.x || 24.x"), true);
  assert.equal(satisfies("22.1.0", "something odd"), true, "an unreadable range never blocks");
});

test("model and effort: what the session can see, or what the agent passes in", async () => {
  const blind = await probe(project(), fakeSys({ answers: HEALTHY }));
  assert.match(blind.results.find((r) => r.id === "model").detail, /not visible to scripts/);
  const dir = project({ "docs/state.md": "# State\n" });
  await main([dir, "--record", "--model", "claude-fable-5-2", "--effort", "high"], { sys: fakeSys({ answers: HEALTHY }), log: logger() });
  assert.match(readFileSync(join(dir, "docs/state.md"), "utf8"), /model claude-fable-5-2 · effort high/);
  const seen = await probe(project(), fakeSys({ answers: HEALTHY, env: { ANTHROPIC_MODEL: "claude-opus-5-5", CLAUDE_EFFORT: "medium" } }));
  assert.match(seen.results.find((r) => r.id === "model").detail, /claude-opus-5-5.*medium/);
});

test("the tool is read from the session, and --tool overrides it", () => {
  assert.equal(detectTool({ CLAUDECODE: "1", CLAUDE_CODE_REMOTE: "true" }), "claude-cloud");
  assert.equal(detectTool({ CLAUDECODE: "1" }), "claude");
  assert.equal(detectTool({ CODEX_SANDBOX_NETWORK_DISABLED: "1" }), "codex");
  assert.equal(detectTool({}), "other");
});

test("the record line is replaced in place, and the fingerprint moves with the sandbox", () => {
  const a = fingerprint({ tool: "claude", node: "22.1.0", hostname: "a", registry: "https://registry.npmjs.org/", engines: "", env: {} });
  const b = fingerprint({ tool: "claude", node: "22.1.0", hostname: "b", registry: "https://registry.npmjs.org/", engines: "", env: {} });
  assert.notEqual(a, b);
  const once = withRecord("# State\n\n- **Updated:** x\n", "- **Environment:** ok · checked t · fp 1");
  const twice = withRecord(once, "- **Environment:** open: registry · checked t · fp 2");
  assert.equal(twice.match(/\*\*Environment:\*\*/g).length, 1);
  assert.match(twice, /open: registry/);
});

test("bad flags exit 2, and --json prints the report", async () => {
  const log = logger();
  assert.equal(await main(["--nope"], { sys: fakeSys(), log }), 2);
  const out = logger();
  await main([project(), "--json"], { sys: fakeSys({ answers: HEALTHY }), log: out });
  const report = JSON.parse(out.text());
  assert.equal(report.results.length, 8);
  assert.equal(report.ok, true);
});

test("the kit's copy and the CLI command run for real in a temp repo", () => {
  const dir = project({ "package.json": "{}" });
  spawnSync("git", ["init", "--quiet", dir]);
  // A dead registry on a closed local port: the probe fails fast and needs no network.
  writeFileSync(join(dir, ".npmrc"), "registry=http://127.0.0.1:9/\n");
  for (const argv of [[SCRIPT, dir, "--json"], [CLI, "preflight", dir, "--json"]]) {
    const r = spawnSync(process.execPath, argv, { encoding: "utf8", timeout: 60_000 });
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.results.find((x) => x.id === "registry").status, "blocked");
    assert.equal(report.results.find((x) => x.id === "repo").status, "ok");
    assert.equal(report.results.find((x) => x.id === "loopback").status, "ok");
  }
});
