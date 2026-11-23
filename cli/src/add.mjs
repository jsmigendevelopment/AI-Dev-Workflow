// add <pack> [dir] [--force] / add --list: copy a bundled stack pack into the project root.
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { hashFile, toNative, writeFile } from "./files.mjs";
import { loadKit } from "./kit.mjs";

export function listPacks({ kitDir, log = console.log } = {}) {
  const kit = loadKit(kitDir);
  const names = Object.keys(kit.packs);
  log(names.length ? `Stack packs in kit v${kit.version}:` : "No stack packs in this kit.");
  for (const name of names) log(`  ${name} (${Object.keys(kit.packs[name].files).length} files)`);
  return 0;
}

export function addPack(name, dir = ".", { force = false, kitDir, log = console.log } = {}) {
  const kit = loadKit(kitDir);
  const pack = kit.packs[name];
  if (!pack) {
    log(`No stack pack called "${name}". Packs: ${Object.keys(kit.packs).join(", ") || "none"}`);
    return 1;
  }
  const projectDir = resolve(dir);
  mkdirSync(projectDir, { recursive: true });
  const copied = [], skipped = [];
  for (const [path, sha] of Object.entries(pack.files)) {
    const abs = toNative(projectDir, path);
    if (existsSync(abs) && !force) {
      if (hashFile(abs) !== sha) skipped.push(path);
      continue;
    }
    writeFile(abs, kit.readPack(name, path));
    copied.push(path);
  }
  log(`Copied ${copied.length} file(s) from the ${name} pack into ${projectDir}.`);
  if (skipped.length) {
    log(`Skipped ${skipped.length} file(s) you already have (run again with --force to overwrite):`);
    for (const path of skipped) log(`  ${path}`);
  }
  if (pack.next?.length) {
    log("\nNext:");
    pack.next.forEach((step, i) => log(`  ${i + 1}. ${step}`));
  }
  return 0;
}
