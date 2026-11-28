// #448: the fakes the update-check tests share. A registry on 127.0.0.1 (never the real one), a project folder that
// holds the check's script, and a temp HOME for ~/.onrails/latest.json. Nothing here reaches the network.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn } from "./child.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const SCRIPT = ".agents/skills/update/scripts/latest.mjs";
export const HOOK = join(REPO, ".claude/hooks/session-start.mjs");

/**
 * A registry that answers /onrails/latest with `version` (and /CHANGELOG.md with `changelog`), or never answers when
 * `hang` is set. It counts the registry requests (`count`) and keeps what each one carried (`seen`).
 */
export async function registry({ version = "0.8.0", changelog = "", hang = false, status = 200 } = {}) {
  const seen = [];
  const sockets = new Set();
  const server = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    if (hang) return;
    if (req.url === "/CHANGELOG.md") return void res.end(changelog);
    res.statusCode = status;
    res.end(JSON.stringify({ name: "onrails", version }));
  });
  server.on("connection", (socket) => sockets.add(socket));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolve) => { sockets.forEach((s) => s.destroy()); server.close(resolve); });
  const count = () => seen.filter((r) => r.url === "/onrails/latest").length;
  return { url, seen, count, close };
}

/** A project with .onrails.json at `kit`, the check's script, and an optional docs/profile.toml and docs/stack.md. */
export function project({ kit = "0.7.1", profile, stack } = {}) {
  const dir = tmp("onrails-latest-");
  put(dir, ".onrails.json", JSON.stringify({ kitVersion: kit }));
  put(dir, SCRIPT, readFileSync(join(REPO, SCRIPT), "utf8"));
  if (profile) put(dir, "docs/profile.toml", profile);
  if (stack) put(dir, "docs/stack.md", stack);
  return dir;
}

/** Runs a node script as a child and waits for it, so this process's own fake registry can answer meanwhile. */
export function run(script, args, { dir, home, reg, env = {} }) {
  const started = Date.now();
  const child = spawn(process.execPath, [script, ...args], {
    cwd: dir,
    env: safeEnv({ HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: dir, NO_PROXY: "127.0.0.1", ONRAILS_REGISTRY: reg?.url ?? "http://127.0.0.1:9",
      ONRAILS_CHANGELOG_URL: reg ? `${reg.url}/CHANGELOG.md` : "http://127.0.0.1:9/CHANGELOG.md", ...env }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  return new Promise((resolve) => child.on("close", (status) => resolve({ stdout, stderr, status, ms: Date.now() - started })));
}

export const line = (dir, home, reg, env) => run(join(dir, SCRIPT), ["line"], { dir, home, reg, env });
