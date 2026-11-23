// init [dir]: install the kit into a project for the first time.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { NEW_SUFFIX, loadKit } from "./kit.mjs";
import { copyProfileIfMissing } from "./profile.mjs";
import { apply, plan, readProjectManifest, report } from "./sync.mjs";

// entry: "idea" or "join", the command to suggest (see start.mjs). Unset: suggest both.
export function init(dir = ".", { kitDir, home, entry, log = console.log } = {}) {
  const projectDir = resolve(dir);
  const kit = loadKit(kitDir);
  const existing = readProjectManifest(projectDir);
  if (existing) {
    log(`The kit (v${existing.kitVersion}) is already installed here. To get v${kit.version}, run: npx onrails update`);
    return 1;
  }
  mkdirSync(projectDir, { recursive: true });
  const actions = plan(projectDir, kit);
  log(`Installing the onRails kit v${kit.version} into ${projectDir}`);
  report(actions, log, ["merge", "offer"]);
  apply(projectDir, kit, actions);
  if (copyProfileIfMissing(projectDir, { home })) log("  copied your profile to docs/profile.toml");
  log("");
  log(nextSteps(actions, entry).join("\n"));
  return 0;
}

function nextSteps(actions, entry) {
  const has = (path) => actions.some((a) => a.path === path && a.alt);
  const lines = [];
  if (has("AGENTS.md")) {
    lines.push("You already had an AGENTS.md, so the kit's is in AGENTS.onrails.md.");
    lines.push("Type /join (Claude Code) or $join (Codex) and it merges the two.");
  }
  if (has(".codex/config.toml")) lines.push("Your .codex/config.toml was kept. Compare it with .codex/config.onrails.toml.");
  if (actions.some((a) => a.type === "offer")) lines.push(`Files you already had were kept. Compare each with its ${NEW_SUFFIX} copy, then delete the ${NEW_SUFFIX}.`);
  if (lines.length) lines.push("");
  lines.push("Next:");
  lines.push("  1. Open Claude Code or Codex in this folder.");
  if (entry === "join") lines.push("  2. This folder already has files, so type /join (Codex: $join).");
  else if (entry === "idea") lines.push("  2. A new app, so type /idea (Codex: $idea).");
  else lines.push("  2. New app: type /idea (Codex: $idea). Existing repo: type /join (Codex: $join).");
  lines.push("  3. In Codex, mark the project as trusted when asked, so .codex/ loads.");
  return lines;
}
