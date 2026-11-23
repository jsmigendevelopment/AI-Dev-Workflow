// Helpers for scenario fixtures: tiny git repos built from code, so nothing nested is committed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Runs git in dir and returns its trimmed stdout. Throws on a non-zero exit. */
export function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Writes { path: text } under dir, making folders as needed. */
export function write(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

/** A new repo on `main` with a fixed author, holding files, with one commit. Returns the commit sha. */
export function repo(dir, files, message = "Start") {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--quiet", "--initial-branch=main");
  git(dir, "config", "user.name", "Eval Fixture");
  git(dir, "config", "user.email", "fixture@example.invalid");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, files);
  return commit(dir, message);
}

/** Stages everything and commits. Returns the new sha. */
export function commit(dir, message) {
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "--no-verify", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Every file under dir as a "/" path, skipping .git. */
export function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(full.slice(base.length + 1).split("\\").join("/"));
  }
  return out.sort();
}

export const readText = (dir, path) => {
  try {
    return readFileSync(join(dir, path), "utf8");
  } catch {
    return null;
  }
};
