// Test helpers: temp folders, captured output and small fake kits for update tests.
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash, toNative, writeFile } from "../src/files.mjs";
import { storedName } from "../src/kit.mjs";

export const tmp = (prefix = "adw-") => mkdtempSync(join(tmpdir(), prefix));

export function logger() {
  const lines = [];
  const log = (...args) => lines.push(args.join(" "));
  log.text = () => lines.join("\n");
  return log;
}

export const read = (dir, path) => readFileSync(toNative(dir, path), "utf8");
export const exists = (dir, path) => existsSync(toNative(dir, path));
export const put = (dir, path, text) => writeFile(toNative(dir, path), text);

// A kit folder with the given core files ({ path: text }); returns its path.
export function makeKit(version, core, packs = {}) {
  const dir = tmp("adw-kit-");
  const shas = {};
  for (const [path, text] of Object.entries(core)) {
    writeFile(toNative(join(dir, "files", "core"), storedName(path)), text);
    shas[path] = hash(Buffer.from(text));
  }
  writeFile(join(dir, "manifest.json"), JSON.stringify({ kitVersion: version, core: shas, packs }));
  return dir;
}
