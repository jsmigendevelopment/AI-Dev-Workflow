// update [dir] [--dry-run] [--yes]: bring an installed kit up to the version bundled in this CLI.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { NEW_SUFFIX, OLD_PROJECT_MANIFEST, PROJECT_MANIFEST, loadKit } from "./kit.mjs";
import { toNative } from "./files.mjs";
import { FULL_OVERRIDE_KIT, fullOnOldKit, olderThan } from "./full-kit.mjs";
import { confirm } from "./prompt.mjs";
import { apply, oldKitNewFiles, plan, projectManifestName, readProjectManifest, report } from "./sync.mjs";

export async function update(dir = ".", { dryRun = false, kitDir, ask, yes = false, log = console.log } = {}) {
  const projectDir = resolve(dir);
  const kit = loadKit(kitDir);
  const old = readProjectManifest(projectDir);
  if (!old) {
    log(`The kit isn't installed here (no ${PROJECT_MANIFEST}). Run: npx onrails init`);
    return 1;
  }
  const actions = plan(projectDir, kit, old.files);
  log(`${dryRun ? "Plan (dry run, nothing written)" : "Updating"}: kit v${old.kitVersion} -> v${kit.version}`);
  report(actions, log);
  const oldFull = fullOnOldKit(projectDir, old.kitVersion);
  if (oldFull) {
    log(`${oldFull}. ${olderThan(kit.version, FULL_OVERRIDE_KIT) ? `This CLI has v${kit.version}. Run: npx onrails@latest update` : `This update brings v${kit.version}.`}`);
  }
  const oldName = projectManifestName(projectDir) === OLD_PROJECT_MANIFEST;
  if (dryRun) {
    if (oldName) log(`The kit's record is still ${OLD_PROJECT_MANIFEST}. update will offer to rename it ${PROJECT_MANIFEST}.`);
    return 0;
  }
  const rename = oldName && await offerManifestRename({ ask, yes, log });
  apply(projectDir, kit, actions, oldName && !rename ? OLD_PROJECT_MANIFEST : PROJECT_MANIFEST);
  if (rename) rmSync(toNative(projectDir, OLD_PROJECT_MANIFEST));
  nextSteps(projectDir, actions, log);
  return 0;
}

async function offerManifestRename({ ask, yes, log }) {
  log(`This project's kit record has the name from before the rename to onRails: ${OLD_PROJECT_MANIFEST}.`);
  if (yes || (ask && (await confirm(ask, `Rename it ${PROJECT_MANIFEST}? Commit the change.`)))) {
    log(`Renamed ${OLD_PROJECT_MANIFEST} to ${PROJECT_MANIFEST}.`);
    return true;
  }
  log(`Kept ${OLD_PROJECT_MANIFEST}. It still works. To rename it later: npx onrails update --yes`);
  return false;
}

function nextSteps(projectDir, actions, log) {
  if (actions.some((a) => a.type === "offer")) {
    log(`Compare each ${NEW_SUFFIX} file with yours, keep what you want, then delete the ${NEW_SUFFIX}.`);
  }
  const leftover = oldKitNewFiles(projectDir, actions);
  if (leftover.length) {
    log(`Still waiting from before the rename (same idea, old name): ${leftover.join(", ")}. Compare each with yours, then delete it.`);
  }
  if (actions.some((a) => a.path === "AGENTS.md" && a.alt && (a.type === "add" || a.type === "replace"))) {
    log("AGENTS.onrails.md changed: type /join (Claude Code) or $join (Codex) to merge it into your AGENTS.md.");
  }
  const kept = actions.filter((a) => a.renamedTo && a.type === "orphan");
  for (const a of kept) log(`You edited ${a.target}, so it was kept. The kit's copy is now ${a.renamedTo}. Merge with /join, then delete ${a.target}.`);
}
