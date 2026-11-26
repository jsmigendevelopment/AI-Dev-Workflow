// The outside world doctor talks to, in one object so tests can swap in fakes:
//   platform, isRoot, home, env, cwd
//   has(name)                 is a command on PATH? (a file lookup, no shell)
//   probe(cmd, args, {cwd})   run a read-only check: { ok, out (first line), all } or null
//   exec(argv, {cwd})         run a fix the person said yes to, output shown live: true/false
//   spawnInteractive(argv, {cwd})  hand the terminal to an agent session: its exit code
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

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

// Windows .cmd/.bat shims (npm, pnpm, corepack) only start through cmd.exe. Fix commands are
// fixed strings from this CLI, never user input, so passing them to cmd.exe is safe.
// A full path (update --all finds each tool itself) is used as it is.
function windowsArgv(argv) {
  const found = isAbsolute(argv[0]) ? argv[0] : findCommand(argv[0]);
  if (found && /\.(cmd|bat)$/i.test(found)) return ["cmd.exe", ["/d", "/s", "/c", found, ...argv.slice(1)]];
  return [found ?? argv[0], argv.slice(1)];
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
      const [cmd, args] = platform === "win32" ? windowsArgv(argv) : [argv[0], argv.slice(1)];
      const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
      if (r.error) throw new Error(`Could not start ${argv[0]}: ${r.error.message}`);
      return r.status ?? 1;
    },
    exec(argv, { cwd } = {}) {
      const [cmd, args] = platform === "win32" ? windowsArgv(argv) : [argv[0], argv.slice(1)];
      try {
        execFileSync(cmd, args, { cwd, stdio: "inherit" });
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
