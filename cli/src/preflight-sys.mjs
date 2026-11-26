// Preflight's system layer (#169): how it starts commands, finds them on PATH, stops them, and knows whether
// the person's own session has read this repo. preflight.mjs holds the probes and the output.
// The master copy is scripts/preflight-sys.mjs in the kit; sync-skills.mjs copies it next to each preflight.mjs.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** The file a command name starts, found on PATH (with PATHEXT on Windows), or undefined. Nothing is run. */
function onPath(cmd, platform, env) {
  const win = platform === "win32";
  const exts = win ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").toLowerCase().split(";").filter((e) => /^\.(com|exe|bat|cmd)$/.test(e)) : [""];
  // A relative PATH entry (".", or a bare name) is looked up from the current folder, which is the repo: skipped.
  return (env.PATH || env.Path || "").split(win ? ";" : ":").filter((dir) => dir && isAbsolute(dir))
    .flatMap((dir) => exts.map((ext) => join(dir, cmd + ext))).find((f) => existsSync(f) && statSync(f).isFile());
}

// No shell, ever: on Windows a shell joins the arguments into one unquoted cmd.exe line. So a command
// is found on PATH, and only a .cmd or .bat shim (npm, pnpm, yarn) goes to cmd.exe, with plain words:
// the same route as windowsArgv in the CLI's system.mjs.
/** How run starts a command, always with no shell: { file, args, verbatim? }, or null when it isn't on PATH. */
export function commandFor(cmd, args, { platform = process.platform, env = process.env, execPath = process.execPath } = {}) {
  if (cmd === "node") return { file: execPath, args };
  if (platform !== "win32") return { file: cmd, args };
  const found = onPath(cmd, platform, env);
  if (!found) return null;
  if (!/\.(bat|cmd)$/i.test(found)) return { file: found, args };
  if (args.some((a) => !/^[\w.:=/-]+$/.test(a))) throw new Error(`preflight passes only plain words to cmd.exe, not: ${args.join(" ")}`);
  // cmd.exe /s drops the outer quotes, so a path with spaces stays one word. Node's own shell mode does the same.
  // A bare "cmd.exe" would be looked up in the current folder first, so the fallback is its full path.
  const cmdExe = env.ComSpec || join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  return { file: cmdExe, args: ["/d", "/s", "/c", `""${found}" ${args.join(" ")}"`], verbatim: true };
}

/** The environment every command starts with. */
export function spawnEnv(platform, env) {
  // COREPACK_ENV_FILE=0: corepack's shim never reads a repo's .corepack.env, which can name its registry and turn off its key check.
  const out = { ...env, COREPACK_ENV_FILE: "0" };
  // A .cmd shim (pnpm, yarn) starts a bare `node`, and cmd.exe looks in the current folder first: the repo's node.cmd
  // or node.exe would run. This switch turns that search off for cmd.exe and the programs it starts.
  if (platform === "win32") out.NoDefaultCurrentDirectoryInExePath = "1";
  return out;
}

/** Stops a command and everything it started. On POSIX the command leads its own process group, so the group goes. */
function stopTree(child, platform, env) {
  if (platform === "win32") {
    const taskkill = join(env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    spawnSync(taskkill, ["/pid", String(child.pid), "/T", "/F"], { env: spawnEnv(platform, env), windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    // ESRCH: the group is already empty, which is the goal.
    if (error.code !== "ESRCH") child.kill("SIGKILL");
  }
}

/** Runs one command with a timeout. Resolves { ok, out }, or null when it isn't installed. Nothing it started outlives it. */
function runCommand(cmd, args, { cwd, timeout = 15000, config = [] }, { platform, env, start }) {
  // Git settings from the command line outrank the repo's own .git/config.
  const how = commandFor(cmd, cmd === "git" ? [...config.flatMap((c) => ["-c", c]), ...args] : args, { platform, env });
  if (!how) return Promise.resolve(null);
  const win = platform === "win32";
  return new Promise((done) => {
    let out = "";
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; clearTimeout(timer); done(result); } };
    const child = start(how.file, how.args, { cwd, env: spawnEnv(platform, env), shell: false, windowsVerbatimArguments: how.verbatim,
      windowsHide: true, detached: !win, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      // A version probe can start a self-install that outlives it: the whole tree goes, and the run ends now.
      stopTree(child, platform, env);
      finish({ ok: false, out: `${out.trim()}\nspawn ${cmd} ETIMEDOUT`.trim() });
    }, timeout);
    child.stdout?.on("data", (d) => { out += d; });
    child.stderr?.on("data", (d) => { out += d; });
    child.on("error", (error) => finish(error.code === "ENOENT" ? null : { ok: false, out: `${out.trim()}\n${error.message}`.trim() }));
    // Something it left running in the background goes too. Windows can't find a tree whose root has exited.
    child.on("exit", () => { if (!win) stopTree(child, platform, env); });
    child.on("close", (code) => finish({ ok: code === 0, out: out.trim() }));
  });
}

/** The real session: commands with a timeout, a PATH lookup that runs nothing, and a round trip on 127.0.0.1. */
export function realSys({ platform = process.platform, env = process.env, start = spawn } = {}) {
  return {
    env, node: process.versions.node, hostname: hostname(), platform, now: () => Date.now(),
    has: (cmd) => Boolean(onPath(cmd, platform, env)),
    run: (cmd, args = [], opts = {}) => runCommand(cmd, args, opts, { platform, env, start }),
    loopback: () => new Promise((done) => {
      const server = createServer((socket) => socket.end());
      const finish = (ok, detail) => { clearTimeout(timer); server.close(); done({ ok, detail }); };
      const timer = setTimeout(() => finish(false, "no answer in 3 seconds"), 3000);
      const code = (error) => (/^E[A-Z0-9_]{2,30}$/.test(String(error.code)) ? error.code : "an error");
      server.on("error", (error) => finish(false, code(error)));
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        const client = connect(port, "127.0.0.1", () => { client.end(); finish(true, `127.0.0.1:${port}`); });
        client.on("error", (error) => finish(false, code(error)));
      });
    }),
  };
}

// The read marker (#169). docs/state.md can ship with a repo, so it can't say the person's session has read it.
// The marker lives in the repo's shared .git folder, which git clone never copies. It names that folder's path and
// its device and inode numbers, so a .git folder unpacked from an archive with a marker in it still reads as not read.
const MARKER = "onrails-read";

/** A small regular file's text, or "". */
function small(path) {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size < 4096 ? readFileSync(path, "utf8") : "";
}
const same = (a, b) => existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b);

/** A linked worktree's shared .git folder. A .git file can name any folder, so only an admin folder that names it back counts. */
function linkedGitDir(file) {
  const own = /^gitdir: (.+)$/m.exec(small(file))?.[1]?.trim();
  if (!own) return null;
  const admin = resolve(dirname(file), own);
  const back = small(join(admin, "gitdir")).trim();
  const common = small(join(admin, "commondir")).trim();
  return back && common && same(resolve(admin, back), file) ? resolve(admin, common) : null;
}

/** The repo's shared .git folder for dir, found without running git, or null. */
export function gitDir(dir) {
  if (!existsSync(dir)) return null;
  for (let at = realpathSync(dir); ; at = dirname(at)) {
    const dot = join(at, ".git");
    if (existsSync(dot)) return statSync(dot).isDirectory() ? realpathSync(dot) : linkedGitDir(dot);
    if (dirname(at) === at) return null;
  }
}

const stamp = (git) => {
  const { dev, ino } = statSync(git, { bigint: true });
  return `onrails read ${createHash("sha256").update(`${git}\n${dev}:${ino}`).digest("hex").slice(0, 24)}\n`;
};

/** True when the person's own session marked this repo read on this machine. */
export function isRead(dir) {
  const git = gitDir(dir);
  return Boolean(git) && small(join(git, MARKER)) === stamp(git);
}

/** Writes the marker. Returns false when there's no .git folder to write it in. */
export function markRead(dir) {
  const git = gitDir(dir);
  if (!git) return false;
  writeFileSync(join(git, MARKER), stamp(git));
  return true;
}
