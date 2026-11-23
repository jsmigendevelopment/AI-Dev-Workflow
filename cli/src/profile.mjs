// profile init | show | copy [dir]: the person's own defaults, kept at
// ~/.ai-dev-workflow/profile.toml and copied into projects as docs/profile.toml.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { toNative, writeFile } from "./files.mjs";
import { loadKit } from "./kit.mjs";
import { askDefault, confirm } from "./prompt.mjs";

export const TEMPLATE = ".agents/skills/idea/templates/profile.toml";
export const profilePath = (home = homedir()) => join(home, ".ai-dev-workflow", "profile.toml");

const QUESTIONS = [
  ["github_owner", "GitHub account or organisation for new repos"],
  ["github_plan", "GitHub plan", ["free", "team", "enterprise"]],
  ["naming_style", "Naming style for apps (e.g. one lowercase word, festival themed)"],
  ["strongest", "Strongest model (planning, research)"],
  ["everyday", "Everyday model (building, reviews)"],
  ["creative", "Creative model (art, copy)"],
  ["second_opinion", "Second-opinion model from another vendor"],
];

// Set key = "value" on the template line for key, keeping its comment.
export function setValue(toml, key, value) {
  const escaped = value.replace(/[\u0000-\u001f]/g, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return toml.replace(new RegExp(`^(${key}\\s*=\\s*)"[^"\\n]*"`, "m"), (_, head) => `${head}"${escaped}"`);
}

const currentValue = (toml, key) => new RegExp(`^${key}\\s*=\\s*"([^"\\n]*)"`, "m").exec(toml)?.[1] ?? "";

export async function profileInit({ home, kitDir, ask, yes = false, log = console.log } = {}) {
  const path = profilePath(home);
  if (existsSync(path)) {
    if (yes) return log(`${path} already exists. Run without --yes to replace it.`), 1;
    if (!(await confirm(ask, `${path} already exists. Replace it?`))) return log("Kept your profile."), 0;
  }
  let toml = loadKit(kitDir).readCore(TEMPLATE).toString("utf8");
  log(yes ? "Using the defaults (--yes)." : "A few questions. Press Enter to keep the default in brackets.");
  for (const [key, question, choices] of QUESTIONS) {
    const fallback = currentValue(toml, key);
    const answer = yes ? fallback : await askDefault(ask, question, fallback, choices);
    toml = setValue(toml, key, answer);
  }
  writeFile(path, toml);
  log(`Wrote ${path}. Edit it any time; the rest of the file has more defaults.`);
  return 0;
}

export function profileShow({ home, log = console.log } = {}) {
  const path = profilePath(home);
  if (!existsSync(path)) return log("No profile yet. Run: npx ai-dev-workflow profile init"), 1;
  log(`# ${path}\n${readFileSync(path, "utf8").trimEnd()}`);
  return 0;
}

export async function profileCopy(dir = ".", { home, ask, yes = false, log = console.log } = {}) {
  const from = profilePath(home);
  if (!existsSync(from)) return log("No profile yet. Run: npx ai-dev-workflow profile init"), 1;
  const to = toNative(resolve(dir), "docs/profile.toml");
  const data = readFileSync(from);
  if (existsSync(to)) {
    if (readFileSync(to).equals(data)) return log(`${to} is already up to date.`), 0;
    if (!yes && !(await confirm(ask, `${to} already exists. Replace it with your profile?`))) return log("Kept it."), 0;
  }
  writeFile(to, data);
  log(`Copied your profile to ${to}.`);
  return 0;
}

// For init: copy the home profile into a project that has none. Never asks, never overwrites.
export function copyProfileIfMissing(projectDir, { home } = {}) {
  const from = profilePath(home);
  const to = toNative(projectDir, "docs/profile.toml");
  if (!existsSync(from) || existsSync(to)) return false;
  writeFile(to, readFileSync(from));
  return true;
}
