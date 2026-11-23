#!/usr/bin/env node
// ai-dev-workflow (alias: adw): install and update the AI-Dev-Workflow kit in a project.
import { readFileSync } from "node:fs";
import { addPack, listPacks } from "../src/add.mjs";
import { doctor } from "../src/doctor.mjs";
import { init } from "../src/init.mjs";
import { update } from "../src/update.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `ai-dev-workflow ${version}: install and update the AI-Dev-Workflow kit

Usage:
  npx ai-dev-workflow init [dir]                  install the kit (default: this folder)
  npx ai-dev-workflow update [dir] [--dry-run]    update to the kit in this CLI version
  npx ai-dev-workflow doctor [dir]                check your tools and the kit
  npx ai-dev-workflow add <pack> [dir] [--force]  copy a stack pack into the project
  npx ai-dev-workflow add --list                  list the stack packs
  npx ai-dev-workflow --version | --help

Your own files are never overwritten: the kit's copy goes next to yours as <file>.kit-new.`;

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  const [command, ...args] = argv.filter((a) => !a.startsWith("-"));
  const known = new Set(["--dry-run", "--force", "--list", "--help", "-h", "--version", "-v"]);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (unknown.length) return fail(`Unknown option: ${unknown.join(" ")}`);

  if (flags.has("--version") || flags.has("-v")) return console.log(version), 0;
  if (flags.has("--help") || flags.has("-h") || !command && !flags.has("--list")) return console.log(HELP), 0;

  switch (command) {
    case "init": return init(args[0]);
    case "update": return update(args[0], { dryRun: flags.has("--dry-run") });
    case "doctor": return doctor(args[0]);
    case "add":
      if (flags.has("--list")) return listPacks();
      if (!args[0]) return fail("Name a pack, or run: npx ai-dev-workflow add --list");
      return addPack(args[0], args[1], { force: flags.has("--force") });
    default: return fail(`Unknown command: ${command ?? ""}`);
  }
}

function fail(message) {
  console.error(`${message}\nRun: npx ai-dev-workflow --help`);
  return 2;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
