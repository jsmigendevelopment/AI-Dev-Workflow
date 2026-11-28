#!/usr/bin/env node
// Preflight (#100): probes the agent's own session in about 10 seconds and prints ONE table,
// so every sandbox blocker is found in the first minute. `doctor` runs in the person's terminal,
// which has other permissions, and can't see these. Each failure comes with its fix ladder:
// work around it in the sandbox, ask to run one command outside it, use the environment tools,
// and only then the person, in ONE message. The ask skill's references/preflight.md has the steps.
//   node preflight.mjs [dir] [--record] [--if-changed] [--json] [--mark-read]
//                      [--model <id>] [--effort <level>] [--tool claude|claude-cloud|codex|other]
// --record writes the result to the Environment line of docs/state.md. --if-changed skips every
// probe when that line says ok and the sandbox hasn't changed. --mark-read is for /join and /back:
// it marks the repo read on this machine (#169), and preflight runs no code the repo chose until then.
// It changes nothing else: a temp file, a temp branch (or a temp git config key), a temp folder
// outside the repo and a local port are made and removed.
// Exit 0: nothing to fix. 1: something to fix or blocked. 2: a bad flag. No dependencies.
// The master copy is scripts/preflight.mjs in the kit, with preflight-sys.mjs, preflight-owner.mjs, preflight-layout.mjs,
// preflight-ci.mjs, preflight-output.mjs and preflight-versions.mjs; sync-skills.mjs copies all seven into the ask skill and the CLI. Before the read, never start it through npx (#182): npx changes PATH
// and which onrails runs, in ways the repo can steer.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ciWarnings } from "./preflight-ci.mjs";
import { pathOutside, repoLayout, tempBases, tempFolders } from "./preflight-layout.mjs";
import { aclPaths, loadWinAcls } from "./preflight-owner.mjs";
import { CLOSED, cause, ladder, NO_AWAY, readRecord, recordLine, render, selfFix, shown, TOOLS, UNREAD, unreadNote, warningLines, withRecord } from "./preflight-output.mjs";
import { isRead, markRead, markRefusal, realSys } from "./preflight-sys.mjs";
import { checkGo, checkGoProxy, checkVersions, LOCKS, readGoMod, readManager, small } from "./preflight-versions.mjs";

export { readRecord, render, withRecord } from "./preflight-output.mjs";
export { satisfies } from "./preflight-versions.mjs";

/** The checks, in the order the table prints them. A repo with a go.mod also gets go and goproxy, before model (#538). */
export const CHECKS = ["repo", "git", "registry", "github", "loopback", "browser", "versions", "model"];
const LABELS = { repo: "Write the repo", git: "Write .git", registry: "Package registry", github: "GitHub", loopback: "Loopback",
  browser: "A browser", versions: "Node and package manager", go: "Go toolchain", goproxy: "Go module proxy", model: "Model and effort" };
const rows = (goMod) => (goMod ? CHECKS.flatMap((id) => (id === "model" ? ["go", "goproxy", id] : [id])) : CHECKS);
// Launches the project's own Playwright Chromium and closes it. Run with node -e in the project.
const LAUNCH = "const r=require('module').createRequire(process.cwd()+'/package.json');let p;try{p=r('playwright')}catch{p=r('@playwright/test')}"
  + "p.chromium.launch({headless:true}).then(b=>b.close()).then(()=>console.log('ok')).catch(e=>{console.error(String(e.message).split('\\n')[0]);process.exit(1)})";


/** Which tool this session runs in, from what it sets in the environment. --tool overrides a wrong guess. */
export function detectTool(env = {}) {
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return env.CLAUDE_CODE_REMOTE === "true" ? "claude-cloud" : "claude";
  if (Object.keys(env).some((k) => k.startsWith("CODEX_"))) return "codex";
  return "other";
}


function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
function checkRepo(dir, tool) {
  const file = join(dir, `.onrails-preflight-${randomBytes(4).toString("hex")}`);
  try {
    writeFileSync(file, "x");
    rmSync(file);
    return { status: "ok", detail: "wrote and removed a temp file" };
  } catch (error) {
    return { status: "blocked", detail: `can't write here: ${shown(error.code, "code", "an error")}`, ladder: ladder("repo", tool) };
  }
}

// Until the person's own session has marked the repo read (#169), no probe runs code the repo chose. `safe` holds:
// read; outside, an empty temp folder outside the repo; and git, the settings that keep the repo's hooks from running.
// closed: the repo's layout can't be read, so no PATH folder is kept and no command runs before the read (#182).

async function checkGit(dir, tool, sys, safe) {
  if (safe.closed) return { status: "limited", detail: CLOSED };
  if (!safe.hooks) return { status: "limited", detail: "no empty hooks folder that only this user can write could be made, so it's checked after the repo is read" };
  const git = (args) => sys.run("git", args, { cwd: dir, ...safe.git });
  const top = await git(["rev-parse", "--show-toplevel"]);
  if (!top) return safe.unread ? { status: "limited", detail: UNREAD("git") } : { status: "blocked", detail: "git isn't installed", ladder: ladder("git", tool) };
  if (!top.ok && existsSync(join(dir, ".git"))) {
    return { status: "fix", detail: `a .git is here, but git can't read it: ${cause(top.out, "git's error isn't printed")}`,
      ladder: selfFix("run `git status` and fix what it says (a `.git` file that points nowhere, or `safe.directory` for dubious ownership), then run preflight again.") };
  }
  if (!top.ok) return { status: "fix", detail: "no git repo here yet", ladder: selfFix("`git init`, then run preflight again.") };
  const name = `onrails-preflight-${randomBytes(4).toString("hex")}`;
  // A temp branch proves refs can be written. A repo with no commit yet has nothing to branch from, so a temp config key stands in.
  const hasCommit = (await git(["rev-parse", "--verify", "HEAD"]))?.ok;
  const made = await git(hasCommit ? ["branch", name] : ["config", "--local", "onrails.preflight", name]);
  if (!made?.ok) return { status: "blocked", detail: `can't write .git: ${cause(made?.out, "git refused")}`, ladder: ladder("git", tool) };
  await git(hasCommit ? ["branch", "-D", name] : ["config", "--local", "--unset", "onrails.preflight"]);
  return { status: "ok", detail: hasCommit ? "made and deleted a temp branch" : "wrote and removed a temp config key (no commit yet)" };
}

// Before the read, npm runs from the folder outside the repo, so no packageManager pin or .npmrc of the repo's is in
// scope. The registry the repo's .npmrc names is passed by hand, only when it is a plain URL.
const PLAIN_REGISTRY = /^registry[ \t]*=[ \t]*(https?:\/\/[\w.-]+(:\d{1,5})?(\/[\w./-]*)?)[ \t]*$/m;

async function checkRegistry(dir, tool, sys, pm, safe) {
  if (safe.closed) return { status: "limited", detail: CLOSED };
  const named = safe.read ? null : PLAIN_REGISTRY.exec(small(join(dir, ".npmrc")))?.[1];
  const how = safe.read ? { cwd: dir } : safe.away;
  if (!how) return { status: "limited", detail: NO_AWAY };
  // Global mode reads no project .npmrc: one another user put in a shared folder above, such as /tmp, would name its
  // registry and settings (#232). Unlike --prefix=., it leaves npm's own global npmrc where npm puts it, and passes no path.
  const pick = [...(safe.read ? [] : ["--location=global"]), ...(named ? [`--registry=${named}`] : [])];
  const url = await sys.run("npm", ["config", "get", "registry", ...pick], how);
  if (!url) return safe.unread ? { status: "limited", detail: UNREAD("npm") } : { status: "blocked", detail: "npm isn't installed", ladder: ladder("versions", tool) };
  // Node before 18.17 has no URL.canParse: then plain words, and the versions row says Node is too old.
  const raw = url.out.trim();
  const host = shown(URL.canParse?.(raw) ? new URL(raw).host : null, "host", "the registry in .npmrc");
  // The metadata of one package, fresh from the registry the project's .npmrc names. npm honours the session's proxy.
  const meta = await sys.run("npm", ["view", "npm", "dist-tags.latest", "--prefer-online", "--fetch-retries=0", "--fetch-timeout=10000", ...pick], { ...how, timeout: 30000 });
  if (meta?.ok) return { status: "ok", detail: `${host} answered` };
  const code = cause(meta?.out, "no answer");
  return { status: "blocked", detail: `${host} didn't answer (${code})`, ladder: ladder("registry", tool, { host, pm, platform: sys.platform }) };
}

// Before the read, git ls-remote runs from outside the repo against the remote's URL, so no setting in the repo's
// .git/config (an upload-pack, an ssh command, a protocol) is read. Only a URL in a plain https or ssh form is used,
// and an https one with no user or token in it, so no secret is put on a command line.
const PLAIN_REMOTE = /^(https?:\/\/[^\s@-][^\s@]*|ssh:\/\/([\w.-]+@)?[A-Za-z0-9][\w.-]*(:\d{1,5})?\/\S+|[\w.-]+@[A-Za-z0-9][\w.-]*:[^\s-]\S*)$/;

async function checkGithub(dir, sys, safe) {
  if (safe.closed) return { status: "limited", detail: CLOSED };
  const remote = await sys.run("git", ["remote", "get-url", "origin"], { cwd: dir, ...safe.git });
  const url = remote?.ok ? remote.out.trim().split("\n")[0] : "";
  const away = safe.read ? { cwd: dir } : safe.away;
  if (!away) return { status: "limited", detail: NO_AWAY };
  // `gh api rate_limit` is free and proves the API answers. `gh auth status` can fail while the API works (a proxied token).
  const api = await sys.run("gh", ["api", "rate_limit"], away);
  const plain = safe.read || PLAIN_REMOTE.test(url);
  const push = url && plain ? await sys.run("git", ["ls-remote", "--heads", safe.read ? "origin" : url], { ...away, timeout: 20000 }) : null;
  if (api?.ok && (!url || push?.ok)) return { status: "ok", detail: url ? "the remote and the API answer" : "the API answers; no remote yet" };
  const why = !api ? (safe.unread ? UNREAD("gh") : "gh isn't installed") : !api.ok ? "gh isn't signed in, or the API is limited"
    : plain ? "the remote didn't answer" : "the remote's URL isn't a plain https or ssh one, so it's checked after the repo is read";
  const mode = url && push?.ok ? "pushes work, so the loop queues the API steps (local mode)" : "the loop runs in local mode, with issues as files";
  return { status: "limited", detail: `${why}: ${mode}. \`gh auth login\` is the person's step, when they want GitHub` };
}

async function checkBrowser(dir, tool, sys, pkg, pm, safe) {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const name = ["@playwright/test", "playwright"].find((n) => deps[n]);
  if (!name) return { status: "skip", detail: "not needed yet: no Playwright in package.json" };
  if (!existsSync(join(dir, "node_modules", ...name.split("/")))) return { status: "skip", detail: "Playwright isn't installed yet: run preflight again after the install" };
  // The launch loads the project's own Playwright, from files the repo can ship.
  if (!safe.read) return { status: "limited", detail: "Playwright is installed; its launch check loads the project's own files, so it runs after the repo is read" };
  const launch = await sys.run("node", ["-e", LAUNCH], { cwd: dir, timeout: 40000 });
  if (launch?.ok) return { status: "ok", detail: "headless Chromium started and closed" };
  return { status: "fix", detail: `Chromium didn't start: ${cause(launch?.out)}`,
    ladder: selfFix(`\`${pm} exec playwright install chromium\` (Playwright's bundled browser), then run preflight again. Still failing? Treat it as blocked: the download needs the network.`) };
}


function checkModel(sys, given) {
  const seen = (value, kind) => (value ? shown(value, kind, "unknown") : undefined);
  const model = seen(given.model ?? sys.env.ANTHROPIC_MODEL, "model");
  const effort = seen(given.effort ?? sys.env.CLAUDE_EFFORT, "effort");
  if (!model && !effort) return { status: "info", detail: "not visible to scripts: pass --model and --effort from your own session" };
  return { status: "info", detail: `model ${model ?? "not visible"}, effort ${effort ?? "not visible"}`, model, effort };
}

/** A short hash of what makes this sandbox this sandbox. It moves when the machine, the tool, Node, the project's install settings or its read mark change. */
export const fingerprint = (parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 12);

function sandboxPrint(dir, tool, sys, pkg, read) {
  const goMod = readGoMod(dir);
  const npmrc = existsSync(join(dir, ".npmrc")) ? readFileSync(join(dir, ".npmrc"), "utf8") : "";
  const flags = ["HTTPS_PROXY", "https_proxy", "CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED", "PLAYWRIGHT_BROWSERS_PATH"].map((k) => Boolean(sys.env[k]));
  return fingerprint({ tool, node: sys.node, hostname: sys.hostname, platform: sys.platform, npmrc, engines: [pkg?.engines?.node, pkg?.packageManager], flags, read,
    go: goMod ? goMod.want ?? "" : undefined });
}

/**
 * Runs every probe in dir. Returns { tool, checkedAt, fingerprint, ok, read, state, unsafe, results: [{ id, label, status, detail, ladder }] }.
 * bases: where a test lets tempFolders look.
 */
export async function probe(dir, sys = realSys(), given = {}, { bases } = {}) {
  const tool = given.tool ?? detectTool(sys.env);
  const pkg = readJson(join(dir, "package.json"));
  const goMod = readGoMod(dir);
  const manager = readManager(pkg);
  const pm = manager?.name ?? Object.entries(LOCKS).find(([file]) => existsSync(join(dir, file)))?.[1] ?? "npm";
  const read = isRead(dir);
  // Before the read, every command is found on, and given, a PATH with no folder inside any checkout of the repo (#182).
  // When the repo's layout can't be read, that PATH is empty and the rows that need a command wait for the read.
  const layout = repoLayout(dir);
  const temps = tempFolders(dir, sys.platform, layout, bases);
  const unsafe = [];
  const unread = { count: 0 };
  const path = read ? {} : pathOutside(dir, sys.platform, sys.env, layout, unsafe, unread);
  const away = temps.away && { ...temps.away, env: { ...temps.away.env, ...path } };
  // An empty hooks folder: no hook the repo ships, or names in its config, runs on the temp branch. Without one only
  // this user can write, POSIX's /dev/null holds no hook and no one can add one; elsewhere the branch waits for the read (#232).
  const hooksPath = temps.hooks ?? (sys.platform === "win32" ? null : "/dev/null");
  const hooks = hooksPath ? [`core.hooksPath=${hooksPath}`] : [];
  const safe = { read, away, path, hooks: read || Boolean(hooksPath), closed: !read && !layout, unread: unread.count > 0, git: read ? {} : { config: hooks, env: path } };
  try {
    const loop = await sys.loopback();
    const go = goMod && await checkGo(dir, tool, sys, goMod, safe);
    const found = {
      repo: checkRepo(dir, tool),
      git: await checkGit(dir, tool, sys, safe),
      registry: await checkRegistry(dir, tool, sys, pm, safe),
      github: await checkGithub(dir, sys, safe),
      loopback: loop.ok ? { status: "ok", detail: loop.detail } : { status: "blocked", detail: `can't listen on 127.0.0.1: ${loop.detail}`, ladder: ladder("loopback", tool) },
      browser: await checkBrowser(dir, tool, sys, pkg, pm, safe),
      versions: await checkVersions(dir, tool, sys, pkg, manager, safe),
      go,
      goproxy: goMod && await checkGoProxy(dir, tool, sys, go, safe),
      model: checkModel(sys, given),
    };
    const results = rows(goMod).map((id) => ({ id, label: LABELS[id], ladder: [], ...found[id] }));
    const at = new Date(sys.now()).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z");
    const ok = results.every((r) => r.status !== "fix" && r.status !== "blocked");
    // Workflow files on ci = "local", or Actions on (#133): a warning with its fix, never a failed row. Before the read, files only.
    const warnings = await ciWarnings(dir, sys, read);
    return { tool, checkedAt: at, fingerprint: sandboxPrint(dir, tool, sys, pkg, read), ok, read, away: !read && Boolean(away),
      state: existsSync(join(dir, "docs", "state.md")), unsafe: [...new Set(unsafe)], results, warnings };
  } finally {
    temps.remove();
  }
}


const USAGE = `preflight [dir] [--record] [--if-changed] [--json] [--mark-read] [--model <id>] [--effort <level>] [--tool claude|claude-cloud|codex|other]`;

/** The command line: reads the flags, runs or skips the probes, prints, records. Returns the exit code. */
export async function main(argv, { sys = realSys(), log = console.log } = {}) {
  const given = {};
  const flags = new Set();
  let dir = ".";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--model", "--effort", "--tool"].includes(a) && argv[i + 1]) given[a.slice(2)] = argv[++i];
    else if (["--record", "--if-changed", "--json", "--mark-read", "--help", "-h"].includes(a)) flags.add(a);
    else if (a.startsWith("-")) return log(`Unknown option: ${shown(a, "flag", "(not printed)")}\nUsage: ${USAGE}`), 2;
    else dir = a;
  }
  if (given.tool && !Object.hasOwn(TOOLS, given.tool)) return log(`--tool is one of: ${Object.keys(TOOLS).join(", ")}`), 2;
  if (flags.has("--help") || flags.has("-h")) return log(`Usage: ${USAGE}`), 0;
  dir = resolve(dir);
  // Windows: every ACL the checks ask about, read in one PowerShell start (#246). A test's sys may give the reader.
  if (sys.platform === "win32") loadWinAcls(aclPaths(dir, sys.env, tempBases("win32")), sys.winAcls);
  if (flags.has("--mark-read")) {
    // Only the .git next to dir: a folder under a bigger repo (a home-folder repo, say) never marks that repo.
    const marked = markRead(dir);
    if (marked) return log(`Marked this repo read on this machine: ${shown(marked, "path", "(path not printed)")}. Run preflight again: every probe runs now.`), 0;
    const why = markRefusal(dir);
    const what = why ? `A folder another user can write or swap, so not marked: ${shown(why, "reason", "the folder isn't printed")}.`
      : "No .git folder of its own in this folder, a .git file preflight doesn't follow, or a folder another user can write: not marked.";
    return log(`${what} Run it in the repo's top folder, after \`git init\` if there's none, in a folder only you can write.`), 1;
  }
  const statePath = join(dir, "docs", "state.md");
  const state = existsSync(statePath) ? readFileSync(statePath, "utf8") : null;

  if (flags.has("--if-changed")) {
    const tool = given.tool ?? detectTool(sys.env);
    const record = readRecord(state ?? "");
    const read = isRead(dir);
    if (record?.ok && record.fingerprint === sandboxPrint(dir, tool, sys, readJson(join(dir, "package.json")), read)) {
      const detail = "Environment: ok on record, and nothing changed. Skipped the probes. Run without --if-changed to check again.";
      // Still unmarked: the note goes with the skip too, so /back and build learn to mark it.
      const note = unreadNote({ read, state: state !== null });
      const warnings = await ciWarnings(dir, null, false);
      return log(flags.has("--json") ? JSON.stringify({ ok: true, skipped: true, read, fingerprint: record.fingerprint, detail, note: note[1], warnings }, null, 2)
        : [detail, ...note, ...warningLines(warnings)].join("\n")), 0;
    }
  }
  const report = await probe(dir, sys, given);
  log(flags.has("--json") ? JSON.stringify(report, null, 2) : render(report));
  if (flags.has("--record")) {
    if (state === null) flags.has("--json") || log("No docs/state.md yet: not recorded. Run it with --record again once the state file exists.");
    else writeFileSync(statePath, withRecord(state, recordLine(report)));
  }
  return report.ok ? 0 : 1;
}

/** True when node started this file, also through a symlinked file or folder: import.meta.url is the real path, so
 * argv[1] is resolved to its real path too (#506, as in pr-size.mjs, #439). */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false; // An argv[1] that names no file (a REPL, a loader's stand-in) isn't this module.
  }
}

if (isMainModule()) process.exitCode = await main(process.argv.slice(2));
