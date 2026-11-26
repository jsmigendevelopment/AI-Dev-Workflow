#!/usr/bin/env node
// Preflight (#100): probes the agent's own session in about 10 seconds and prints ONE table,
// so every sandbox blocker is found in the first minute. `doctor` runs in the person's terminal,
// which has other permissions, and can't see these. Each failure comes with its fix ladder:
// work around it in the sandbox, ask to run one command outside it, use the environment tools,
// and only then the person, in ONE message. The ask skill's references/preflight.md has the steps.
//   node preflight.mjs [dir] [--record] [--if-changed] [--json]
//                      [--model <id>] [--effort <level>] [--tool claude|claude-cloud|codex|other]
// --record writes the result to the Environment line of docs/state.md. --if-changed skips every
// probe when that line says ok and the sandbox hasn't changed. It changes nothing else: a temp
// file, a temp branch (or a temp git config key) and a local port are made and removed.
// Exit 0: nothing to fix. 1: something to fix or blocked. 2: a bad flag. No dependencies.
// The master copy is scripts/preflight.mjs in the kit; sync-skills.mjs copies it into the ask
// skill and the CLI (npx onrails preflight).
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CHECKS = ["repo", "git", "registry", "github", "loopback", "browser", "versions", "model"];
const LABELS = { repo: "Write the repo", git: "Write .git", registry: "Package registry", github: "GitHub", loopback: "Loopback",
  browser: "A browser", versions: "Node and package manager", model: "Model and effort" };
const MARK = { ok: "✓", fix: "✗", blocked: "✗", limited: "–", skip: "–", info: "–" };
const TOOLS = { claude: "Claude Code", "claude-cloud": "Claude Code (cloud session)", codex: "Codex", other: "an unknown tool" };
// Launches the project's own Playwright Chromium and closes it. Run with node -e in the project.
const LAUNCH = "const r=require('module').createRequire(process.cwd()+'/package.json');let p;try{p=r('playwright')}catch{p=r('@playwright/test')}"
  + "p.chromium.launch({headless:true}).then(b=>b.close()).then(()=>console.log('ok')).catch(e=>{console.error(String(e.message).split('\\n')[0]);process.exit(1)})";

// The table, the ladder and the drafted message are read by the agent, and the message is posted. So a value
// from the repo or the environment is printed only when it matches a safe pattern, and plain words stand in for it otherwise.
const SAFE = { range: /^[\d.xX*^~<>= |]{1,40}$/, host: /^[a-z0-9.-]+(:\d+)?$/i, version: /^\d+(\.\d+){0,2}(-[0-9A-Za-z.-]{1,40})?$/,
  code: /^E[A-Z0-9_]{2,30}$/, model: /^[\w.:@\/[\]-]{1,80}$/, effort: /^[a-z]{1,12}$/i, flag: /^--?[a-z][\w-]{0,30}$/i };
const shown = (value, kind, instead) => (value != null && SAFE[kind].test(String(value)) ? String(value) : instead);
// Command output can carry text from the repo too, so only a cause from this list, or an error code, is taken from it.
const CAUSES = ["Read-only file system", "Permission denied", "Operation not permitted", "No space left on device", "Executable doesn't exist", "Host system is missing dependencies"];
const cause = (out = "", instead = "an error preflight doesn't print") =>
  CAUSES.find((c) => out.toLowerCase().includes(c.toLowerCase())) ?? /\b(E[A-Z_]{4,}|E\d{3})\b/.exec(out)?.[1] ?? instead;

/** Which tool this session runs in, from what it sets in the environment. --tool overrides a wrong guess. */
export function detectTool(env = {}) {
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return env.CLAUDE_CODE_REMOTE === "true" ? "claude-cloud" : "claude";
  if (Object.keys(env).some((k) => k.startsWith("CODEX_"))) return "codex";
  return "other";
}

/** True when a version fits a simple range (>=22, ^22, 22.x, "22.x || 24.x"). A range it can't read never blocks. */
export function satisfies(version, range) {
  const v = String(version).split(".").map(Number);
  const cmp = (want) => { for (let i = 0; i < 3; i++) { const d = (v[i] ?? 0) - (want[i] ?? 0); if (d) return d; } return 0; };
  const one = (token) => {
    const m = /^(>=|>|<=|<|\^|~|=)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(token);
    if (!m) return null;
    const num = (s) => (s === undefined || s === "x" || s === "*" ? undefined : Number(s));
    const [op, b, c] = [m[1] ?? "", num(m[3]), num(m[4])];
    const want = [Number(m[2]), b ?? 0, c ?? 0];
    if (op === ">=") return cmp(want) >= 0;
    if (op === ">") return cmp(want) > 0;
    if (op === "<=") return cmp(want) <= 0;
    if (op === "<") return cmp(want) < 0;
    if (op === "^") return v[0] === want[0] && cmp(want) >= 0;
    if (op === "~") return v[0] === want[0] && (b === undefined || v[1] === b) && cmp(want) >= 0;
    return v[0] === want[0] && (b === undefined || v[1] === b) && (c === undefined || v[2] === c);
  };
  let readable = false;
  const fits = String(range).split("||").some((part) => {
    const results = part.trim().split(/\s+/).filter(Boolean).map(one);
    if (!results.length || results.includes(null)) return false;
    readable = true;
    return results.every(Boolean);
  });
  return readable ? fits : true;
}

// Rung 2: the tool's own way to run one command outside the sandbox.
const ONE_COMMAND = {
  codex: (cmd) => `Ask to run \`${cmd}\` outside the sandbox (\`approval_policy = "on-request"\`): the person approves that one command.`,
  claude: (cmd) => `Run \`${cmd}\` as one plain command, so a permission prompt covers only it.`,
  "claude-cloud": () => "A cloud session has no prompt that lifts this. Go to rung 3.",
  other: (cmd) => `If your tool can ask to run one command outside its sandbox, ask for \`${cmd}\`.`,
};
// Rung 3: the environment tools the session may use.
const ENV_TOOLS = {
  codex: "Check that `.codex/config.toml` loaded: the project must be trusted. It sets `network_access = true`.",
  claude: "Check the sandbox and permission settings you may change, such as `.claude/settings.json`.",
  "claude-cloud": "Use the session's environment tools: read its network and setup pages (`read_documentation`), then propose the change to the environment.",
  other: "Use any environment or setup tool your session has.",
};
const CODEX_TRUST = "Trust this project so `.codex/config.toml` loads (it sets `network_access = true`), then restart Codex.";

/** The four rungs for a blocked check: 1 workarounds, 2 one command outside the sandbox, 3 environment tools, 4 the person. */
function ladder(id, tool, { host = "the registry", install = "npm install", want = "" } = {}) {
  const by = {
    repo: ["Work in a folder you can write: a temp folder, or a fresh clone under your home folder.", "touch a file here",
      { any: "Make this folder writable for the agent, or open the session in a folder that is." }],
    git: ["`git init` in a writable place and commit there (`git init --separate-git-dir <a writable folder>`), or keep working and commit at the end.",
      "git commit", { any: "Run the git command in your own terminal in this folder, or let the agent's git run outside the sandbox when it asks." }],
    registry: [`A project-local cache: \`${install} --prefer-offline --cache .npm-cache\` (pnpm: \`--prefer-offline --store-dir .pnpm-store\`). Check \`.npmrc\` names the registry you mean.`,
      install, { codex: CODEX_TRUST, claude: `Allow network access to ${host} for this project, or run \`${install}\` in your own terminal in this folder.`,
        "claude-cloud": `Allow ${host} in the cloud environment's network settings.`, other: `Give the agent's sandbox network access to ${host}, or run \`${install}\` in your own terminal in this folder.` }],
    loopback: ["Try another port. Run the server and the tests in the same process (no listening port). Next.js: `--webpack` in place of Turbopack.",
      "the dev server and its tests", { codex: CODEX_TRUST, any: "Let the agent's sandbox listen on 127.0.0.1, or run the browser checks in your own terminal." }],
    versions: ["A version manager already on this machine: `nvm use`, `fnm use` or `volta`, if one is installed.", "nvm install",
      { any: `Install a Node that fits ${want || ">=22"} (https://nodejs.org), then start the agent again in this folder.` }],
  }[id];
  if (!by) return [];
  const [workaround, command, person] = by;
  return [
    { rung: 1, text: `In the sandbox: ${workaround}` },
    { rung: 2, text: `One command outside it: ${ONE_COMMAND[tool](command)}` },
    { rung: 3, text: `Environment tools: ${ENV_TOOLS[tool]}` },
    { rung: 4, text: `The person, last: ${person[tool] ?? person.any}` },
  ];
}
const selfFix = (text) => [{ rung: 1, text: `Fix it yourself: ${text}` }];

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
const firstLine = (text = "") => text.split("\n").find((l) => l.trim())?.trim().slice(0, 140) ?? "";

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

function checkGit(dir, tool, sys) {
  const top = sys.run("git", ["rev-parse", "--show-toplevel"], { cwd: dir });
  if (!top) return { status: "blocked", detail: "git isn't installed", ladder: ladder("git", tool) };
  if (!top.ok) return { status: "fix", detail: "no git repo here yet", ladder: selfFix("`git init`, then run preflight again.") };
  const name = `onrails-preflight-${randomBytes(4).toString("hex")}`;
  // A temp branch proves refs can be written. A repo with no commit yet has nothing to branch from, so a temp config key stands in.
  const hasCommit = sys.run("git", ["rev-parse", "--verify", "HEAD"], { cwd: dir })?.ok;
  const made = hasCommit ? sys.run("git", ["branch", name], { cwd: dir }) : sys.run("git", ["config", "--local", "onrails.preflight", name], { cwd: dir });
  if (!made?.ok) return { status: "blocked", detail: `can't write .git: ${cause(made?.out, "git refused")}`, ladder: ladder("git", tool) };
  if (hasCommit) sys.run("git", ["branch", "-D", name], { cwd: dir });
  else sys.run("git", ["config", "--local", "--unset", "onrails.preflight"], { cwd: dir });
  return { status: "ok", detail: hasCommit ? "made and deleted a temp branch" : "wrote and removed a temp config key (no commit yet)" };
}

function checkRegistry(dir, tool, sys, install) {
  const url = sys.run("npm", ["config", "get", "registry"], { cwd: dir });
  if (!url) return { status: "blocked", detail: "npm isn't installed", ladder: ladder("versions", tool) };
  let host = "the registry in .npmrc";
  try { host = shown(new URL(url.out.trim()).host, "host", host); } catch { /* not a URL: keep the plain words */ }
  // The metadata of one package, fresh from the registry the project's .npmrc names. npm honours the session's proxy.
  const meta = sys.run("npm", ["view", "npm", "dist-tags.latest", "--prefer-online", "--fetch-retries=0", "--fetch-timeout=10000"], { cwd: dir, timeout: 30000 });
  if (meta?.ok) return { status: "ok", detail: `${host} answered` };
  const code = cause(meta?.out, "no answer");
  return { status: "blocked", detail: `${host} didn't answer (${code})`, ladder: ladder("registry", tool, { host, install }) };
}

function checkGithub(dir, sys) {
  const remote = sys.run("git", ["remote", "get-url", "origin"], { cwd: dir });
  const hasRemote = Boolean(remote?.ok && remote.out.trim());
  // `gh api rate_limit` is free and proves the API answers. `gh auth status` can fail while the API works (a proxied token).
  const api = sys.run("gh", ["api", "rate_limit"], { cwd: dir });
  const push = hasRemote ? sys.run("git", ["ls-remote", "--heads", "origin"], { cwd: dir, timeout: 20000 }) : null;
  if (api?.ok && (!hasRemote || push?.ok)) return { status: "ok", detail: hasRemote ? "the remote and the API answer" : "the API answers; no remote yet" };
  const why = !api ? "gh isn't installed" : !api.ok ? "gh isn't signed in, or the API is limited" : "the remote didn't answer";
  const mode = hasRemote && push?.ok ? "pushes work, so the loop queues the API steps (local mode)" : "the loop runs in local mode, with issues as files";
  return { status: "limited", detail: `${why}: ${mode}. \`gh auth login\` is the person's step, when they want GitHub` };
}

function checkBrowser(dir, tool, sys, pkg, pm) {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const name = ["@playwright/test", "playwright"].find((n) => deps[n]);
  if (!name) return { status: "skip", detail: "not needed yet: no Playwright in package.json" };
  if (!existsSync(join(dir, "node_modules", ...name.split("/")))) return { status: "skip", detail: "Playwright isn't installed yet: run preflight again after the install" };
  const launch = sys.run("node", ["-e", LAUNCH], { cwd: dir, timeout: 40000 });
  if (launch?.ok) return { status: "ok", detail: "headless Chromium started and closed" };
  return { status: "fix", detail: `Chromium didn't start: ${cause(launch?.out)}`,
    ladder: selfFix(`\`${pm} exec playwright install chromium\` (Playwright's bundled browser), then run preflight again. Still failing? Treat it as blocked: the download needs the network.`) };
}

// package.json comes from the repo, so its packageManager is never a command by itself.
const MANAGERS = ["npm", "pnpm", "yarn", "bun"];
// With no usable packageManager, the lockfile names the manager, so a yarn project is never told to run npm.
const LOCKS = { "pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn", "bun.lock": "bun", "bun.lockb": "bun" };

/** packageManager as { name, version }: null when unset, { name: null } unless it's a known manager with a plain or prerelease version. */
function readManager(pkg) {
  const field = pkg?.packageManager;
  if (field === undefined || field === null || field === "") return null;
  const [name, version, ...rest] = String(field).split("+")[0].split("@");
  const known = MANAGERS.includes(name) && (version === undefined || SAFE.version.test(version)) && !rest.length;
  return known ? { name, version } : { name: null };
}

function checkVersions(dir, tool, sys, pkg, manager) {
  const range = pkg?.engines?.node ?? ">=22";
  const want = shown(range, "range", "the range in package.json's engines.node");
  const who = pkg?.engines?.node ? "the project" : "the kit";
  const node = shown(sys.node, "version", "(version not shown)");
  if (!satisfies(sys.node, range)) return { status: "blocked", detail: `Node ${node}, ${who} needs ${want}`, ladder: ladder("versions", tool, { want }) };
  if (!manager) return { status: "ok", detail: `Node ${node} (needs ${want})` };
  if (!manager.name) {
    return { status: "limited", detail: `Node ${node} (needs ${want}); unrecognised packageManager in package.json, so none ran. Preflight runs only npm, pnpm, yarn or bun, with a plain or prerelease version` };
  }
  const { name: pm, version: pin } = manager;
  const have = sys.run(pm, ["--version"], { cwd: dir });
  const version = have?.ok ? shown(firstLine(have.out), "version", "(version not shown)") : null;
  // A prerelease pin (4.0.0-rc.42) keeps the name and its probe. Only a plain pin's major is compared.
  const compared = pin !== undefined && /^\d+(\.\d+){0,2}$/.test(pin);
  const note = pin !== undefined && !compared ? ` (pins ${pin}, a prerelease: not compared)` : "";
  if (version && (!compared || version.split(".")[0] === pin.split(".")[0])) return { status: "ok", detail: `Node ${node} (needs ${want}), ${pm} ${version}${note}` };
  return { status: "fix", detail: version ? `${pm} ${version}, the project pins ${pin}` : `${pm} isn't installed`,
    ladder: selfFix(`\`corepack enable && corepack prepare ${pm}@${pin ?? "latest"} --activate\`, then run preflight again.`) };
}

function checkModel(sys, given) {
  const seen = (value, kind) => (value ? shown(value, kind, "unknown") : undefined);
  const model = seen(given.model ?? sys.env.ANTHROPIC_MODEL, "model");
  const effort = seen(given.effort ?? sys.env.CLAUDE_EFFORT, "effort");
  if (!model && !effort) return { status: "info", detail: "not visible to scripts: pass --model and --effort from your own session" };
  return { status: "info", detail: `model ${model ?? "not visible"}, effort ${effort ?? "not visible"}`, model, effort };
}

/** A short hash of what makes this sandbox this sandbox. It moves when the machine, the tool, Node or the project's install settings change. */
export const fingerprint = (parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 12);

function sandboxPrint(dir, tool, sys, pkg) {
  const npmrc = existsSync(join(dir, ".npmrc")) ? readFileSync(join(dir, ".npmrc"), "utf8") : "";
  const flags = ["HTTPS_PROXY", "https_proxy", "CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED", "PLAYWRIGHT_BROWSERS_PATH"].map((k) => Boolean(sys.env[k]));
  return fingerprint({ tool, node: sys.node, hostname: sys.hostname, platform: sys.platform, npmrc, engines: [pkg?.engines?.node, pkg?.packageManager], flags });
}

/** Runs every probe in dir. Returns { tool, checkedAt, fingerprint, ok, results: [{ id, label, status, detail, ladder }] }. */
export async function probe(dir, sys = realSys(), given = {}) {
  const tool = given.tool ?? detectTool(sys.env);
  const pkg = readJson(join(dir, "package.json"));
  const manager = readManager(pkg);
  const pm = manager?.name ?? Object.entries(LOCKS).find(([file]) => existsSync(join(dir, file)))?.[1] ?? "npm";
  const loop = await sys.loopback();
  const found = {
    repo: checkRepo(dir, tool),
    git: checkGit(dir, tool, sys),
    registry: checkRegistry(dir, tool, sys, `${pm} install`),
    github: checkGithub(dir, sys),
    loopback: loop.ok ? { status: "ok", detail: loop.detail } : { status: "blocked", detail: `can't listen on 127.0.0.1: ${loop.detail}`, ladder: ladder("loopback", tool) },
    browser: checkBrowser(dir, tool, sys, pkg, pm),
    versions: checkVersions(dir, tool, sys, pkg, manager),
    model: checkModel(sys, given),
  };
  const results = CHECKS.map((id) => ({ id, label: LABELS[id], ladder: [], ...found[id] }));
  const at = new Date(sys.now()).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z");
  return { tool, checkedAt: at, fingerprint: sandboxPrint(dir, tool, sys, pkg), ok: results.every((r) => r.status !== "fix" && r.status !== "blocked"), results };
}

/** The one table, each failure's ladder, and a draft of the ONE message for whatever the ladder doesn't clear. */
export function render(report) {
  const out = [`Preflight · ${TOOLS[report.tool]} · ${report.checkedAt}`, "", "| Check | Result | Detail |", "|---|---|---|"];
  for (const r of report.results) out.push(`| ${r.label} | ${MARK[r.status]} | ${r.detail.replace(/\s+/g, " ").replaceAll("|", "\\|")} |`);
  const open = report.results.filter((r) => r.status === "fix" || r.status === "blocked");
  const blocked = open.filter((r) => r.status === "blocked");
  if (!open.length) return [...out, "", "Environment: ok."].join("\n");
  out.push("", `${open.length} to fix. Work down each ladder in order, then run preflight again. Ask only for what's left, in ONE message.`);
  if (blocked.some((r) => ["repo", "registry", "versions"].includes(r.id))) out.push("Installs are blocked: don't scaffold or build until they work. Work that needs no install goes on.");
  for (const r of open) out.push("", r.label, ...r.ladder.map((l) => `  ${l.rung}. ${l.text}`));
  if (blocked.length) {
    out.push("", "Still blocked after rungs 1 to 3? Send ONE message. Write all of it, with its Tried line filled in, on the issue",
      "(with issues as files: in the issue's file, under \"## Comments\", plus `needs-human` on its Labels line). Then ping once.",
      "A line in chat or in docs/state.md alone is not the record. The message:", "",
      `Setup step for you · Unblock the agent's sandbox (${TOOLS[report.tool]}) · about 5 minutes`, "",
      ...blocked.map((r, i) => `${i + 1}. ${r.label}: ${r.ladder.at(-1).text.replace(/^The person, last: /, "")}`), "",
      "Tried: <for each one, what you tried on rungs 1 to 3, and why it didn't clear it>",
      "When it worked: the agent runs preflight again and every row shows ✓.");
  }
  return out.join("\n");
}

const RECORD = /^[ \t]*[-*]?[ \t]*\*\*Environment:\*\*[^\n]*$/m;

/** The Environment line of a state file: { ok, open: [ids], fingerprint } or null. */
export function readRecord(text = "") {
  const line = text.match(RECORD)?.[0];
  const m = line && /\*\*Environment:\*\*\s*(ok|open: ([a-z, ]+)) · checked \S+ · \S+ · fp ([0-9a-f]+)/.exec(line);
  return m ? { ok: m[1] === "ok", open: m[2] ? m[2].split(",").map((s) => s.trim()).filter(Boolean) : [], fingerprint: m[3] } : null;
}

/** The text with its Environment line replaced, or added as the first item under the first heading. */
export function withRecord(text, line) {
  if (RECORD.test(text)) return text.replace(RECORD, line);
  const heading = /^#[^\n]*$/m.exec(text);
  if (!heading) return `${line}\n${text}`;
  const end = heading.index + heading[0].length;
  const rest = text.slice(end).replace(/^\n+/, "");
  return `${text.slice(0, end)}\n\n${line}\n${rest.startsWith("- ") ? "" : rest ? "\n" : ""}${rest}`;
}

function recordLine(report) {
  const open = report.results.filter((r) => r.status === "fix" || r.status === "blocked").map((r) => r.id);
  const model = report.results.find((r) => r.id === "model");
  const ran = model.model || model.effort ? ` · model ${model.model ?? "unknown"} · effort ${model.effort ?? "unknown"}` : "";
  return `- **Environment:** ${open.length ? `open: ${open.join(", ")}` : "ok"} · checked ${report.checkedAt} · ${report.tool} · fp ${report.fingerprint}${ran}`;
}

// No shell, ever: on Windows a shell joins the arguments into one unquoted cmd.exe line. So a command
// is found on PATH, and only a .cmd or .bat shim (npm, pnpm, yarn) goes to cmd.exe, with plain words:
// the same route as windowsArgv in the CLI's system.mjs.
/** How run starts a command, always with no shell: { file, args, verbatim? }, or null when it isn't on PATH. */
export function commandFor(cmd, args, { platform = process.platform, env = process.env, execPath = process.execPath } = {}) {
  if (cmd === "node") return { file: execPath, args };
  if (platform !== "win32") return { file: cmd, args };
  const exts = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").toLowerCase().split(";").filter((e) => /^\.(com|exe|bat|cmd)$/.test(e));
  const found = (env.PATH || env.Path || "").split(";").filter(Boolean)
    .flatMap((dir) => exts.map((ext) => join(dir, cmd + ext))).find((f) => existsSync(f) && statSync(f).isFile());
  if (!found) return null;
  if (!/\.(bat|cmd)$/i.test(found)) return { file: found, args };
  if (args.some((a) => !/^[\w.:=/-]+$/.test(a))) throw new Error(`preflight passes only plain words to cmd.exe, not: ${args.join(" ")}`);
  // cmd.exe /s drops the outer quotes, so a path with spaces stays one word. Node's own shell mode does the same.
  return { file: env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `""${found}" ${args.join(" ")}"`], verbatim: true };
}

/** The real session: commands with a timeout, and a round trip on 127.0.0.1. */
export function realSys() {
  return {
    env: process.env, node: process.versions.node, hostname: hostname(), platform: process.platform, now: () => Date.now(),
    run(cmd, args = [], { cwd, timeout = 15000 } = {}) {
      const how = commandFor(cmd, args);
      if (!how) return null;
      const r = spawnSync(how.file, how.args, { cwd, encoding: "utf8", timeout, shell: false, windowsVerbatimArguments: how.verbatim });
      if (r.error?.code === "ENOENT") return null;
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
      return { ok: r.status === 0, out: r.error ? `${out}\n${r.error.message}`.trim() : out };
    },
    loopback: () => new Promise((done) => {
      const server = createServer((socket) => socket.end());
      const finish = (ok, detail) => { clearTimeout(timer); server.close(); done({ ok, detail }); };
      const timer = setTimeout(() => finish(false, "no answer in 3 seconds"), 3000);
      server.on("error", (error) => finish(false, shown(error.code, "code", "an error")));
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        const client = connect(port, "127.0.0.1", () => { client.end(); finish(true, `127.0.0.1:${port}`); });
        client.on("error", (error) => finish(false, shown(error.code, "code", "an error")));
      });
    }),
  };
}

const USAGE = `preflight [dir] [--record] [--if-changed] [--json] [--model <id>] [--effort <level>] [--tool claude|claude-cloud|codex|other]`;

export async function main(argv, { sys = realSys(), log = console.log } = {}) {
  const given = {};
  const flags = new Set();
  let dir = ".";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--model", "--effort", "--tool"].includes(a) && argv[i + 1]) given[a.slice(2)] = argv[++i];
    else if (["--record", "--if-changed", "--json", "--help", "-h"].includes(a)) flags.add(a);
    else if (a.startsWith("-")) return log(`Unknown option: ${shown(a, "flag", "(not printed)")}\nUsage: ${USAGE}`), 2;
    else dir = a;
  }
  if (given.tool && !Object.hasOwn(TOOLS, given.tool)) return log(`--tool is one of: ${Object.keys(TOOLS).join(", ")}`), 2;
  if (flags.has("--help") || flags.has("-h")) return log(`Usage: ${USAGE}`), 0;
  dir = resolve(dir);
  const statePath = join(dir, "docs", "state.md");
  const state = existsSync(statePath) ? readFileSync(statePath, "utf8") : null;

  if (flags.has("--if-changed")) {
    const tool = given.tool ?? detectTool(sys.env);
    const record = readRecord(state ?? "");
    if (record?.ok && record.fingerprint === sandboxPrint(dir, tool, sys, readJson(join(dir, "package.json")))) {
      return log("Environment: ok on record, and nothing changed. Skipped the probes. Run without --if-changed to check again."), 0;
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
