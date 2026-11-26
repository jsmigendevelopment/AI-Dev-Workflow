// The outside world doctor talks to, in one object so tests can swap in fakes:
//   platform, isRoot, home, env, cwd
//   has(name)                 is a command on PATH? (a file lookup, no shell)
//   probe(cmd, args, {cwd})   run a read-only check: { ok, out (first line), all } or null
//   exec(argv, {cwd})         run a fix the person said yes to, output shown live: true/false
//   spawnInteractive(argv, {cwd})  hand the terminal to an agent session: its exit code
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, win32 } from "node:path";

export function findCommand(name, { env = process.env, platform = process.platform } = {}) {
  const exts = platform === "win32" ? ["", ...(env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")] : [""];
  for (const dir of (env.PATH || env.Path || "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const file = join(dir, name + ext);
      if (existsSync(file) && statSync(file).isFile()) return file;
    }
  }
  return null;
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

export function realSystem() {
  const platform = process.platform;
  return {
    platform,
    isRoot: typeof process.getuid === "function" && process.getuid() === 0,
    home: homedir(),
    env: process.env,
    has: (name) => findCommand(name) !== null,
    probe(cmd, args, { cwd } = {}) {
      // Probes are fixed strings too; the shell lets Windows start .cmd shims.
      const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 15000, shell: platform === "win32" });
      if (r.error || r.status === null) return null;
      const all = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
      return { ok: r.status === 0, out: all.split(/\r?\n/)[0] ?? "", all };
    },
    // Hand the terminal to an interactive program (an agent session) and wait for it to end.
    spawnInteractive(argv, { cwd } = {}) {
      const { file, args, env, verbatim } = launch(argv);
      const r = spawnSync(file, args, { cwd, env, stdio: "inherit", windowsVerbatimArguments: verbatim });
      if (r.error) throw new Error(`Could not start ${argv[0]}: ${r.error.message}`);
      return r.status ?? 1;
    },
    exec(argv, { cwd } = {}) {
      try {
        // Inside the try: a command launch refuses to hand to cmd.exe is a failed fix, shown as one.
        const { file, args, env, verbatim } = launch(argv);
        execFileSync(file, args, { cwd, env, stdio: "inherit", windowsVerbatimArguments: verbatim });
        return true;
      } catch {
        return false;
      }
    },
  };
}

// How a command is shown to the person: exactly what will run.
export function showCommand(argv) {
  return argv.map((a) => (/^[\w@./:=+-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`)).join(" ");
}
