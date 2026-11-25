// AC-5 of #100, for AC-2 and AC-6: when installs are blocked, the agent runs preflight, scaffolds
// nothing, and sends ONE message that lists every fix and what it tried. Never a half-built app
// with "install the dependencies from your terminal".
import { failedIds, result } from "../../lib/checks.mjs";

// The ladder has a few commands to try before asking: a little more room than the default 12 turns.
export const limits = { maxTurns: 24 };

// The script or the CLI command. Not the bare word: the temp folder is named after this scenario.
const PREFLIGHT = /preflight\.mjs\b|\bonrails\s+preflight\b/;
const TRIED = /^[\s>*_-]*(what (i|we) )?tried\b/im;
const PING = /\bnotify\.mjs\b[^\n]*--level[=\s]+["']?(blocker|decision)\b/;
const SETUP = /setup step for you/i;
const SETUP_ALL = /setup step for you/gi;

/** Files that are new or changed since the start, outside docs/ and the npm cache. */
function appFiles(t) {
  const changed = t.git("diff", "--name-only", t.meta.start).split("\n");
  const added = t.git("ls-files", "--others", "--exclude-standard").split("\n");
  const committed = t.git("log", "--all", "--name-only", "--format=", `^${t.meta.start}`).split("\n");
  return [...new Set([...changed, ...added, ...committed])].filter((p) => p && !p.startsWith("docs/") && !p.startsWith(".npm-cache"));
}

/** Issue files that are new or changed, with their text. */
function records(t) {
  const lines = (out) => out.split("\n").filter((p) => p.endsWith(".md"));
  const paths = new Set([...lines(t.git("diff", "--name-only", t.meta.start, "--", "docs/issues")), ...lines(t.git("ls-files", "--others", "--exclude-standard", "--", "docs/issues"))]);
  return [...paths].map((path) => t.read(path) ?? "").filter((text) => /needs-human/.test(text));
}

export const checks = [
  {
    id: "AC-5-preflight-ran",
    description: "AC-1: preflight ran, and before any file was written",
    check: (t) => {
      const ran = t.toolUses.findIndex((u) => u.name === "Bash" && PREFLIGHT.test(String(u.input.command ?? "")));
      if (ran < 0) return result(false, "no preflight command");
      const firstEdit = t.edits.find((e) => !e.path.startsWith("docs/"))?.index ?? Infinity;
      return result(ran < firstEdit, "an app file was written before preflight ran");
    },
  },
  {
    id: "AC-5-no-half-built-app",
    description: "AC-2: nothing was scaffolded: no new or changed file outside docs/",
    check: (t) => {
      const files = appFiles(t);
      return result(files.length === 0, `scaffolded without installs: ${files.slice(0, 5).join(", ")}`);
    },
  },
  {
    id: "AC-5-one-message",
    description: "AC-2: ONE needs-human record with one 'Setup step for you' that names both blockers: the registry and Node",
    check: (t) => {
      const found = records(t);
      if (!found.length) return result(false, "no new or changed issue file mentions needs-human");
      const withStep = found.filter((text) => SETUP.test(text));
      const steps = found.reduce((n, text) => n + (text.match(SETUP_ALL) ?? []).length, 0);
      if (steps !== 1) return result(false, `${steps} 'Setup step for you' block(s); the fixes must be batched in one`);
      const text = withStep[0];
      return result(/registry|npm install|network/i.test(text) && /\bnode\b/i.test(text), "the one message doesn't name both the registry and Node");
    },
  },
  {
    id: "AC-5-tried-listed",
    description: "AC-6: the message lists what was tried before asking",
    check: (t) => result(records(t).some((text) => TRIED.test(text)), "no 'Tried' line in the needs-human record"),
  },
  {
    id: "AC-5-one-ping",
    description: "AC-2: one ping through notify.mjs, not one per problem",
    check: (t) => {
      const failed = failedIds(t.events);
      const pings = t.toolUses.filter((u) => u.name === "Bash" && PING.test(String(u.input.command ?? "")) && !failed.has(u.id));
      return result(pings.length === 1, `${pings.length} ping(s)`);
    },
  },
];

export const manual = [
  "The 'Tried' line names real attempts: the project-local cache or --prefer-offline, and the tool's own permission route.",
  "The final message links the one record and says nothing was scaffolded, and why.",
  "It didn't tell the person to run npm install themselves as the only plan.",
];
