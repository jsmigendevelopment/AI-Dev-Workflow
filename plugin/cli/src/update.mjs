// update [dir] [--dry-run]: bring an installed kit up to the version bundled in this CLI.
import { resolve } from "node:path";
import { loadKit } from "./kit.mjs";
import { apply, plan, readProjectManifest, report } from "./sync.mjs";

export function update(dir = ".", { dryRun = false, kitDir, log = console.log } = {}) {
  const projectDir = resolve(dir);
  const kit = loadKit(kitDir);
  const old = readProjectManifest(projectDir);
  if (!old) {
    log("The kit isn't installed here (no .ai-dev-workflow.json). Run: npx ai-dev-workflow init");
    return 1;
  }
  const actions = plan(projectDir, kit, old.files);
  log(`${dryRun ? "Plan (dry run, nothing written)" : "Updating"}: kit v${old.kitVersion} -> v${kit.version}`);
  report(actions, log);
  if (dryRun) return 0;
  apply(projectDir, kit, actions);
  if (actions.some((a) => a.type === "kit-new")) {
    log("Compare each .kit-new file with yours, keep what you want, then delete the .kit-new.");
  }
  if (actions.some((a) => a.path === "AGENTS.md" && a.alt && (a.type === "add" || a.type === "replace"))) {
    log("AGENTS.kit.md changed: type /join (Claude Code) or $join (Codex) to merge it into your AGENTS.md.");
  }
  return 0;
}
