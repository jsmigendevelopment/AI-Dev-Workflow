// research-library init <dir>: copy the template research library (templates/research-library in
// the kit) into a new folder. It never overwrites: a folder that already has a manifest is refused.
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { toNative, writeFile } from "./files.mjs";
import { loadKit } from "./kit.mjs";

export const TEMPLATE = "research-library";

export function libraryInit(dir, { kitDir, log = console.log } = {}) {
  if (!dir) return log("Name a folder, e.g.: npx onrails research-library init ../research-library"), 2;
  const kit = loadKit(kitDir);
  const files = kit.templates[TEMPLATE];
  if (!files) return log(`This kit (v${kit.version}) has no ${TEMPLATE} template.`), 1;
  const target = resolve(dir);
  if (existsSync(toNative(target, "research-library.json"))) return log(`${target} already has research-library.json. Nothing copied.`), 1;
  const clash = Object.keys(files).filter((path) => existsSync(toNative(target, path)));
  if (clash.length) {
    log(`${target} already has ${clash.length} of the template's files. Nothing copied:`);
    for (const path of clash) log(`  ${path}`);
    return 1;
  }
  const wasEmpty = !existsSync(target) || !readdirSync(target).length;
  for (const path of Object.keys(files)) writeFile(toNative(target, path), kit.readTemplate(TEMPLATE, path));
  log(`Copied the research library template (${Object.keys(files).length} files) into ${target}.`);
  log("\nNext, in that folder:");
  if (wasEmpty) log("  1. git init -b main && git add -A && git commit -m \"Start the research library\"");
  else log("  1. Commit the new files.");
  log("  2. gh repo create <owner>/<name> --private --source . --push   (private: never public)");
  log("  3. In ~/.onrails/profile.toml, under [research]: library = \"<owner>/<name>\" and library_path = this folder.");
  return 0;
}
