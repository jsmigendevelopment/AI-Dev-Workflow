// Who plays each role (#379): the kit's default from the routing skill's Roles table, or the person's own
// pick from [routing] in the profile, which wins. The project's docs/profile.toml first, then the home one.
//   node .agents/skills/routing/scripts/roles.mjs [cto|coordinator|builder] [--project <dir>]
// Prints one line per role, e.g. "cto: Claude Opus 5.5 · high (docs/profile.toml)". Dependency-free, Node 22+.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The kit's defaults. They match the Roles table in the routing skill; a test checks. */
export const DEFAULTS = {
  cto: { model: "Claude Fable 5.2", effort: "high" },
  coordinator: { model: "Claude Opus 5.5", effort: "medium" },
  builder: { model: "Claude Sonnet 5.5", effort: "medium" },
};

/** One key's value from a profile's [routing] table, or "" when it's missing or empty. */
export function routingValue(toml, key) {
  const body = toml.split(/^\[routing\][ \t]*$/m)[1]?.split(/^\[/m)[0] ?? "";
  return new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*"([^"\\n]*)"`, "m").exec(body)?.[1].trim() ?? "";
}

/** Each role's { model, effort, from }. profiles: [{ label, text }], first one first; per key, the first set value wins. */
export function resolveRoles(profiles) {
  const pick = (key) => {
    for (const { label, text } of profiles) {
      const value = routingValue(text, key);
      if (value) return { value, from: label };
    }
    return null;
  };
  return Object.fromEntries(Object.entries(DEFAULTS).map(([role, fallback]) => {
    const model = pick(role);
    const effort = pick(`${role}_effort`);
    const from = [...new Set([model?.from, effort?.from].filter(Boolean))].join(", ") || "default";
    return [role, { model: model?.value ?? fallback.model, effort: effort?.value ?? fallback.effort, from }];
  }));
}

// ~/.onrails, or ~/.ai-dev-workflow (its name before the rename to onRails) while only that one exists.
function homeProfile() {
  const fresh = join(homedir(), ".onrails"), old = join(homedir(), ".ai-dev-workflow");
  const dir = !existsSync(fresh) && existsSync(old) ? old : fresh;
  return [join(dir, "profile.toml"), `~/${basename(dir)}/profile.toml`];
}

function main(argv) {
  const at = argv.indexOf("--project");
  const project = resolve(at >= 0 ? argv[at + 1] ?? "." : ".");
  const role = argv.find((a, i) => !a.startsWith("--") && (at < 0 || i !== at + 1));
  if (role && !(role in DEFAULTS)) {
    console.error(`Unknown role "${role}". Roles: ${Object.keys(DEFAULTS).join(", ")}.`);
    return 2;
  }
  const profiles = [[join(project, "docs", "profile.toml"), "docs/profile.toml"], homeProfile()]
    .filter(([path]) => existsSync(path))
    .map(([path, label]) => ({ label, text: readFileSync(path, "utf8") }));
  for (const [name, r] of Object.entries(resolveRoles(profiles))) {
    if (!role || name === role) console.log(`${name}: ${r.model} · ${r.effort} (${r.from})`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
