// The outside world doctor talks to, in one object so tests can swap in fakes:
//   platform, isRoot, home, env, cwd
//   where(name)               toolPath's answer: { path } it may run, or { why } (and { found }) when it may not
//   has(name)                 may a command run? (where's file lookup, no shell)
//   probe(cmd, args, {cwd})   run a read-only check: { ok, out (first line), all, stdout } or null
//   exec(argv, {cwd})         run a fix the person said yes to, output shown live: true/false
//   spawnInteractive(argv, {cwd})  hand the terminal to an agent session: its exit code
// probe and exec run a command only by the full path toolPath finds, never one a project ships (#185).
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { projectManifestName } from "./sync.mjs";

// The file names a command can have. On Windows only a PATHEXT one, as cmd.exe runs it: npm and corepack put an
// extension-less sh script next to each .cmd shim, and Node can't start that script (#185).
function names(name, { env, platform }) {
  if (platform !== "win32") return [name];
  const exts = (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return exts.some((ext) => name.toLowerCase().endsWith(ext.toLowerCase())) ? [name] : exts.map((ext) => name + ext);
}

export function findCommand(name, { env = process.env, platform = process.platform } = {}) {
  const files = names(name, { env, platform });
  for (const dir of (env.PATH || env.Path || "").split(delimiter)) {
    if (!dir) continue;
    for (const fileName of files) {
      const file = join(dir, fileName);
      if (existsSync(file) && statSync(file).isFile()) return file;
    }
  }
  return null;
}

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

/** The nearest folder at or above dir that is an onRails project, by real path, or null. A filesystem root never is. */
export function nearestProject(dir) {
  for (let at = realDir(dir) ?? resolve(dir); dirname(at) !== at; at = dirname(at)) if (projectManifestName(at)) return at;
  return null;
}

// The project, the current folder and the nearest project at or above each, by real path: a terminal is often in
// a subfolder. A filesystem root is never one, and neither is the home folder or a folder that holds it (/home)
// unless it is an onRails project: a terminal opens in ~, and ~/.local/bin or an nvm folder there is where claude and
// codex live. A project that holds HOME (a sandbox or CI job can set HOME inside it) stays a root, so its own claude
// never runs. That includes ~ itself as a project: its tools are skipped too.
function projectRoots(projectDir, home) {
  const realHome = realDir(home) ?? resolve(home);
  const dropped = (dir) => dirname(dir) === dir || (within(realHome, dir) && !projectManifestName(dir));
  const roots = [[projectDir, "this project"], [process.cwd(), "the current folder"]]
    .flatMap(([dir, label]) => [{ dir: realDir(dir), label }, { dir: nearestProject(dir), label: "this project" }])
    .filter(({ dir }) => dir && !dropped(dir));
  return { roots, home: realHome };
}

// Why a PATH entry is skipped ({ why, mine }), or null to search it. The node_modules/.bin test runs on the real path
// too, so ".bin/." and "./.bin" are caught: npx puts the current folder's and each ancestor's first. mine: every root
// that holds it is ~ as a project, where ~/.local/bin may be the person's own. Anywhere else a project can ship it.
function skipped(entry, { roots, home }) {
  if (!isAbsolute(entry)) return { why: "in a relative PATH entry" };
  const dir = realDir(entry);
  if (!dir) return { why: "missing" };
  if (BIN.test(entry) || BIN.test(dir)) return { why: "in a node_modules/.bin" };
  const inside = roots.filter((r) => within(dir, r.dir));
  return inside.length ? { why: `inside ${inside[0].label}`, mine: inside.every((r) => r.dir === home) } : null;
}

/**
 * The tool's full path on PATH, never a copy a project ships: { path } or { why }, plus { found, mine } when only a
 * skipped entry has it. update --all (#178) and every command doctor runs (#185) find their tools with it.
 */
export function toolPath(name, sys, projectDir) {
  const roots = projectRoots(projectDir, sys.home);
  const look = (PATH) => findCommand(name, { env: { PATH, PATHEXT: sys.env.PATHEXT }, platform: sys.platform });
  const entries = (sys.env.PATH || sys.env.Path || "").split(delimiter).filter(Boolean)
    .map((entry) => ({ entry, skip: skipped(entry, roots) }));
  const path = look(entries.filter((e) => !e.skip).map((e) => e.entry).join(delimiter));
  if (path) return { path };
  const hit = entries.find((e) => e.skip && e.skip.why !== "missing" && look(e.entry));
  if (!hit) return { why: `${name} isn't on your PATH` };
  return { why: `${name} found only ${hit.skip.why}, not run`, found: look(hit.entry), mine: hit.skip.mine };
}

// How exec and spawnInteractive start argv, with no shell: { file, args, env, verbatim? }.
// Windows .cmd/.bat shims (npm, pnpm, corepack, an npm-installed claude) only start through cmd.exe. Fix commands
// are fixed strings from this CLI, never user input, and only plain words reach cmd.exe. A full path (update --all
// finds each tool itself) is used as it is. As in preflight's commandFor (decision 63), cmd.exe goes by its full
// path, since a bare name is looked up in the current folder first, and gets one verbatim line with the path quoted:
// /s drops the line's outer quotes, so a path with a space stays one word. NoDefaultCurrentDirectoryInExePath stops
// the current-folder lookup for the bare `node` a shim starts, and for everything the started program runs.
export function launch(argv, { platform = process.platform, env = process.env } = {}) {
  if (platform !== "win32") return { file: argv[0], args: argv.slice(1), env };
  const found = win32.isAbsolute(argv[0]) ? argv[0] : findCommand(argv[0], { env, platform });
  const winEnv = { ...env, NoDefaultCurrentDirectoryInExePath: "1" };
  if (!found || !/\.(cmd|bat)$/i.test(found)) return { file: found ?? argv[0], args: argv.slice(1), env: winEnv };
  const args = argv.slice(1);
  if (args.some((a) => !/^[\w.:=/@$+,-]+$/.test(a))) throw new Error(`only plain words go to cmd.exe, not: ${args.join(" ")}`);
  // The path comes from the person's PATH, and cmd.exe expands %NAME% even inside quotes.
  if (found.includes("%")) throw new Error(`cmd.exe would expand the % in ${found}`);
  const cmdExe = env.ComSpec || win32.join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  return { file: cmdExe, args: ["/d", "/s", "/c", `""${found}" ${args.join(" ")}"`], env: winEnv, verbatim: true };
}

// projectDir is the project doctor checks: toolPath skips PATH entries inside it, and inside the current folder.
// platform, env and run (spawnSync) are for tests: a fake Windows, where nothing starts.
export function realSystem({ projectDir = process.cwd(), platform = process.platform, env = process.env, run = spawnSync } = {}) {
  const sys = {
    platform,
    isRoot: typeof process.getuid === "function" && process.getuid() === 0,
    home: homedir(),
    env,
  };
  // Where a command may run from: toolPath's answer for a bare name. has, probe, exec, spawnInteractive and the
  // process check all use it, so the plan doctor --fix shows and the run can't disagree.
  const where = (name) => toolPath(name, sys, projectDir);
  // How argv starts: by full path through launch, with no shell (a .cmd shim through cmd.exe). null when the command
  // is found only where a project could have put it, or launch won't hand its words to cmd.exe.
  const start = ([cmd, ...args]) => {
    const file = isAbsolute(cmd) ? cmd : where(cmd).path;
    if (!file) return null;
    try {
      return launch([file, ...args], { platform, env });
    } catch {
      return null; // shown as a missing tool or a failed fix, the same as one that isn't there
    }
  };
  return {
    ...sys,
    where,
    has: (name) => Boolean(where(name).path),
    probe(cmd, args, { cwd } = {}) {
      const how = start([cmd, ...args]);
      if (!how) return null;
      const r = run(how.file, how.args, { cwd, env: how.env, encoding: "utf8", timeout: 15000, windowsVerbatimArguments: how.verbatim });
      if (r.error || r.status === null) return null;
      const all = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
      return { ok: r.status === 0, out: all.split(/\r?\n/)[0] ?? "", all, stdout: (r.stdout ?? "").trim() };
    },
    // Hand the terminal to an interactive program (an agent session) and wait for it to end.
    spawnInteractive(argv, { cwd } = {}) {
      const how = start(argv);
      if (!how) throw new Error(`Could not start ${argv[0]}: ${where(argv[0]).why ?? "it can't run here"}`);
      const r = run(how.file, how.args, { cwd, env: how.env, stdio: "inherit", windowsVerbatimArguments: how.verbatim });
      if (r.error) throw new Error(`Could not start ${argv[0]}: ${r.error.message}`);
      return r.status ?? 1;
    },
    exec(argv, { cwd } = {}) {
      const how = start(argv);
      if (!how) return false;
      const r = run(how.file, how.args, { cwd, env: how.env, stdio: "inherit", windowsVerbatimArguments: how.verbatim });
      return !r.error && r.status === 0;
    },
  };
}

// How a command is shown to the person: exactly what will run.
export function showCommand(argv) {
  return argv.map((a) => (/^[\w@./:=+-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`)).join(" ");
}
