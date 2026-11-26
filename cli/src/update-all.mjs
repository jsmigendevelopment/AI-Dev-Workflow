// update [dir] --all [--dry-run] [--yes]: bring this machine and project to the onRails in this CLI (#178).
// In order: the Claude Code and Codex plugins (only where the tool and its plugin are both there), the global
// entry skills (only when init --global was used), the project's kit (only inside an onRails project),
// then doctor and a summary of each part before and after. It only consumes a release: no bump, tag or publish.
import { realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { doctor } from "./doctor.mjs";
import { globalSkillChecks, initGlobal } from "./global.mjs";
import { PROJECT_MANIFEST, loadKit } from "./kit.mjs";
import { pluginVersions } from "./plugin.mjs";
import { readProjectManifest } from "./sync.mjs";
import { findCommand, realSystem, showCommand } from "./system.mjs";
import { update } from "./update.mjs";

// A folder's real path, or null when it doesn't exist (then it holds no tool).
function realDir(dir) {
  try {
    return realpathSync(dir);
  } catch {
    return null;
  }
}

// True when dir is root or inside it. Only a ".." path segment leaves root: a folder named "..x" is inside it.
const within = (dir, root) => {
  const rel = relative(root, dir);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

const BIN = /(^|[\\/])node_modules[\\/]\.bin[\\/]*$/i;

// The project and the current folder, by real path. The home folder, a folder that holds it, and a filesystem root
// are never one: a terminal opens in ~, and ~/.local/bin or an nvm folder there is where claude and codex live.
function projectRoots(projectDir, home) {
  const realHome = realDir(home) ?? resolve(home);
  return [[projectDir, "this project"], [process.cwd(), "the current folder"]]
    .map(([dir, label]) => ({ dir: realDir(dir), label }))
    .filter(({ dir }) => dir && dirname(dir) !== dir && !within(realHome, dir));
}

// Why a PATH entry is skipped, or null to search it. The node_modules/.bin test runs on the real path too,
// so ".bin/." and "./.bin" are caught: npx puts the current folder's and each ancestor's first.
function skipped(entry, roots) {
  if (!isAbsolute(entry)) return "in a relative PATH entry";
  const dir = realDir(entry);
  if (!dir) return "missing";
  if (BIN.test(entry) || BIN.test(dir)) return "in a node_modules/.bin";
  const root = roots.find((r) => within(dir, r.dir));
  return root ? `inside ${root.label}` : null;
}

// The tool's full path on PATH, never a copy a project ships: { path } or, when only a skipped entry has it, { why }.
function toolPath(name, sys, projectDir) {
  const roots = projectRoots(projectDir, sys.home);
  const look = (PATH) => findCommand(name, { env: { PATH, PATHEXT: sys.env.PATHEXT }, platform: sys.platform });
  const entries = (sys.env.PATH || sys.env.Path || "").split(delimiter).filter(Boolean)
    .map((entry) => ({ entry, why: skipped(entry, roots) }));
  const path = look(entries.filter((e) => !e.why).map((e) => e.entry).join(delimiter));
  if (path) return { path };
  const hit = entries.find((e) => e.why && e.why !== "missing" && look(e.entry));
  return { why: hit ? `${name} found only ${hit.why}, not run` : `${name} isn't on your PATH` };
}

// Step 1. Each command runs with no shell, by full path, and a failed one ends that tool's steps.
function plugins(sys, projectDir, dryRun, log) {
  log("1. Plugins");
  const rows = [];
  for (const p of pluginVersions({ home: sys.home, env: sys.env })) {
    const name = `${p.label} plugin ${p.id}`;
    if (!p.version) {
      log(`   ${p.label} plugin: not installed, skipped`);
      continue;
    }
    const { path, why } = toolPath(p.tool, sys, projectDir);
    if (!path) {
      log(`   ${name} v${p.version}: skipped, ${why}`);
      rows.push({ tool: p.tool, part: name, before: `v${p.version}`, note: `skipped: ${why}` });
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

// A part that throws (EACCES on ~/.agents/skills, a broken kit record) becomes a FAILED row, so the others still run.
async function part(name, run, log) {
  try {
    return await run();
  } catch (error) {
    const why = String(error?.message ?? error).split("\n")[0];
    log(`   ${name}: FAILED: ${why}`);
    return [{ part: name, before: `FAILED: ${why}`, failed: true }];
  }
}

/** Runs all four parts, each on its own; exit 1 when any part, plugin command or the project update failed. */
export async function updateAll(dir = ".", { dryRun = false, kitDir, ask, yes = false, sys = realSystem(), log = console.log } = {}) {
  const projectDir = resolve(dir);
  const { version } = loadKit(kitDir);
  log(dryRun ? `Plan for kit v${version} (dry run: nothing runs, nothing is written)` : `Bringing onRails to kit v${version}, the one in this CLI`);
  const rows = [
    ...(await part("Plugins", () => plugins(sys, projectDir, dryRun, log), log)),
    ...(await part("Global entry skills", () => globalSkills({ kitDir, sys, dryRun, version, log }), log)),
    ...(await part("Project kit", () => projectKit(projectDir, { kitDir, dryRun, ask, yes, log }), log)),
  ];
  const code = () => (rows.some((r) => r.failed) ? 1 : 0);
  if (dryRun) {
    log("4. doctor: would run after the updates");
    log("\nNothing ran. To do it: npx onrails@latest update --all");
    return code();
  }
  log("4. doctor");
  rows.push(...(await part("doctor", () => (doctor(projectDir, { kitDir, sys, log }), []), log)));
  summary(rows, log);
  return code();
}
