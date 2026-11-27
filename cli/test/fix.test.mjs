import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { doctorFix } from "../src/fix.mjs";
import { init } from "../src/init.mjs";
import { exists, fakeAsk, fakeSystem, logger, put, read, tmp } from "./helpers.mjs";

async function dryRun(sys, dir = tmp()) {
  const log = logger();
  await doctorFix(dir, { sys, dryRun: true, log, ask: fakeAsk() });
  assert.deepEqual(sys.ran, [], "a dry run runs nothing");
  return log.text();
}

test("Linux with apt plans sudo apt-get installs, corepack for pnpm, and prints the agent installers", async () => {
  const out = await dryRun(fakeSystem({ commands: ["apt-get", "corepack"] }));
  assert.match(out, /Fix plan \(dry run/);
  assert.match(out, /run: sudo apt-get update/);
  assert.match(out, /run: sudo apt-get install -y git\n/);
  assert.match(out, /run: sudo apt-get install -y gh\n/);
  assert.match(out, /run: corepack enable\n/);
  assert.match(out, /run: corepack prepare pnpm@latest --activate/);
  assert.doesNotMatch(out, /npm install -g corepack/);
  assert.match(out, /you do this yourself: Claude Code: curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/);
  assert.match(out, /you do this yourself: Codex: npm install -g @openai\/codex/);
  assert.match(out, /you do this yourself: npx onrails init/);
});

test("Linux as root with dnf drops sudo; pacman uses github-cli; no manager prints the link", async () => {
  const dnf = await dryRun(fakeSystem({ commands: ["dnf"], isRoot: true }));
  assert.match(dnf, /run: dnf install -y git\n/);
  assert.doesNotMatch(dnf, /sudo/);
  assert.match(dnf, /run: npm install -g corepack/, "corepack fetched first when Node has none");

  const pacman = await dryRun(fakeSystem({ commands: ["pacman"] }));
  assert.match(pacman, /run: sudo pacman -S --needed --noconfirm github-cli/);

  const none = await dryRun(fakeSystem());
  assert.match(none, /you do this yourself: No apt, dnf or pacman found, or install git from https:\/\/git-scm\.com/);
});

test("Windows uses winget and prints the PowerShell Claude Code installer", async () => {
  const out = await dryRun(fakeSystem({ platform: "win32", commands: ["winget", "corepack"] }));
  assert.match(out, /run: winget install --id Git\.Git -e --source winget/);
  assert.match(out, /run: winget install --id GitHub\.cli -e/);
  assert.match(out, /irm https:\/\/claude\.ai\/install\.ps1 \| iex/);
  assert.doesNotMatch(out, /sudo|apt-get|brew/);
});

test("macOS uses Homebrew when present, and points to brew.sh when not", async () => {
  const brew = await dryRun(fakeSystem({ platform: "darwin", commands: ["brew", "corepack"] }));
  assert.match(brew, /run: brew install git\n/);
  assert.match(brew, /run: brew install gh\n/);
  assert.doesNotMatch(brew, /sudo/);

  const noBrew = await dryRun(fakeSystem({ platform: "darwin" }));
  assert.match(noBrew, /Homebrew not found: install it from https:\/\/brew\.sh, or install gh from https:\/\/cli\.github\.com/);
  assert.doesNotMatch(noBrew, /run: brew/);
});

test("sign-ins are only printed, never run, even with --yes", async () => {
  const sys = fakeSystem({ commands: ["git", "gh", "pnpm", "claude"], probes: { "gh auth status": { ok: false, out: "", all: "" } } });
  const log = logger();
  await doctorFix(tmp(), { sys, yes: true, log });
  assert.match(log.text(), /you do this yourself: gh auth login/);
  assert.doesNotMatch(log.text(), /run: gh auth/);
  assert.deepEqual(sys.ran, []);
});

test("interactive: runs a fix only after y, skips on anything else", async () => {
  const sys = fakeSystem({ commands: ["apt-get", "corepack", "claude"] });
  const ask = fakeAsk(["y", "n", ""]);
  const log = logger();
  await doctorFix(tmp(), { sys, ask, log });
  assert.equal(ask.questions.length, 3, "git, gh and pnpm each asked once");
  assert.deepEqual(sys.ran, ["sudo apt-get update", "sudo apt-get install -y git"]);
  assert.equal((log.text().match(/skipped/g) ?? []).length, 2);
});

test("--yes runs every runnable fix and re-copies .claude/skills from .agents/skills", async () => {
  const dir = tmp();
  init(dir, { log: logger(), home: tmp() });
  put(dir, ".claude/skills/idea/SKILL.md", "drifted\n");
  put(dir, ".claude/skills/stray/SKILL.md", "extra\n");
  const sys = fakeSystem({ commands: ["brew", "corepack", "codex"], platform: "darwin" });
  const log = logger();
  await doctorFix(dir, { sys, yes: true, log });
  assert.deepEqual(sys.ran, ["brew install git", "brew install gh", "corepack enable", "corepack prepare pnpm@latest --activate"]);
  assert.equal(read(dir, ".claude/skills/idea/SKILL.md"), read(dir, ".agents/skills/idea/SKILL.md"));
  assert.ok(!exists(dir, ".claude/skills/stray/SKILL.md"));
});

test("Playwright Chromium: planned when missing, quiet when the browser is cached", async () => {
  const dir = tmp();
  put(dir, "package.json", JSON.stringify({ devDependencies: { "@playwright/test": "1.50.0" } }));
  const home = tmp();
  const missing = await dryRun(fakeSystem({ home, commands: ["git", "pnpm"] }), dir);
  assert.match(missing, /✗ Playwright Chromium not installed/);
  assert.match(missing, /run: pnpm install   \(in the project folder\)/);
  assert.match(missing, /run: pnpm exec playwright install chromium   \(in the project folder\)/);

  put(join(home, ".cache", "ms-playwright"), "chromium-1155/INSTALLATION_COMPLETE", "");
  const found = await dryRun(fakeSystem({ home, commands: ["git", "pnpm"] }), dir);
  assert.match(found, /✓ Playwright Chromium installed/);
});

test("wrangler: suggests a dev dependency, then prints wrangler login when signed out", async () => {
  const dir = tmp();
  put(dir, "wrangler.jsonc", "{}");
  put(dir, "package.json", JSON.stringify({ devDependencies: {} }));
  const noDep = await dryRun(fakeSystem({ commands: ["git"] }), dir);
  assert.match(noDep, /you do this yourself: pnpm add -D wrangler/);
  assert.doesNotMatch(noDep, /-g wrangler|run: pnpm add/);

  put(dir, "package.json", JSON.stringify({ devDependencies: { wrangler: "4.0.0" } }));
  // doctor asks wrangler by name, so the system's PATH search finds one outside the project (#185).
  const signedOut = { ok: true, out: "", all: "You are not authenticated. Please run `wrangler login`." };
  const sys = fakeSystem({ commands: ["git"], probes: { "wrangler whoami": signedOut } });
  const out = await dryRun(sys, dir);
  assert.match(out, /✗ wrangler is not signed in/);
  assert.match(out, /you do this yourself: pnpm exec wrangler login/);

  const ok = fakeSystem({ commands: ["git"], probes: { "wrangler whoami": { ok: true, out: "", all: "You are logged in" } } });
  assert.match(await dryRun(ok, dir), /✓ wrangler is signed in/);
});
