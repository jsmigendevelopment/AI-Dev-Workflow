// add <pack> [dir] [--force] / add --list: copy a bundled stack pack into the project root.
// add <pack>/<addon> [dir] [--force] / add <pack> --list-addons: the same for an optional add-on,
// then print the ADDON.md apply steps that still need doing (edits, installs, migrations).
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
  if (name.includes("/")) return addAddon(name, dir, { force, kitDir, log });
  const kit = loadKit(kitDir);
  const pack = kit.packs[name];
  if (!pack) {
    log(`No stack pack called "${name}". Packs: ${Object.keys(kit.packs).join(", ") || "none"}`);
    return 1;
  }
  const projectDir = resolve(dir);
  const { copied } = copyFiles(pack.files, projectDir, (path) => kit.readPack(name, path), { force, log });
  log(`Copied ${copied} file(s) from the ${name} pack into ${projectDir}.`);
  if (pack.next?.length) {
    log("\nNext:");
    pack.next.forEach((step, i) => log(`  ${i + 1}. ${step}`));
  }
  return 0;
}

// Copies { path: sha } files into projectDir. An existing file is kept unless force; if it differs
// from the kit's copy, it is listed. Returns how many were written and the paths skipped.
function copyFiles(files, projectDir, read, { force, log }) {
  mkdirSync(projectDir, { recursive: true });
  let copied = 0;
  const skipped = [];
  for (const [path, sha] of Object.entries(files)) {
    const abs = toNative(projectDir, path);
    if (existsSync(abs) && !force) {
      if (hashFile(abs) !== sha) skipped.push(path);
      continue;
    }
    writeFile(abs, read(path));
    copied++;
  }
  if (skipped.length) {
    log(`Skipped ${skipped.length} file(s) you already have (run again with --force to overwrite):`);
    for (const path of skipped) log(`  ${path}`);
  }
  return { copied, skipped };
}

export function listAddons(packName, { kitDir, log = console.log } = {}) {
  const kit = loadKit(kitDir);
  if (!kit.packs[packName]) {
    log(`No stack pack called "${packName}". Packs: ${Object.keys(kit.packs).join(", ") || "none"}`);
    return 1;
  }
  const addons = kit.addons[packName] ?? {};
  const names = Object.keys(addons);
  if (!names.length) {
    log(`The ${packName} pack has no add-ons in kit v${kit.version}.`);
    return 0;
  }
  log(`Add-ons for ${packName} in kit v${kit.version} (apply with: npx onrails add ${packName}/<add-on>):`);
  const width = Math.max(...names.map((n) => n.length));
  for (const name of names) log(`  ${name.padEnd(width)}  ${addons[name].summary}`);
  return 0;
}

export function addAddon(spec, dir = ".", { force = false, kitDir, log = console.log } = {}) {
  const kit = loadKit(kitDir);
  const [packName, addonName, ...rest] = spec.split("/");
  const addons = kit.addons[packName];
  const addon = addons?.[addonName];
  if (!addon || rest.length) {
    const known = addons ? Object.keys(addons).map((a) => `${packName}/${a}`).join(", ") : "none";
    log(`No add-on called "${spec}". Add-ons: ${known}`);
    return 1;
  }
  const projectDir = resolve(dir);
  if (!existsSync(toNative(projectDir, "package.json"))) {
    log(`Warning: ${projectDir} has no package.json. Add-ons go into a project made from the ${packName} pack.`);
  }
  const read = (path) => kit.readAddon(packName, addonName, path);
  const { copied, skipped } = copyFiles(addon.files, projectDir, read, { force, log });
  log(`Copied ${copied} file(s) from the ${addonName} add-on into ${projectDir}.`);
  if (addon.apply) {
    const step1 = skipped.length ? "is not finished: see the skipped files above" : "is done";
    log(`\nStill to do (from ADDON.md; step 1, copying the files, ${step1}):\n`);
    log(addon.apply);
    log(`\nThen run the check. Full notes: stacks/${packName}-addons/${addonName}/ADDON.md in the kit repo.`);
  }
  return 0;
}
