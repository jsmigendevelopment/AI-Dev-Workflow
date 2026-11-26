// update [dir] --all [--dry-run] [--yes]: bring this machine and project to the onRails in this CLI (#178).
// In order: the Claude Code and Codex plugins (only where the tool and its plugin are both there), the global
// entry skills (only when init --global was used), the project's kit (only inside an onRails project),
// then doctor and a summary of each part before and after. It only consumes a release: no bump, tag or publish.
import { delimiter, isAbsolute, resolve } from "node:path";
import { doctor } from "./doctor.mjs";
import { globalSkillChecks, initGlobal } from "./global.mjs";
import { PROJECT_MANIFEST, loadKit } from "./kit.mjs";
import { pluginVersions } from "./plugin.mjs";
import { readProjectManifest } from "./sync.mjs";
import { findCommand, realSystem, showCommand } from "./system.mjs";
import { update } from "./update.mjs";

// The tool's full path on PATH. Relative entries are skipped, so a project's own `claude` never runs.
function toolPath(name, sys) {
  const PATH = (sys.env.PATH || sys.env.Path || "").split(delimiter).filter((d) => d && isAbsolute(d)).join(delimiter);
  return findCommand(name, { env: { PATH, PATHEXT: sys.env.PATHEXT }, platform: sys.platform });
}

// Step 1. Each command runs with no shell, by full path, and a failed one ends that tool's steps.
function plugins(sys, dryRun, log) {
  log("1. Plugins");
  const rows = [];
  for (const p of pluginVersions({ home: sys.home, env: sys.env })) {
    const name = `${p.label} plugin ${p.id}`;
    if (!p.version) {
      log(`   ${p.label} plugin: not installed, skipped`);
      continue;
    }
    const path = toolPath(p.tool, sys);
    if (!path) {
      log(`   ${name} v${p.version}: skipped, ${p.tool} isn't on your PATH`);
      rows.push({ tool: p.tool, part: name, before: `v${p.version}`, note: `skipped: ${p.tool} isn't on your PATH` });
      continue;
    }
    log(`   ${name} v${p.version}: ${dryRun ? "would run" : "running"}`);
    let failed = null;
    for (const argv of p.commands.map((c) => [path, ...c])) {
      log(`     ${showCommand(argv)}`);
      if (!dryRun && !sys.exec(argv)) {
        failed = showCommand(argv);
        break;
      }
    }
    const after = pluginVersions({ home: sys.home, env: sys.env }).find((q) => q.tool === p.tool).version;
    rows.push({ tool: p.tool, ran: true, part: name, before: `v${p.version}`, after: `v${after}`, failed, note: failed && `FAILED: ${failed}` });
  }
  return rows;
}

// Step 2, the init --global way: files you changed are kept, and the kit's copy goes next to them.
function globalSkills({ kitDir, sys, dryRun, version, log }) {
  const before = globalSkillChecks({ kitDir, home: sys.home });
  if (!before.length) {
    log("2. Global entry skills: skipped, init --global was never run here");
    return [];
  }
  if (dryRun) {
    log(`2. Global entry skills: would refresh ~/.claude/skills and ~/.agents/skills to kit v${version}, as init --global does`);
    return [];
  }
  log("2. Global entry skills");
  initGlobal({ kitDir, home: sys.home, log, tip: false });
  const after = globalSkillChecks({ kitDir, home: sys.home });
  const stale = (checks) => [...new Set(checks.flatMap((c) => c.stale))];
  const was = stale(before), now = stale(after);
  return [{
    part: "Global entry skills",
    before: was.length ? `${was.join(", ")} differed from kit v${version}` : `matched kit v${version}`,
    after: now.length ? `${now.join(", ")} still differs (yours kept)` : `match kit v${version}`,
    keptIn: after.filter((c) => c.stale.length).map((c) => c.label.split(":")[0]),
  }];
}

// Step 3: the project's kit, as plain update does it.
async function projectKit(projectDir, { kitDir, dryRun, ask, yes, log }) {
  const old = readProjectManifest(projectDir);
  if (!old) {
    log(`3. Project kit: skipped, this folder isn't an onRails project (no ${PROJECT_MANIFEST})`);
    return [];
  }
  log("3. Project kit");
  const code = await update(projectDir, { dryRun, kitDir, ask, yes, log });
  const now = readProjectManifest(projectDir);
  return [{ part: "Project kit", before: `v${old.kitVersion}`, after: `v${now?.kitVersion}`, failed: code !== 0, note: code !== 0 && "FAILED: see above" }];
}

function summary(rows, log) {
  log("\nSummary");
  for (const r of rows) log(`  ${r.part}: ${r.before}${r.after ? ` -> ${r.after}` : ""}${r.note ? ` (${r.note})` : ""}`);
  const left = [];
  for (const dir of rows.flatMap((r) => r.keptIn ?? [])) left.push(`Compare each .onrails-new in ${dir} with yours, keep what you want, then delete it.`);
  if (rows.some((r) => r.part === "Project kit" && r.before !== r.after)) left.push("Commit the project's kit changes on a branch and open a pull request.");
  if (rows.some((r) => r.tool === "claude" && r.ran)) left.push("Claude Code: run `/reload-plugins` in each open session, or start a new one. A running session can't reload itself.");
  if (rows.some((r) => r.tool === "codex" && r.ran)) left.push("Codex: start a new session to load the new plugin.");
  if (left.length) log(`Left for you:\n${left.map((l) => `  - ${l}`).join("\n")}`);
}

/** Runs all four parts; exit 1 when a plugin command or the project update failed. */
export async function updateAll(dir = ".", { dryRun = false, kitDir, ask, yes = false, sys = realSystem(), log = console.log } = {}) {
  const projectDir = resolve(dir);
  const { version } = loadKit(kitDir);
  log(dryRun ? `Plan for kit v${version} (dry run: nothing runs, nothing is written)` : `Bringing onRails to kit v${version}, the one in this CLI`);
  const rows = [
    ...plugins(sys, dryRun, log),
    ...globalSkills({ kitDir, sys, dryRun, version, log }),
    ...(await projectKit(projectDir, { kitDir, dryRun, ask, yes, log })),
  ];
  if (dryRun) {
    log("4. doctor: would run after the updates");
    log("\nNothing ran. To do it: npx onrails@latest update --all");
    return 0;
  }
  log("4. doctor");
  doctor(projectDir, { kitDir, sys, log });
  summary(rows, log);
  return rows.some((r) => r.failed) ? 1 : 0;
}
