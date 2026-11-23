// The kit bundled inside this package (cli/kit/, made by scripts/bundle.mjs).
// kit/manifest.json lists every file as a "/" path with its sha256:
//   { kitVersion, core: { path: sha }, packs: { name: { files: { path: sha }, next: [..] } },
//     addons: { pack: { addon: { summary, apply, files: { path: sha } } } } }
// Files live under kit/files/core/<path>, kit/files/stacks/<pack>/<path> and
// kit/files/addons/<pack>/<addon>/<path>.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readJson, toNative } from "./files.mjs";

export const DEFAULT_KIT_DIR = fileURLToPath(new URL("../kit/", import.meta.url));
// The record of what was installed. Projects set up before the rename to onRails have the
// old name; it is read when the new one is missing, and update offers to rename it.
export const PROJECT_MANIFEST = ".onrails.json";
export const OLD_PROJECT_MANIFEST = ".ai-dev-workflow.json";
// The kit's copy of a file you already have goes next to it with this suffix.
export const NEW_SUFFIX = ".onrails-new";
export const OLD_NEW_SUFFIX = ".kit-new";

// npm drops or obeys files like .gitignore inside a package, so they are stored renamed.
const NPM_SPECIAL = new Set([".gitignore", ".npmignore", ".npmrc"]);

export function storedName(posixPath) {
  const parts = posixPath.split("/");
  const base = parts.pop();
  return [...parts, NPM_SPECIAL.has(base) ? `_kit_${base.slice(1)}` : base].join("/");
}

export function loadKit(kitDir = DEFAULT_KIT_DIR) {
  const manifestPath = join(kitDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`The bundled kit is missing (${manifestPath}). In a source checkout, run: npm run bundle`);
  }
  const manifest = readJson(manifestPath);
  return {
    dir: kitDir,
    version: manifest.kitVersion,
    core: manifest.core,
    packs: manifest.packs,
    addons: manifest.addons ?? {},
    readCore: (path) => readFileSync(toNative(join(kitDir, "files", "core"), storedName(path))),
    readPack: (pack, path) => readFileSync(toNative(join(kitDir, "files", "stacks", pack), storedName(path))),
    readAddon: (pack, addon, path) =>
      readFileSync(toNative(join(kitDir, "files", "addons", pack, addon), storedName(path))),
  };
}
