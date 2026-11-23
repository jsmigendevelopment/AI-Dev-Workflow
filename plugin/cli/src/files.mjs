// Shared file helpers. Paths inside manifests always use "/"; toNative turns them into
// real paths for this OS, so the CLI works the same on Windows, macOS and Linux.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export function toNative(root, posixPath) {
  return join(root, ...posixPath.split("/"));
}

export function toPosix(path) {
  return path.split(sep).join("/");
}

// Text files hash with CRLF read as LF, so a Windows checkout doesn't look like a user edit.
export function hash(buffer) {
  const text = !buffer.includes(0);
  const data = text ? Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : buffer;
  return createHash("sha256").update(data).digest("hex");
}

export function hashFile(path) {
  return existsSync(path) && statSync(path).isFile() ? hash(readFileSync(path)) : null;
}

export function writeFile(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

// Every file under dir, as "/" paths relative to dir. skip(name) prunes files and folders.
export function walk(dir, skip = () => false) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (skip(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, skip).map((p) => `${name}/${p}`));
    else out.push(name);
  }
  return out;
}

// After deleting a file, remove the folders it leaves empty, never going above root.
export function pruneEmptyDirs(root, file) {
  let dir = dirname(file);
  while (relative(root, dir) && !relative(root, dir).startsWith("..")) {
    if (readdirSync(dir).length) return;
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
