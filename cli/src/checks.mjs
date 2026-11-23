// Every doctor check, as data: { status, label, fix, required, remedy }.
// fix is the one-line hint; remedy is what doctor --fix offers:
//   { run: [argv...], cwd, print: [lines], action: { describe, run() } }
import { globalSkillChecks } from "./global.mjs";
import { agentInstallLines, installPlan, pnpmPlan } from "./installers.mjs";
import { projectChecks } from "./project-checks.mjs";
import { FAIL, INFO, OK } from "./marks.mjs";
import { realSystem } from "./system.mjs";

export function runChecks(projectDir, { kitDir, sys = realSystem() } = {}) {
  const checks = [];
  const add = (status, label, fix, required = true, remedy) => checks.push({ status, label, fix, required, remedy });

  const major = Number(process.versions.node.split(".")[0]);
  add(major >= 22 ? OK : FAIL, `Node ${process.versions.node}`, "Install Node 22 or newer from https://nodejs.org", true,
    { print: ["Install Node 22 or newer from https://nodejs.org"] });

  const git = sys.probe("git", ["--version"]);
  add(git?.ok ? OK : FAIL, git?.ok ? git.out : "git not found", "Install git from https://git-scm.com", true, installPlan("git", sys));

  const gh = sys.probe("gh", ["--version"]);
  add(gh?.ok ? OK : FAIL, gh?.ok ? gh.out : "GitHub CLI (gh) not found", "Install it from https://cli.github.com", false, installPlan("gh", sys));
  if (gh?.ok) {
    const auth = sys.probe("gh", ["auth", "status"]);
    add(auth?.ok ? OK : FAIL, auth?.ok ? "gh is signed in" : "gh is not signed in", "Run: gh auth login", false,
      { print: ["gh auth login"] });
  } else add(INFO, "gh sign-in not checked (gh not installed)");

  const pnpm = sys.probe("pnpm", ["--version"]);
  add(pnpm?.ok ? OK : FAIL, pnpm?.ok ? `pnpm ${pnpm.out}` : "pnpm not found",
    "Run: corepack enable && corepack prepare pnpm@latest --activate", false, pnpmPlan(sys));

  const claude = sys.probe("claude", ["--version"]);
  const codex = sys.probe("codex", ["--version"]);
  if (claude?.ok || codex?.ok) {
    add(claude?.ok ? OK : INFO, claude?.ok ? `Claude Code ${claude.out}` : "Claude Code not installed (optional, you have Codex)");
    add(codex?.ok ? OK : INFO, codex?.ok ? `Codex ${codex.out}` : "Codex not installed (optional, you have Claude Code)");
  } else {
    add(FAIL, "Neither Claude Code nor Codex found", "Install one: npm i -g @anthropic-ai/claude-code, or npm i -g @openai/codex",
      true, { print: agentInstallLines(sys.platform) });
  }

  checks.push(...globalSkillChecks({ kitDir, home: sys.home }));
  checks.push(...projectChecks(projectDir, { kitDir, sys }));
  return checks;
}
