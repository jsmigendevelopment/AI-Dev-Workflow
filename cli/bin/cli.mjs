#!/usr/bin/env node
// onrails: install and update the onRails kit in a project.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accountsList } from "../src/accounts.mjs";
import { addPack, listAddons, listPacks } from "../src/add.mjs";
import { ciLocal } from "../src/ci-local.mjs";
import { doctor } from "../src/doctor.mjs";
import { doctorFix } from "../src/fix.mjs";
import { initGlobal } from "../src/global.mjs";
import { offerHomeMove } from "../src/home.mjs";
import { init } from "../src/init.mjs";
import { main as weekly } from "../src/insights-week.mjs";
import { lesson } from "../src/lesson-check.mjs";
import { libraryInit } from "../src/library-init.mjs";
import { main as preflight } from "../src/preflight.mjs";
import { main as procs } from "../src/procs.mjs";
import { profileCopy, profileInit, profileShow } from "../src/profile.mjs";
import { terminalAsk } from "../src/prompt.mjs";
import { signature } from "../src/signature.mjs";
import { entryCommand, offerStart } from "../src/start.mjs";
import { realSystem } from "../src/system.mjs";
import { update } from "../src/update.mjs";
import { updateAll } from "../src/update-all.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `onrails ${version}: install and update the onRails kit

Usage:
  npx onrails init [dir] [--start | --no-start]
                                          install the kit (default: this folder), then offer
                                          to start Claude Code or Codex there with /idea or /join
  npx onrails init --global               copy idea, join, back and afk to ~/.claude/skills
                                          and ~/.agents/skills (never overwrites). The
                                          plugin is the recommended way now: see the README
  npx onrails update [dir] [--dry-run] [--yes]
                                          update to the kit in this CLI version
                                          --yes also answers ci local: Actions off and a pull request
  npx onrails@latest update [dir] --all [--dry-run] [--yes]
                                          bring everything to the latest: the Claude Code and
                                          Codex plugins, the global entry skills, this project's
                                          kit, then doctor and a before and after summary
  npx onrails ci local [dir] [--dry-run] [--yes]
                                          move this repo off GitHub Actions: turn Actions off, then
                                          open a pull request that removes .github/workflows/ and
                                          writes ci = "local" to docs/stack.md. Asks once below Full
  npx onrails doctor [dir]                check your tools and the kit
  npx onrails doctor [dir] --fix [--yes] [--dry-run]
                                          offer a fix for each problem, run it after a yes
  npx onrails preflight [dir] [--record] [--if-changed] [--json] [--model <id>] [--effort <level>]
                        [--tool <name>] [--mark-read]
                                          for agents: probe this session's sandbox (repo, .git, the
                                          registry, GitHub, loopback, a browser, Node) and print one
                                          table with the fix ladder for each failure
  npx onrails ps [dir] [--json]           list the background processes agents started: age, owner,
                                          CPU, memory, and which are stale (owner gone, or past their time)
  npx onrails ps [dir] --stop <id|all|stale|pid> [--yes]
                                          stop them: TERM, then KILL after 5 s. Asks first for a PID
                                          onRails didn't start, or another live session's
  npx onrails accounts [dir]              list the profile's accounts and their config folders
  npx onrails add <pack> [dir] [--force]  copy a stack pack into the project
  npx onrails add --list                  list the stack packs
  npx onrails add <pack> --list-addons    list a pack's optional add-ons
  npx onrails add <pack>/<addon> [dir] [--force]
                                          copy an add-on's files, print its remaining steps
  npx onrails signature [--theme professional|personal] [--style full|compact] [--markdown]
                        [--write <file>]
                                          print the README signature from the profile's
                                          [me.signature], or put it at the end of <file>
  npx onrails profile init [--yes]        make ~/.onrails/profile.toml
  npx onrails profile show                print your profile
  npx onrails profile copy [dir]          copy it into <dir>/docs/profile.toml
  npx onrails research-library init <dir> copy the template research library into <dir>
                                          (then make it a private repo; see the research skill)
  npx onrails lesson check <file> [--project <dir>]
                                          refuse a kit lesson that isn't a closed record of known-safe
                                          values, or one with the project's own terms (the current repo
                                          by default). Reads local files only. Exit 0 accepted, 1 refused
  npx onrails insights --week [<yyyy-Www>] [dir]
                                          print a week's report from the insights records (last full
                                          week by default): runs, send-backs, sizes, escalations, usage
  npx onrails --version | --help

Your own files are never overwritten: the kit's copy goes next to yours as <file>.onrails-new.
Used the CLI before its rename to onRails? Your ~/.ai-dev-workflow folder and the project's
.ai-dev-workflow.json, AGENTS.kit.md and config.kit.toml still work. The CLI offers to move
them to the new names, and --yes moves them. Nothing is deleted without a yes.`;

async function main(argv) {
  // signature has flags that take values, so it reads its own.
  if (argv[0] === "signature" && !argv.includes("--help") && !argv.includes("-h")) return signature(argv.slice(1));
  // preflight reads its own flags too. It is read-only and never offers the home-folder move.
  if (argv[0] === "preflight") return preflight(argv.slice(1));
  // lesson check reads its own flags (--project takes a value). It is read-only and never offers the home-folder move.
  if (argv[0] === "lesson" && !argv.includes("--help") && !argv.includes("-h")) return lesson(argv.slice(1));
  // insights --week reads its own flags (a week and a folder). It only reads the records (#381).
  if (argv[0] === "insights" && !argv.includes("--help") && !argv.includes("-h")) {
    if (!argv.includes("--week")) return console.error("Usage: npx onrails insights --week [<yyyy-Www>] [dir]"), 2;
    return weekly(argv.slice(1));
  }
  // ps reads its own flags (--stop takes a value), and asks on the terminal before it stops a PID it didn't record.
  if (argv[0] === "ps" && !argv.includes("--help") && !argv.includes("-h")) {
    const ask = terminalAsk();
    try { return await procs(argv, { ask }); } finally { ask.close(); }
  }
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  const [command, ...args] = argv.filter((a) => !a.startsWith("-"));
  const known = new Set(["--dry-run", "--force", "--list", "--list-addons", "--fix", "--yes", "-y", "--help", "-h", "--version", "-v",
    "--start", "--no-start", "--global", "--all"]);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (unknown.length) return fail(`Unknown option: ${unknown.join(" ")}`);

  if (flags.has("--version") || flags.has("-v")) return console.log(version), 0;
  if (flags.has("--help") || flags.has("-h") || !command && !flags.has("--list")) return console.log(HELP), 0;

  const yes = flags.has("--yes") || flags.has("-y");
  const ask = terminalAsk();
  try {
    // doctor and accounts stay read-only: doctor reports the old folder, and doctor --fix offers the move.
    if (COMMANDS.includes(command) && !READ_ONLY.has(command)) await offerHomeMove({ ask, yes });
    return await run(command, args, flags, { ask, yes });
  } finally {
    ask.close();
  }
}

const COMMANDS = ["accounts", "init", "update", "doctor", "profile", "add"];
const READ_ONLY = new Set(["doctor", "accounts"]);

async function run(command, args, flags, { ask, yes }) {
  switch (command) {
    case "accounts": return accountsList(args[0]);
    case "init":
      if (flags.has("--global")) return initGlobal();
      if (flags.has("--start") && flags.has("--no-start")) return fail("Use --start or --no-start, not both.");
      return initAndStart(args[0], flags.has("--start") ? true : flags.has("--no-start") ? false : undefined, ask);
    case "update":
      if (flags.has("--all")) return updateAll(args[0], { dryRun: flags.has("--dry-run"), ask, yes });
      return update(args[0], { dryRun: flags.has("--dry-run"), ask, yes });
    case "ci":
      if (args[0] !== "local") return fail(`Unknown ci command: ${args[0] ?? ""} (use local)`);
      return ciLocal(args[1], { dryRun: flags.has("--dry-run"), ask, yes });
    case "doctor":
      if (!flags.has("--fix")) return doctor(args[0]);
      return doctorFix(args[0], { ask, yes, dryRun: flags.has("--dry-run") });
    case "profile": return profile(args, { ask, yes });
    case "add":
      if (flags.has("--list")) return listPacks();
      if (flags.has("--list-addons")) {
        if (!args[0]) return fail("Name a pack, e.g.: npx onrails add tanstack-start --list-addons");
        return listAddons(args[0]);
      }
      if (!args[0]) return fail("Name a pack, or run: npx onrails add --list");
      return addPack(args[0], args[1], { force: flags.has("--force") });
    case "research-library":
      if (args[0] !== "init") return fail(`Unknown research-library command: ${args[0] ?? ""} (use init)`);
      return libraryInit(args[1]);
    default: return fail(`Unknown command: ${command ?? ""}`);
  }
}

function profile([sub, dir], { ask, yes }) {
  if (sub === "init") return profileInit({ ask, yes });
  if (sub === "show") return profileShow();
  if (sub === "copy") return profileCopy(dir, { ask, yes });
  return fail(`Unknown profile command: ${sub ?? ""} (use init, show or copy)`);
}

// Install, then offer a fresh agent session. It asks only on a real terminal outside CI.
function initAndStart(dir = ".", start, ask) {
  const cmd = entryCommand(resolve(dir));
  const code = init(dir, { entry: cmd });
  if (code !== 0) return code;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
  console.log("");
  // The search skips PATH entries inside this project too, not only the current folder (#215).
  return offerStart(resolve(dir), cmd, { start, sys: realSystem({ projectDir: resolve(dir) }), ask, interactive });
}

function fail(message) {
  console.error(`${message}\nRun: npx onrails --help`);
  return 2;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
