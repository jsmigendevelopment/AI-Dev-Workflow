// init [dir]: install the kit into a project for the first time.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadKit } from "./kit.mjs";
import { apply, plan, readProjectManifest, report } from "./sync.mjs";

export function init(dir = ".", { kitDir, log = console.log } = {}) {
  const projectDir = resolve(dir);
  const kit = loadKit(kitDir);
  const existing = readProjectManifest(projectDir);
  if (existing) {
    log(`The kit (v${existing.kitVersion}) is already installed here. To get v${kit.version}, run: npx ai-dev-workflow update`);
    return 1;
  }
  mkdirSync(projectDir, { recursive: true });
  const actions = plan(projectDir, kit);
  log(`Installing the AI-Dev-Workflow kit v${kit.version} into ${projectDir}`);
  report(actions, log, ["merge", "kit-new"]);
  apply(projectDir, kit, actions);
  log("");
  log(nextSteps(actions).join("\n"));
  return 0;
}

function nextSteps(actions) {
  const has = (path) => actions.some((a) => a.path === path && a.alt);
  const lines = [];
  if (has("AGENTS.md")) {
    lines.push("You already had an AGENTS.md, so the kit's is in AGENTS.kit.md.");
    lines.push("Type /join (Claude Code) or $join (Codex) and it merges the two.");
  }
  if (has(".codex/config.toml")) lines.push("Your .codex/config.toml was kept. Compare it with .codex/config.kit.toml.");
  if (actions.some((a) => a.type === "kit-new")) lines.push("Files you already had were kept. Compare each with its .kit-new copy, then delete the .kit-new.");
  if (lines.length) lines.push("");
  lines.push("Next:");
  lines.push("  1. Open Claude Code or Codex in this folder.");
  lines.push("  2. New app: type /idea (Codex: $idea). Existing repo: type /join (Codex: $join).");
  lines.push("  3. In Codex, mark the project as trusted when asked, so .codex/ loads.");
  return lines;
}
