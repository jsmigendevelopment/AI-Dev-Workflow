// For doctor and update --all: is the onRails plugin installed, and does its version match the project's kit?
// Read-only and offline: it reads the agents' own install records, nothing else.
//   Claude Code: <plugins root>/installed_plugins.json, key "core@onrails". The root is
//                $CLAUDE_CODE_PLUGIN_CACHE_DIR, else $CLAUDE_CONFIG_DIR/plugins, else ~/.claude/plugins.
//   Codex:       $CODEX_HOME (else ~/.codex)/plugins/cache/onrails/or/<version>/.
// Both formats were read from real installs (Claude Code 2.1.330, codex-cli 0.171.0, 2026-11-23).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./files.mjs";
import { FAIL, INFO, OK } from "./marks.mjs";

export const PLUGIN_ID = { claude: "core@onrails", codex: "or@onrails" };

function claudeVersion(home, env) {
  const root = env.CLAUDE_CODE_PLUGIN_CACHE_DIR || join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "plugins");
  const file = join(root, "installed_plugins.json");
  if (!existsSync(file)) return null;
  try {
    const records = readJson(file).plugins?.[PLUGIN_ID.claude];
    return records?.length ? records[0].version ?? "unknown" : null;
  } catch {
    return null; // an unreadable record is Claude Code's to repair; doctor just reports no plugin
  }
}

function codexVersion(home, env) {
  const dir = join(env.CODEX_HOME || join(home, ".codex"), "plugins", "cache", "onrails", "or");
  if (!existsSync(dir)) return null;
  const versions = readdirSync(dir).sort();
  return versions.length ? versions[versions.length - 1] : null;
}

// For update --all: the documented update commands, in order, without the program name.
const TOOLS = [
  { tool: "claude", label: "Claude Code", id: PLUGIN_ID.claude, read: claudeVersion,
    commands: [["plugin", "marketplace", "update", "onrails"], ["plugin", "update", PLUGIN_ID.claude]] },
  { tool: "codex", label: "Codex", id: PLUGIN_ID.codex, read: codexVersion, commands: [["plugin", "marketplace", "upgrade", "onrails"]] },
];

/** Each tool's onRails plugin: { tool, label, id, commands, version } (version null when not installed). */
export const pluginVersions = ({ home, env = {} }) => TOOLS.map(({ read, ...p }) => ({ ...p, version: read(home, env) }));

// kitVersion: the project's kit version, or this CLI's when the project has no kit.
export function pluginChecks({ home, env = {}, kitVersion }) {
  const found = pluginVersions({ home, env }).filter((p) => p.version)
    .map((p) => ({ ...p, update: [p.tool, ...p.commands.at(-1)].join(" ") }));
  if (!found.length) return [{ status: INFO, label: "onRails plugin not installed (optional: it gives you /idea in any folder)" }];
  return found.map((p) => (!kitVersion || p.version === kitVersion
    ? { status: OK, label: `${p.label} plugin ${p.id} v${p.version}${kitVersion ? " matches the kit" : ""}` }
    : {
      status: FAIL, required: false,
      label: `${p.label} plugin ${p.id} is v${p.version}, the kit here is v${kitVersion}`,
      fix: `Harmless: the project's skills win. To update the plugin, run: ${p.update}`,
      remedy: { print: [p.update] },
    }));
}
