// init --global: copy the four entry skills (idea, join, back, afk) into the person's own
// skills folders, so /idea and /join work in a folder before the kit is installed there.
//   Claude Code: ~/.claude/skills (personal skills)
//   Codex:       ~/.agents/skills (user skills; Codex calls $CODEX_HOME/skills deprecated)
// Never overwrites: a file you already have that differs gets the kit's copy as <file>.onrails-new.
// The plugin (plugin/, marketplace "onrails") is now the recommended way to get the same four
// skills. Don't use both: a personal copy beats the project's copy, the plugin's doesn't.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { hash, hashFile, toNative, writeFile } from "./files.mjs";
import { NEW_SUFFIX, loadKit } from "./kit.mjs";
import { FAIL, OK } from "./marks.mjs";

export const ENTRY_SKILLS = ["idea", "join", "back", "afk"];

// The package name comes from package.json, so a rename touches one file.
const { name: PACKAGE } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const RERUN = `npx ${PACKAGE}@latest init --global`;

export const globalSkillDirs = (home = homedir()) => [
  { label: "~/.claude/skills", dir: join(home, ".claude", "skills") },
  { label: "~/.agents/skills", dir: join(home, ".agents", "skills") },
];

// Every kit file of the entry skills, as [path inside skills/, data].
function entryFiles(kit) {
  const prefix = ".agents/skills/";
  return Object.keys(kit.core)
    .filter((p) => p.startsWith(prefix) && ENTRY_SKILLS.includes(p.slice(prefix.length).split("/")[0]))
    .map((p) => [p.slice(prefix.length), kit.readCore(p)]);
}

export const PLUGIN_TIP = [
  "Tip: the plugin is now the recommended way to get /idea in any folder. From a terminal:",
  "  claude plugin marketplace add jsmigendevelopment/onRails",
  "  claude plugin install core@onrails --scope user",
  "Then start a new Claude Code session.",
  "Use the plugin or init --global, not both. To switch, delete idea, join, back and afk from",
  "~/.claude/skills and ~/.agents/skills.",
];

// tip: false leaves out the plugin tip (update --all runs this for people who already chose).
export function initGlobal({ kitDir, home, log = console.log, tip = true } = {}) {
  const kit = loadKit(kitDir);
  const files = entryFiles(kit);
  if (tip) {
    for (const line of PLUGIN_TIP) log(line);
    log("");
  }
  log(`Copying the entry skills (${ENTRY_SKILLS.join(", ")}) from kit v${kit.version} to your own skills folders`);
  for (const { label, dir } of globalSkillDirs(home)) {
    const counts = { added: 0, unchanged: 0, kept: 0 };
    for (const [path, data] of files) {
      const target = toNative(dir, path);
      const current = hashFile(target);
      if (current === null) writeFile(target, data), counts.added++;
      else if (current === hash(data)) counts.unchanged++;
      else {
        writeFile(`${target}${NEW_SUFFIX}`, data), counts.kept++;
        log(`  yours kept, kit's copy in ${label}/${path}${NEW_SUFFIX}`);
      }
    }
    log(`  ${label}: ${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")}.`);
  }
  log("");
  log("Now /idea and /join (Codex: $idea, $join) work in any folder. In a project with the kit,");
  log("Claude Code runs your personal copy over the project's, so keep them in step: doctor warns when they differ.");
  return 0;
}

// For doctor and update --all: one line per global folder that holds any entry skill, with the skills that differ (stale).
export function globalSkillChecks({ kitDir, home } = {}) {
  let kit;
  try { kit = loadKit(kitDir); } catch { return []; }
  const files = entryFiles(kit);
  const checks = [];
  for (const { label, dir } of globalSkillDirs(home)) {
    const present = ENTRY_SKILLS.filter((s) => files.some(([p]) => p.startsWith(`${s}/`) && hashFile(toNative(dir, p)) !== null));
    if (!present.length) continue;
    const stale = present.filter((s) => files.some(([p, data]) => p.startsWith(`${s}/`) && hashFile(toNative(dir, p)) !== hash(data)));
    checks.push(stale.length
      ? {
        status: FAIL, required: false, stale,
        label: `${label}: ${stale.join(", ")} differ from this CLI's kit v${kit.version}`,
        fix: `Run: ${RERUN}, then compare each ${NEW_SUFFIX} with yours`,
        remedy: { print: [`${RERUN}   (then compare each ${NEW_SUFFIX} with yours and delete it)`] },
      }
      : { status: OK, stale, label: `${label}: entry skills match kit v${kit.version}` });
  }
  return checks;
}
