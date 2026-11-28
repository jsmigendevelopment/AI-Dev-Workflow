// Every doctor check, as data: { status, label, fix, required, remedy }.
// fix is the one-line hint; remedy is what doctor --fix offers:
//   { run: [argv...], cwd, print: [lines], action: { describe, run() } }
import { accountChecks } from "./accounts.mjs";
import { globalSkillChecks } from "./global.mjs";
import { homeChecks } from "./home.mjs";
import { agentInstallLines, installPlan, pnpmPlan } from "./installers.mjs";
import { loadKit } from "./kit.mjs";
import { pluginChecks } from "./plugin.mjs";
import { readGoMod, satisfies } from "./preflight-versions.mjs";
import { projectChecks } from "./project-checks.mjs";
import { readProjectManifest } from "./sync.mjs";
import { FAIL, INFO, OK } from "./marks.mjs";
import { realSystem } from "./system.mjs";

export function runChecks(projectDir, { kitDir, sys = realSystem({ projectDir }) } = {}) {
  const checks = [];
  const add = (status, label, fix, required = true, remedy) => checks.push({ status, label, fix, required, remedy });

  const major = Number(process.versions.node.split(".")[0]);
  add(major >= 22 ? OK : FAIL, `Node ${process.versions.node}`, "Install Node 22 or newer from https://nodejs.org", true,
    { print: ["Install Node 22 or newer from https://nodejs.org"] });

  // A "not found" label, plus where each tool was found and not run, as update --all says it (#185), so nobody
  // installs a second copy. A test's fake system has no where.
  const notFound = (label, ...names) => {
    const whys = names.map((name) => sys.where?.(name)).filter((w) => w?.found).map((w) => w.why);
    return whys.length ? `${label} (${whys.join("; ")})` : label;
  };

  const git = sys.probe("git", ["--version"]);
  add(git?.ok ? OK : FAIL, git?.ok ? git.out : notFound("git not found", "git"), "Install git from https://git-scm.com", true, installPlan("git", sys));

  const gh = sys.probe("gh", ["--version"]);
  add(gh?.ok ? OK : FAIL, gh?.ok ? gh.out : notFound("GitHub CLI (gh) not found", "gh"), "Install it from https://cli.github.com", false, installPlan("gh", sys));
  if (gh?.ok) {
    const auth = sys.probe("gh", ["auth", "status"]);
    add(auth?.ok ? OK : FAIL, auth?.ok ? "gh is signed in" : "gh is not signed in", "Run: gh auth login", false,
      { print: ["gh auth login"] });
  } else add(INFO, "gh sign-in not checked (gh not installed)");

  const pnpm = sys.probe("pnpm", ["--version"]);
  add(pnpm?.ok ? OK : FAIL, pnpm?.ok ? `pnpm ${pnpm.out}` : notFound("pnpm not found", "pnpm"),
    "Run: corepack enable && corepack prepare pnpm@latest --activate", false, pnpmPlan(sys));

  const goMod = readGoMod(projectDir);
  if (goMod) add(...goCheck(goMod, sys, notFound));

  const claude = sys.probe("claude", ["--version"]);
  const codex = sys.probe("codex", ["--version"]);
  if (claude?.ok || codex?.ok) {
    add(claude?.ok ? OK : INFO, claude?.ok ? `Claude Code ${claude.out}` : "Claude Code not installed (optional, you have Codex)");
    add(codex?.ok ? OK : INFO, codex?.ok ? `Codex ${codex.out}` : "Codex not installed (optional, you have Claude Code)");
  } else {
    add(FAIL, notFound("Neither Claude Code nor Codex found", "claude", "codex"), "Install one: npm i -g @anthropic-ai/claude-code, or npm i -g @openai/codex",
      true, { print: agentInstallLines(sys.platform) });
  }

  checks.push(...homeChecks({ home: sys.home }));
  checks.push(...globalSkillChecks({ kitDir, home: sys.home }));
  checks.push(...pluginChecks({ home: sys.home, env: sys.env, kitVersion: kitVersionFor(projectDir, kitDir) }));
  checks.push(...projectChecks(projectDir, { kitDir, sys }));
  checks.push(...accountChecks(projectDir, { home: sys.home }));
  return checks;
}

// The project's kit version, else this CLI's, else none.
function kitVersionFor(projectDir, kitDir) {
  const manifest = readProjectManifest(projectDir);
  if (manifest) return manifest.kitVersion;
  try { return loadKit(kitDir).version; } catch { return null; } // a missing bundle is reported by projectChecks
}

// A Go project (#538): go is found, and new enough for go.mod's go line. It runs from the home folder, so no go.work or
// toolchain line of the project's is read, and a go that is only in the project's node_modules/.bin never runs (#185).
// GOTOOLCHAIN=local keeps go from fetching a toolchain to answer (#566). Not required: the kit's own checks don't need Go.
function goCheck(goMod, sys, notFound) {
  const install = `Install Go ${goMod.want ? `${goMod.want} or newer ` : ""}from https://go.dev/dl/`;
  const remedy = { print: [install] };
  const have = sys.probe("go", ["version"], { cwd: sys.home, env: { GOTOOLCHAIN: "local" } });
  if (!have) return [FAIL, notFound("go not found", "go"), install, false, remedy];
  const version = have.ok ? /\bgo(\d+\.\d+(?:\.\d+)?)/.exec(have.out)?.[1] : null;
  if (!version) return [FAIL, "go found, but `go version` printed no version", "Run: go version, and fix what it says", false];
  if (!goMod.want) return [OK, `Go ${version} (go.mod has no go line)`];
  if (!satisfies(version, `>=${goMod.want}`)) return [FAIL, `Go ${version} found, go.mod needs ${goMod.want}`, install, false, remedy];
  return [OK, `Go ${version} (go.mod needs ${goMod.want})`];
}
