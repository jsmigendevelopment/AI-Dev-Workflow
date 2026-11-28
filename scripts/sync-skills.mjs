#!/usr/bin/env node
// Keeps .claude/skills (Claude Code) identical to .agents/skills (Codex, the master copy),
// .github/ISSUE_TEMPLATE/slice.md identical to the issues skill's template, and the copies in COPIES
// (sync-copies.mjs) identical to their masters.
// It also writes the plugin's skills: the starter skills (plugin/skills/<name>/SKILL.md), each the master's
// frontmatter plus the hand-off step in scripts/plugin-handoff.md, and plain copies of PLUGIN_COPIES.
// Usage:  node scripts/sync-skills.mjs          copy the master copies over the mirrors
//         node scripts/sync-skills.mjs --check  fail if a mirror differs
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { COPIES, SRC } from "./sync-copies.mjs";

const DEST = ".claude/skills";
const ISSUE_SRC = join(SRC, "issues", "templates", "slice.md");
const ISSUE_DEST = ".github/ISSUE_TEMPLATE/slice.md";

// The plugin's entry skills: what to add when the kit is missing (step 3 of the hand-off),
// and which project skill to follow once it's in (step 5).
const START = "`.agents/skills/idea/SKILL.md` for a new app, or `.agents/skills/join/SKILL.md` for a repo that already has code";
const PLUGIN_SKILLS = {
  idea: { note: "", next: "`.agents/skills/idea/SKILL.md`" },
  join: { note: "", next: "`.agents/skills/join/SKILL.md`" },
  back: { note: "There's nothing to pick up yet, so suggest `/idea` for a new app or `/join` for a repo that already has code.", next: START },
  afk: { note: "There's no build loop to keep going yet, so suggest `/idea` for a new app or `/join` for a repo that already has code.", next: START },
};
const PLUGIN_DEST = "plugin/skills";
const HANDOFF = "scripts/plugin-handoff.md";

function pluginSkill(name) {
  const master = readFileSync(join(SRC, name, "SKILL.md"), "utf8");
  const front = master.match(/^---\n[\s\S]*?\n---\n/);
  if (!front) throw new Error(`${SRC}/${name}/SKILL.md has no frontmatter`);
  const { note, next } = PLUGIN_SKILLS[name];
  const body = readFileSync(HANDOFF, "utf8").replaceAll("{{name}}", name).replaceAll(" {{noKitNote}}", note ? ` ${note}` : "").replaceAll("{{next}}", next);
  const header = `<!-- Made by scripts/sync-skills.mjs from ${SRC}/${name}/SKILL.md and ${HANDOFF}. Edit those, then run it. -->\n\n`;
  return front[0] + "\n" + header + body;
}

// Plugin skills that work the same with or without the kit, so the plugin ships the master as it is (#178).
const PLUGIN_COPIES = ["update"];

/** Every plugin skill file, as [path, text]: the hand-off skills, then the plain copies. */
function pluginFiles() {
  const handoff = Object.keys(PLUGIN_SKILLS).map((name) => [join(PLUGIN_DEST, name, "SKILL.md"), pluginSkill(name), HANDOFF]);
  const copies = PLUGIN_COPIES.flatMap((name) => files(join(SRC, name)).map((f) => [join(PLUGIN_DEST, relative(SRC, f)), readFileSync(f, "utf8"), f]));
  return [...handoff, ...copies];
}

function pluginProblems() {
  const want = pluginFiles();
  const problems = want.filter(([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text).map(([path, , from]) => `differs: ${path} (made from ${from})`);
  const extra = files(PLUGIN_DEST).filter((f) => !want.some(([path]) => path === f));
  return [...problems, ...extra.map((f) => `not made by this script: ${f}`)];
}

function writePluginSkills() {
  rmSync(PLUGIN_DEST, { recursive: true, force: true });
  for (const [path, text] of pluginFiles()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

if (process.argv.includes("--check")) {
  const copyProblems = COPIES.filter(([from, to]) => !existsSync(to) || !readFileSync(from).equals(readFileSync(to))).map(([from, to]) => `differs: ${to} (master: ${from})`);
  const a = files(SRC).map((f) => relative(SRC, f)).sort();
  const b = files(DEST).map((f) => relative(DEST, f)).sort();
  const problems = [];
  for (const f of new Set([...a, ...b])) {
    const inA = a.includes(f), inB = b.includes(f);
    if (!inA) problems.push(`only in ${DEST}: ${f}`);
    else if (!inB) problems.push(`only in ${SRC}: ${f}`);
    else if (!readFileSync(join(SRC, f)).equals(readFileSync(join(DEST, f)))) problems.push(`differs: ${f}`);
  }
  if (!existsSync(ISSUE_DEST) || !readFileSync(ISSUE_SRC).equals(readFileSync(ISSUE_DEST))) problems.push(`differs: ${ISSUE_DEST} (master: ${ISSUE_SRC})`);
  problems.push(...copyProblems, ...pluginProblems());
  if (problems.length) {
    console.error(problems.join("\n") + "\n\nRun: node scripts/sync-skills.mjs");
    process.exit(1);
  }
  console.log(`skills in sync (${a.length} files, ${Object.keys(PLUGIN_SKILLS).length + PLUGIN_COPIES.length} plugin skills)`);
} else {
  for (const [from, to] of COPIES) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  rmSync(DEST, { recursive: true, force: true });
  cpSync(SRC, DEST, { recursive: true });
  mkdirSync(dirname(ISSUE_DEST), { recursive: true });
  copyFileSync(ISSUE_SRC, ISSUE_DEST);
  console.log(`copied ${SRC} -> ${DEST}`);
  console.log(`copied ${ISSUE_SRC} -> ${ISSUE_DEST}`);
  writePluginSkills();
  console.log(`made ${PLUGIN_DEST}/{${[...Object.keys(PLUGIN_SKILLS), ...PLUGIN_COPIES].join(",")}}`);
}
