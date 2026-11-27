// The checks about this project: the kit (and Full automation on an old one), the skills mirror, stale research, stale background processes, .env files, GitHub Actions, Playwright, wrangler.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { staleDossiers } from "./check-research.mjs";
import { envChecks } from "./envfiles.mjs";
import { readJson, toNative, walk } from "./files.mjs";
import { fullOnOldKit } from "./full-kit.mjs";
import { OLD_PROJECT_MANIFEST, PROJECT_MANIFEST, loadKit } from "./kit.mjs";
import { projectManifestName, readProjectManifest } from "./sync.mjs";
import { MARKS } from "./marks.mjs";
import { CI_FIX, actionsOn, ciMode, githubRepo, workflowFiles } from "./preflight-ci.mjs";
import { personalValues } from "./research-library.mjs";
import { staleSummary } from "./procs.mjs";
import { realSys } from "./procs-sys.mjs";

function sameTree(a, b) {
  const fa = walk(a), fb = walk(b);
  if (fa.length !== fb.length || fa.some((f, i) => f !== fb[i])) return false;
  return fa.every((f) => readFileSync(toNative(a, f)).equals(readFileSync(toNative(b, f))));
}

export function projectChecks(projectDir, { kitDir, sys }) {
  const { OK, FAIL, INFO } = MARKS;
  const checks = [];
  const add = (status, label, fix, required = true, remedy) => checks.push({ status, label, fix, required, remedy });
  const init = { print: ["npx onrails init"] };

  const manifest = readProjectManifest(projectDir);
  let cliKit = null;
  try { cliKit = loadKit(kitDir).version; } catch { /* reported below */ }
  if (!manifest) add(FAIL, "Kit not installed here", "Run: npx onrails init", true, init);
  else if (cliKit && manifest.kitVersion !== cliKit) {
    add(FAIL, `Kit v${manifest.kitVersion} installed, this CLI has v${cliKit}`, "Run: npx onrails@latest update", false,
      { print: ["npx onrails@latest update"] });
  } else add(OK, `Kit v${manifest.kitVersion} installed`);
  const oldFull = manifest && fullOnOldKit(projectDir, manifest.kitVersion);
  if (oldFull) add(FAIL, oldFull, "Run: npx onrails@latest update", false, { print: ["npx onrails@latest update"] });
  if (projectManifestName(projectDir) === OLD_PROJECT_MANIFEST) {
    add(INFO, `The kit's record still has its old name, ${OLD_PROJECT_MANIFEST} (it works). npx onrails update offers to rename it ${PROJECT_MANIFEST}`);
  }

  const hasAgents = existsSync(toNative(projectDir, "AGENTS.md"));
  add(hasAgents ? OK : FAIL, hasAgents ? "AGENTS.md present" : "AGENTS.md missing", "Run: npx onrails init", true, init);

  const a = toNative(projectDir, ".agents/skills"), c = toNative(projectDir, ".claude/skills");
  if (!existsSync(a) && !existsSync(c)) add(INFO, "No skills folders yet");
  else {
    const same = sameTree(a, c);
    const recopy = existsSync(a) && {
      action: {
        describe: "replace .claude/skills with a fresh copy of .agents/skills (the master)",
        run: () => { rmSync(c, { recursive: true, force: true }); cpSync(a, c, { recursive: true }); },
      },
    };
    add(same ? OK : FAIL, same ? ".agents/skills and .claude/skills match" : ".agents/skills and .claude/skills differ",
      "Copy .agents/skills over .claude/skills (the .agents copy is the master)", false, recopy || undefined);
  }

  const state = existsSync(toNative(projectDir, "docs/state.md"));
  add(state ? OK : INFO, state ? "docs/state.md present" : "No docs/state.md yet: type /idea for a new app or /join for an existing repo");

  checks.push(...researchChecks(projectDir));
  // The registry's git, ps and powershell.exe run only by the full path doctor's own search finds (#185), through
  // launch like every other command (#215), so git may take the project as its working folder (fullPath). A system
  // without that search (a test's fake) runs none of them.
  const run = (cmd, args, opts) => sys.runTool?.(cmd, args, opts) ?? { error: new Error(`${cmd} not run`) };
  checks.push(...processChecks(projectDir, { sys: { ...realSys({ run, fullPath: true }), home: sys.home } }));
  checks.push(...profileChecks(projectDir));
  checks.push(...envChecks(projectDir, MARKS));
  checks.push(...actionsChecks(projectDir, sys));
  const deps = projectDeps(projectDir);
  if (deps["@playwright/test"]) checks.push(playwrightCheck(projectDir, sys));
  if (["wrangler.jsonc", "wrangler.json", "wrangler.toml"].some((f) => existsSync(join(projectDir, f)))) {
    checks.push(...wranglerChecks(projectDir, deps, sys));
  }
  return checks;
}

// Dossiers past their re-check date (the research skill). check-research.mjs is synced from scripts/.
function researchChecks(projectDir) {
  const { OK, FAIL } = MARKS;
  const dir = join(projectDir, "docs", "research");
  if (!existsSync(join(dir, "README.md"))) return [];
  const stale = staleDossiers(dir);
  if (!stale.length) return [{ status: OK, label: "No stale research dossiers" }];
  const list = stale.map((s) => `${s.dossier} (re-check ${s.recheck})`).join(", ");
  return [{
    status: FAIL, required: false, label: `${stale.length} stale research dossier(s): ${list}`,
    fix: "Re-check each with the research skill, or mark it superseded in docs/research/README.md",
  }];
}

// Background processes an onRails session started and nobody stopped (#126). procs.mjs is synced from scripts/.
// sys is the registry's machine (procs-sys.mjs), so tests can pass a fake.
// A registry skipped for a mode is named with its chmod line, as list names it, so "nothing running" never hides it.
// One skipped for anything else it says to do (a Windows ACL, a folder or link on the way, a file system, #231) is
// named with "Do what it says", never "it keeps the records": a repo copied to another file system starts fresh (row 106).
const CHMOD_FIX = "Run that chmod: it keeps the records, and its processes are listed and stopped again";
const OTHER_FIX = "Do what it says: until then its processes aren't listed or stopped, and a repo moved to another file system or cloned again starts with no records";
// A home folder that can't be trusted (NFS, another account's) is how the machine is set up: nothing to fix, and
// each such reason ends with where processes are still tracked (procs-path.mjs's HOME_OFF and fsProblem).
const SET_UP = "still tracks its processes";
const SET_UP_FIX = "Nothing to fix: this is how the machine is set up. Start background processes from inside a repo, whose own registry still lists and stops them";
export function processChecks(projectDir, { sys }) {
  const { total, stale, skipped, unreadable } = staleSummary(projectDir, { sys });
  const notRead = skipped.map((why) => ({
    status: MARKS.FAIL, required: false, label: `Process registry not read: ${why}`, fix: why.includes("run chmod") ? CHMOD_FIX : why.endsWith(SET_UP) ? SET_UP_FIX : OTHER_FIX,
  }));
  if (unreadable) return [...notRead, { status: MARKS.INFO, label: "Background processes not checked (ps failed here)" }];
  if (!total) return notRead;
  if (!stale.length) return [...notRead, { status: MARKS.OK, label: `${total} registered background process(es), none stale` }];
  return [...notRead, {
    status: MARKS.FAIL, required: false, label: `${stale.length} stale background process(es): ${stale.map((r) => `${r.id} ${r.command} (${r.stale})`).join(", ")}`,
    fix: "Run: npx onrails ps --stop stale",
  }];
}

// No GitHub Actions on ci = "local" (#133): workflow files, or Actions still on, each get the one command that fixes both.
// preflight-ci.mjs is synced from scripts/. The Actions setting is asked of GitHub only for a github.com remote.
function actionsChecks(projectDir, sys) {
  const { OK, FAIL, INFO } = MARKS;
  if (ciMode(projectDir) === "actions") return [];
  const fix = { fix: `Run: ${CI_FIX}`, remedy: { print: [CI_FIX] }, required: false };
  const checks = [];
  const files = workflowFiles(projectDir);
  if (files.length) checks.push({ status: FAIL, label: `${files.length} workflow file(s) in .github/workflows/ on ci = "local": ${files.join(", ")}`, ...fix });
  const remote = sys.probe("git", ["remote", "get-url", "origin"], { cwd: projectDir });
  const repo = remote?.ok ? githubRepo(remote.out) : null;
  if (!repo) return checks;
  const perms = sys.probe("gh", ["api", `repos/${repo}/actions/permissions`], { cwd: projectDir });
  const on = perms?.ok ? actionsOn(perms.stdout) : null; // stdout alone: gh prints notices on stderr (#200)
  if (on) checks.push({ status: FAIL, label: `GitHub Actions is on for ${repo} (ci = "local")`, ...fix });
  else if (on === null) checks.push({ status: INFO, label: `GitHub Actions setting for ${repo} not checked (gh didn't answer: sign in with gh auth login)` });
  else if (!files.length) checks.push({ status: OK, label: `No GitHub Actions: no workflow files, and Actions is off for ${repo}` });
  return checks;
}

// The research library's name and path are personal (research-library.mjs). A project copy must not hold them.
function profileChecks(projectDir) {
  const path = join(projectDir, "docs", "profile.toml");
  if (!existsSync(path)) return [];
  const keys = Object.keys(personalValues(readFileSync(path, "utf8")));
  if (!keys.length) return [];
  return [{
    status: MARKS.FAIL, required: false, label: `docs/profile.toml sets [research] ${keys.join(" and ")}, which names your private research library`,
    fix: "Delete them from docs/profile.toml; keep them in ~/.onrails/profile.toml only. Agents ignore the project's copy",
  }];
}

function projectDeps(projectDir) {
  const path = join(projectDir, "package.json");
  if (!existsSync(path)) return {};
  try {
    const pkg = readJson(path);
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch { return {}; }
}

// Where Playwright keeps its browsers on each OS (https://playwright.dev/docs/browsers).
export function playwrightBrowsersDir({ platform, home, env }, projectDir) {
  const custom = env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom === "0") return join(projectDir, "node_modules", "playwright-core", ".local-browsers");
  if (custom) return custom;
  if (platform === "win32") return join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "ms-playwright");
  if (platform === "darwin") return join(home, "Library", "Caches", "ms-playwright");
  return join(env.XDG_CACHE_HOME || join(home, ".cache"), "ms-playwright");
}

function playwrightCheck(projectDir, sys) {
  const { OK, FAIL } = MARKS;
  const dir = playwrightBrowsersDir(sys, projectDir);
  const found = existsSync(dir) && readdirSync(dir).some((n) => n.startsWith("chromium"));
  if (found) return { status: OK, label: "Playwright Chromium installed" };
  const run = [["pnpm", "exec", "playwright", "install", "chromium"]];
  if (!existsSync(join(projectDir, "node_modules", "@playwright", "test"))) run.unshift(["pnpm", "install"]);
  return {
    status: FAIL, required: false, label: "Playwright Chromium not installed",
    fix: "Run: pnpm exec playwright install chromium", remedy: { run, cwd: projectDir },
  };
}

function wranglerChecks(projectDir, deps, sys) {
  const { OK, FAIL, INFO } = MARKS;
  if (!deps.wrangler) {
    return [{
      status: FAIL, required: false, label: "wrangler is not in this project's devDependencies",
      fix: "Run: pnpm add -D wrangler", remedy: { print: ["pnpm add -D wrangler   (in this project, not a global install)"] },
    }];
  }
  // Never the project's own node_modules/.bin/wrangler: a cloned repo can ship any file there (#185). A wrangler
  // installed outside the project shares the sign-in, so it answers for this one.
  const who = sys.probe("wrangler", ["whoami"], { cwd: projectDir });
  if (!who) {
    return [{ status: INFO, label: "wrangler sign-in not checked (doctor runs no wrangler from inside the project). Check it yourself: pnpm exec wrangler whoami" }];
  }
  const signedIn = who.ok && !/not authenticated|not logged in/i.test(who.all);
  if (signedIn) return [{ status: OK, label: "wrangler is signed in" }];
  return [{
    status: FAIL, required: false, label: "wrangler is not signed in",
    fix: "Run: pnpm exec wrangler login", remedy: { print: ["pnpm exec wrangler login"] },
  }];
}
