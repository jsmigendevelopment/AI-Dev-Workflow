// The checks about this project: the kit, the skills mirror, .env files, Playwright, wrangler.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { envChecks } from "./envfiles.mjs";
import { readJson, toNative, walk } from "./files.mjs";
import { loadKit } from "./kit.mjs";
import { readProjectManifest } from "./sync.mjs";
import { MARKS } from "./marks.mjs";

function sameTree(a, b) {
  const fa = walk(a), fb = walk(b);
  if (fa.length !== fb.length || fa.some((f, i) => f !== fb[i])) return false;
  return fa.every((f) => readFileSync(toNative(a, f)).equals(readFileSync(toNative(b, f))));
}

export function projectChecks(projectDir, { kitDir, sys }) {
  const { OK, FAIL, INFO } = MARKS;
  const checks = [];
  const add = (status, label, fix, required = true, remedy) => checks.push({ status, label, fix, required, remedy });
  const init = { print: ["npx ai-dev-workflow init"] };

  const manifest = readProjectManifest(projectDir);
  let cliKit = null;
  try { cliKit = loadKit(kitDir).version; } catch { /* reported below */ }
  if (!manifest) add(FAIL, "Kit not installed here", "Run: npx ai-dev-workflow init", true, init);
  else if (cliKit && manifest.kitVersion !== cliKit) {
    add(FAIL, `Kit v${manifest.kitVersion} installed, this CLI has v${cliKit}`, "Run: npx ai-dev-workflow@latest update", false,
      { print: ["npx ai-dev-workflow@latest update"] });
  } else add(OK, `Kit v${manifest.kitVersion} installed`);

  const hasAgents = existsSync(toNative(projectDir, "AGENTS.md"));
  add(hasAgents ? OK : FAIL, hasAgents ? "AGENTS.md present" : "AGENTS.md missing", "Run: npx ai-dev-workflow init", true, init);

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

  checks.push(...envChecks(projectDir, MARKS));
  const deps = projectDeps(projectDir);
  if (deps["@playwright/test"]) checks.push(playwrightCheck(projectDir, sys));
  if (["wrangler.jsonc", "wrangler.json", "wrangler.toml"].some((f) => existsSync(join(projectDir, f)))) {
    checks.push(...wranglerChecks(projectDir, deps, sys));
  }
  return checks;
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
  const bin = join(projectDir, "node_modules", ".bin", sys.platform === "win32" ? "wrangler.cmd" : "wrangler");
  if (!existsSync(bin)) return [{ status: INFO, label: "wrangler sign-in not checked (run pnpm install first)" }];
  const who = sys.probe(bin, ["whoami"], { cwd: projectDir });
  if (!who) return [{ status: INFO, label: "wrangler sign-in not checked (wrangler whoami did not answer)" }];
  const signedIn = who.ok && !/not authenticated|not logged in/i.test(who.all);
  if (signedIn) return [{ status: OK, label: "wrangler is signed in" }];
  return [{
    status: FAIL, required: false, label: "wrangler is not signed in",
    fix: "Run: pnpm exec wrangler login", remedy: { print: ["pnpm exec wrangler login"] },
  }];
}
