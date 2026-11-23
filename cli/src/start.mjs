// After init: offer to open a fresh Claude Code or Codex session in the project, typing
// /idea (new app) or /join (a folder that already has code) for the person.
// The agent is started with the terminal handed over (stdio inherited), so the terminal
// becomes that session. `claude "<prompt>"` and `codex "<prompt>"` both start an
// interactive session with an initial prompt (checked with --help, Claude Code 2.1.330
// and codex-cli 0.171.0, 2026-11-23).
import { readdirSync } from "node:fs";

const AGENTS = [
  { bin: "claude", label: "Claude Code", prompt: (cmd) => `/${cmd}` },
  { bin: "codex", label: "Codex", prompt: (cmd) => `$${cmd}` },
];

// Files that don't make a folder "existing code": git and OS clutter, editor folders,
// and the README, licence and ignore files a new GitHub repo starts with.
const NOT_CODE = /^(\.git|\.DS_Store|Thumbs\.db|desktop\.ini|\.gitignore|\.gitattributes|\.idea|\.vscode|README(\..*)?|LICEN[CS]E(\..*)?)$/i;

// "join" if the folder holds anything else before init runs, else "idea".
export function entryCommand(projectDir) {
  let names = [];
  try { names = readdirSync(projectDir); } catch { /* a folder init will create */ }
  return names.some((n) => !NOT_CODE.test(n)) ? "join" : "idea";
}

export const desktopLine = (cmd) =>
  `Using the desktop app or an IDE? Open this folder there, start a new session and type /${cmd} (Codex: $${cmd}).`;

// start: true (--start), false (--no-start) or undefined (ask when it can).
// Returns the agent's exit code if one ran, else 0.
export async function offerStart(projectDir, cmd, { start, sys, ask, interactive, log = console.log }) {
  const found = AGENTS.filter((a) => sys.has(a.bin));
  if (start === false || !found.length || (start === undefined && !interactive)) {
    if (start !== false && !found.length) log("Claude Code and Codex were not found on your PATH.");
    log(desktopLine(cmd));
    return 0;
  }
  const agent = start ? found[0] : await choose(found, cmd, ask);
  if (!agent) return log(desktopLine(cmd)), 0;
  const argv = [agent.bin, agent.prompt(cmd)];
  ask?.close?.();
  log(`Starting ${agent.label}: ${argv.join(" ")}`);
  return sys.spawnInteractive(argv, { cwd: projectDir });
}

async function choose(found, cmd, ask) {
  if (found.length === 1) {
    const [a] = found;
    const answer = await ask(`Start ${a.label} here now with ${a.prompt(cmd)}? (Y/n) `);
    return /^(y(es)?)?$/i.test(answer) ? a : null;
  }
  const names = found.map((a) => a.bin);
  const which = found.map((a) => `${a.label} (${a.prompt(cmd)})`).join(" or ");
  for (;;) {
    const answer = (await ask(`Start ${which} here now? (${names.join("/")}/n) [${names[0]}] `)).toLowerCase();
    if (/^no?$/.test(answer)) return null;
    const pick = answer ? found.find((a) => a.bin === answer) : found[0];
    if (pick) return pick;
  }
}
