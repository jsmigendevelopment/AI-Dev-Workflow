#!/usr/bin/env node
// `coordinate` step 6.1.3 (#245): runs one of a pull request's own commands behind a fence the operating system
// enforces. Run it from the head's clone (`<dir>`, its working folder), as main's copy from your checkout of main:
//   node <main>/.agents/skills/coordinate/scripts/fence.mjs run --home <home> [--unfenced] -- <command> [args...]
// The fence is bubblewrap on Linux and sandbox-exec on macOS (decision 245-1). Inside it the command can write only to
// the clone and `<home>`, and can't read your checkout of main, the stored logins in your home folder or the per-user
// runtime folder. Before each command it tests the fence from outside (a write that landed, a login file or the runtime
// folder that could be read), so a fence that is missing, broken or faked is never trusted. The command gets only PATH from here: every other variable comes from the
// `env -i` line in the command itself.
// Prints `Fence: <name>` on stderr first, for the `Checks:` comment. Exit: the command's own code when it ran;
// 3: no working fence and no --unfenced, so nothing ran; 2: a usage error.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { constants, homedir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Where a coordinator's tools keep logins and keys, from its home folder. Only the ones that exist are hidden. */
export const LOGIN_STORES = [
  ".ssh", ".gnupg", ".config/gh", ".config/git", ".gitconfig", ".git-credentials", ".netrc", ".npmrc", ".yarnrc.yml",
  ".wrangler", ".config/.wrangler", ".aws", ".azure", ".config/gcloud", ".docker", ".kube", ".claude", ".claude.json",
  ".codex", ".onrails", ".local/share/keyrings", ".password-store", ".pypirc", ".cargo/credentials.toml",
  ".terraform.d", "Library/Keychains",
];
/** The per-user runtime folder (`/run/user/<uid>`): on Linux it holds the session's sockets, the keyring's among them. */
export function runtimeDir(env = process.env, uid = process.getuid?.()) {
  const dir = env.XDG_RUNTIME_DIR || (uid === undefined ? "" : `/run/user/${uid}`);
  try {
    return dir.startsWith("/") && statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}
// The services macOS answers Keychain requests on.
const KEYCHAIN = ["com.apple.SecurityServer", "com.apple.securityd", "com.apple.security.agent"];
const USAGE = "Usage: fence.mjs run --home <home> [--unfenced] -- <command> [args...] (run it in the head's clone)";

const real = (path) => realpathSync(path);
/** True when path is folder or inside it. */
const inside = (path, folder) => {
  const rel = relative(folder, path);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
};
const nested = (a, b) => inside(a, b) || inside(b, a);

/** The program's full path on PATH, or null. */
function onPath(name, path = process.env.PATH ?? "") {
  for (const folder of path.split(delimiter).filter((f) => f.startsWith("/"))) {
    const file = join(folder, name);
    try {
      if (statSync(file).isFile()) return file;
    } catch {
      // Not in this folder: try the next one.
    }
  }
  return null;
}

/** The paths the fence keeps: the clone, `<home>`, your checkout of main, the login stores and the runtime folder. */
export function places({ dir, home, you = homedir(), main = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."), runtime = runtimeDir() }) {
  const p = { dir: real(dir), home: real(home), you: real(you), main: real(main) };
  const stores = LOGIN_STORES.map((s) => join(p.you, s)).filter((s) => {
    try {
      lstatSync(s);
      return true;
    } catch {
      return false;
    }
  }).map((s) => ({ path: real(s), folder: statSync(s).isDirectory() }));
  const run = runtime ? [{ path: real(runtime), folder: true }] : [];
  p.hidden = [{ path: p.main, folder: true }, ...stores, ...run];
  return p;
}

/** Why `<dir>` and `<home>` can't be fenced, or null. A fence around your home or your checkout keeps nothing out. */
export function unsafe(p) {
  for (const [name, path] of [["the working folder (<dir>)", p.dir], ["<home>", p.home]]) {
    if (path === "/" || inside(p.you, path)) return `${name} is ${path}, which holds your home folder: run it in the head's clone.`;
    if (nested(path, p.main)) return `${name} is ${path}, inside or around your checkout of main: run it in the head's clone.`;
    const store = p.hidden.find((h) => inside(path, h.path));
    if (store) return `${name} is ${path}, inside ${store.path}, which the fence hides.`;
  }
  return null;
}

const quote = (path) => {
  if (/["\\\n]/.test(path)) throw new Error(`can't write ${JSON.stringify(path)} into a sandbox profile`);
  return `"${path}"`;
};

/** macOS: the sandbox-exec profile. Writes only to the clone, `<home>` and a few devices; no login store, no Keychain. */
export function profile(p) {
  const deny = p.hidden.map((h) => `(${h.folder ? "subpath" : "literal"} ${quote(h.path)})`).join(" ");
  return [
    "(version 1)",
    "(allow default)",
    `(deny file-write* (require-all (require-not (subpath ${quote(p.dir)})) (require-not (subpath ${quote(p.home)}))` +
      ' (require-not (literal "/dev/null")) (require-not (literal "/dev/tty")) (require-not (literal "/dev/dtracehelper"))' +
      ' (require-not (regex #"^/dev/fd/"))))',
    `(deny file-read* file-write* ${deny})`,
    `(deny mach-lookup ${KEYCHAIN.map((k) => `(global-name "${k}")`).join(" ")})`,
  ].join("\n");
}

/** Linux: bubblewrap's arguments. The whole system read-only, a private /tmp, the clone and `<home>` writable. */
export function bwrapArgs(p) {
  const temps = ["/tmp", "/var/tmp"].filter((t) => existsSync(t));
  // A path under a private temp folder is already gone inside the fence, and bwrap can't mount over it there.
  const hide = p.hidden.filter((h) => !temps.some((t) => inside(h.path, real(t))));
  return [
    "--die-with-parent", "--new-session", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc",
    ...temps.flatMap((t) => ["--tmpfs", t]),
    "--bind", p.dir, p.dir, "--bind", p.home, p.home,
    ...hide.flatMap((h) => (h.folder ? ["--tmpfs", h.path] : ["--ro-bind", "/dev/null", h.path])),
    "--chdir", p.dir, "--",
  ];
}

/** The fence this machine has: `{ name, wrap(argv) }`, or `{ name: null, why }`. */
export function pick(p, { platform = process.platform, path = process.env.PATH } = {}) {
  if (platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) {
    return { name: "sandbox-exec", wrap: (argv) => ["/usr/bin/sandbox-exec", "-p", profile(p), ...argv] };
  }
  if (platform === "linux") {
    const bwrap = onPath("bwrap", path);
    if (bwrap) return { name: "bubblewrap", wrap: (argv) => [bwrap, ...bwrapArgs(p), ...argv] };
    return { name: null, why: "bubblewrap (bwrap) isn't installed" };
  }
  return { name: null, why: `no sandbox this script knows on ${platform}` };
}

// Runs inside the fence. Reads first (a probe file written into a hidden folder would fill it), then writes; says which worked; never prints what it read.
const PROBE = `const fs = require("fs");
const spec = JSON.parse(process.argv[1]);
const read = spec.reads.map((r) => { try {
  return r.folder ? fs.readdirSync(r.path).length > 0 : fs.readFileSync(r.path).length > 0;
} catch { return false; } });
const wrote = spec.writes.map((f) => { try { fs.writeFileSync(f, "probe"); return true; } catch { return false; } });
process.stdout.write(JSON.stringify({ wrote, read }));`;

/** Tests the fence from outside. Returns null when it holds, else why not. Removes every probe file it made. */
export function probe(p, fence, env) {
  const tag = `.onrails-fence-probe-${randomBytes(6).toString("hex")}`;
  const allowed = [join(p.dir, tag), join(p.home, tag)];
  const kept = [p.main, p.you, dirname(p.dir), dirname(p.home)].filter((f, i, all) => all.indexOf(f) === i).map((f) => join(f, tag));
  // Only what holds something from outside counts: an empty file or folder proves nothing either way.
  const reads = p.hidden.filter((h) => {
    try {
      return h.folder ? readdirSync(h.path).length > 0 : readFileSync(h.path).length > 0;
    } catch {
      return false;
    }
  });
  const spec = JSON.stringify({ writes: [...allowed, ...kept], reads: reads.map(({ path, folder }) => ({ path, folder })) });
  const [cmd, ...args] = fence.wrap([process.execPath, "-e", PROBE, spec]);
  const r = spawnSync(cmd, args, { cwd: p.dir, env, encoding: "utf8" });
  const landed = (f) => existsSync(f) && (rmSync(f, { force: true }), true);
  const outside = kept.filter(landed);
  const missing = allowed.filter((f) => !landed(f));
  if (r.error || r.status !== 0) return `${fence.name} didn't start (${firstLine(r.error?.message ?? r.stderr) || `exit ${r.status}`})`;
  if (outside.length) return `${fence.name} let a write through to ${outside.map(dirname).join(", ")}`;
  if (missing.length) return `${fence.name} blocked writes to ${missing.map(dirname).join(", ")}, which the commands need`;
  let seen;
  try {
    seen = JSON.parse(r.stdout).read;
  } catch {
    return `${fence.name}'s check printed something else`;
  }
  const leaked = reads.filter((_, i) => seen[i]).map((h) => h.path);
  if (leaked.length) return `${fence.name} let ${leaked.join(", ")} be read`;
  return null;
}

const firstLine = (text) => String(text ?? "").split("\n").find((l) => l.trim())?.trim() ?? "";

export function main(argv, { platform, path } = {}) {
  const stop = argv.indexOf("--");
  const flags = stop === -1 ? argv : argv.slice(0, stop);
  const command = stop === -1 ? [] : argv.slice(stop + 1);
  const home = flags.includes("--home") ? flags[flags.indexOf("--home") + 1] : undefined;
  if (flags[0] !== "run" || !home || !command.length) return (console.error(USAGE), 2);
  let p;
  try {
    p = places({ dir: process.cwd(), home });
  } catch (error) {
    return (console.error(`fence.mjs: ${error.message}`), 2);
  }
  const bad = unsafe(p);
  if (bad) return (console.error(`fence.mjs: ${bad}`), 2);
  const env = { PATH: process.env.PATH ?? "" };
  const fence = pick(p, { platform, path });
  const why = fence.name ? probe(p, fence, env) : fence.why;
  let argvRun = command;
  if (why) {
    if (!flags.includes("--unfenced")) {
      console.error(`Fence: none (${why}). Nothing ran: with no working fence, follow coordinate step 6.1.3's "No working fence".`);
      return 3;
    }
    console.error(`Fence: none (${why}). Running unfenced, as --unfenced asks: the command can read and change what your OS user can.`);
  } else {
    console.error(`Fence: ${fence.name} (checked: writes reach only the clone and <home>; your checkout of main, your stored logins and the runtime folder can't be read)`);
    argvRun = fence.wrap(command);
  }
  const r = spawnSync(argvRun[0], argvRun.slice(1), { cwd: p.dir, env, stdio: "inherit" });
  if (r.error) return (console.error(`fence.mjs: couldn't start ${command[0]}: ${r.error.message}`), 127);
  // A command ended by a signal exits the way a shell reports it: 128 plus the signal's number.
  return r.status ?? 128 + (constants.signals[r.signal] ?? 0);
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

if (isMainModule()) process.exitCode = main(process.argv.slice(2));
