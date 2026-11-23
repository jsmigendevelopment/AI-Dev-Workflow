#!/usr/bin/env node
// Keeps .claude/skills (Claude Code) identical to .agents/skills (Codex, the master copy),
// and .github/ISSUE_TEMPLATE/slice.md identical to the write-issues skill's template.
// Usage:  node scripts/sync-skills.mjs          copy the master copies over the mirrors
//         node scripts/sync-skills.mjs --check  fail if a mirror differs
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SRC = ".agents/skills";
const DEST = ".claude/skills";
const ISSUE_SRC = join(SRC, "write-issues", "templates", "slice.md");
const ISSUE_DEST = ".github/ISSUE_TEMPLATE/slice.md";

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

if (process.argv.includes("--check")) {
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
  if (problems.length) {
    console.error(problems.join("\n") + "\n\nRun: node scripts/sync-skills.mjs");
    process.exit(1);
  }
  console.log(`skills in sync (${a.length} files)`);
} else {
  rmSync(DEST, { recursive: true, force: true });
  cpSync(SRC, DEST, { recursive: true });
  mkdirSync(dirname(ISSUE_DEST), { recursive: true });
  copyFileSync(ISSUE_SRC, ISSUE_DEST);
  console.log(`copied ${SRC} -> ${DEST}`);
  console.log(`copied ${ISSUE_SRC} -> ${ISSUE_DEST}`);
}
