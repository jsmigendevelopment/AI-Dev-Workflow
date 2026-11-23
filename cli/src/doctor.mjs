// doctor [dir]: check the tools and the kit, one line each, with a fix for each problem.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toNative, walk } from "./files.mjs";
import { loadKit } from "./kit.mjs";
import { readProjectManifest } from "./sync.mjs";

const OK = "✓", FAIL = "✗", INFO = "–";

function run(cmd, args) {
  // Windows installs these as .cmd shims, which only start through a shell. Args are fixed strings.
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000, shell: process.platform === "win32" });
  if (r.error || r.status === null) return null;
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split(/\r?\n/)[0] ?? "" };
}

function sameTree(a, b) {
  const fa = walk(a), fb = walk(b);
  if (fa.length !== fb.length || fa.some((f, i) => f !== fb[i])) return false;
  return fa.every((f) => readFileSync(toNative(a, f)).equals(readFileSync(toNative(b, f))));
}

export function doctor(dir = ".", { kitDir, log = console.log } = {}) {
  const projectDir = resolve(dir);
  const checks = [];
  const add = (status, label, fix, required = true) => checks.push({ status, label, fix, required });

  const major = Number(process.versions.node.split(".")[0]);
  add(major >= 22 ? OK : FAIL, `Node ${process.versions.node}`, "Install Node 22 or newer from https://nodejs.org");

  const git = run("git", ["--version"]);
  add(git?.ok ? OK : FAIL, git?.ok ? git.out : "git not found", "Install git from https://git-scm.com");

  const gh = run("gh", ["--version"]);
  add(gh?.ok ? OK : FAIL, gh?.ok ? gh.out : "GitHub CLI (gh) not found", "Install it from https://cli.github.com", false);
  if (gh?.ok) {
    const auth = run("gh", ["auth", "status"]);
    add(auth?.ok ? OK : FAIL, auth?.ok ? "gh is signed in" : "gh is not signed in", "Run: gh auth login", false);
  } else add(INFO, "gh sign-in not checked (gh not installed)");

  const claude = run("claude", ["--version"]);
  const codex = run("codex", ["--version"]);
  if (claude?.ok || codex?.ok) {
    add(claude?.ok ? OK : INFO, claude?.ok ? `Claude Code ${claude.out}` : "Claude Code not installed (optional, you have Codex)");
    add(codex?.ok ? OK : INFO, codex?.ok ? `Codex ${codex.out}` : "Codex not installed (optional, you have Claude Code)");
  } else {
    add(FAIL, "Neither Claude Code nor Codex found", "Install one: npm i -g @anthropic-ai/claude-code, or npm i -g @openai/codex");
  }

  const manifest = readProjectManifest(projectDir);
  let cliKit = null;
  try { cliKit = loadKit(kitDir).version; } catch { /* reported below */ }
  if (!manifest) add(FAIL, "Kit not installed here", "Run: npx ai-dev-workflow init");
  else if (cliKit && manifest.kitVersion !== cliKit) {
    add(FAIL, `Kit v${manifest.kitVersion} installed, this CLI has v${cliKit}`, "Run: npx ai-dev-workflow@latest update", false);
  } else add(OK, `Kit v${manifest.kitVersion} installed`);

  const hasAgents = existsSync(toNative(projectDir, "AGENTS.md"));
  add(hasAgents ? OK : FAIL, hasAgents ? "AGENTS.md present" : "AGENTS.md missing", "Run: npx ai-dev-workflow init");

  const a = toNative(projectDir, ".agents/skills"), c = toNative(projectDir, ".claude/skills");
  if (!existsSync(a) && !existsSync(c)) add(INFO, "No skills folders yet");
  else {
    const same = sameTree(a, c);
    add(same ? OK : FAIL, same ? ".agents/skills and .claude/skills match" : ".agents/skills and .claude/skills differ",
      "Copy .agents/skills over .claude/skills (the .agents copy is the master)", false);
  }

  const state = existsSync(toNative(projectDir, "docs/state.md"));
  add(state ? OK : INFO, state ? "docs/state.md present" : "No docs/state.md yet: type /idea for a new app or /join for an existing repo");

  for (const ch of checks) {
    log(`${ch.status} ${ch.label}`);
    if (ch.status === FAIL && ch.fix) log(`    fix: ${ch.fix}`);
  }
  const failed = checks.some((ch) => ch.status === FAIL && ch.required);
  log(failed ? "\nSome required checks failed." : "\nAll required checks passed.");
  return failed ? 1 : 0;
}
