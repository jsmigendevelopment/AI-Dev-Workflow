// doctor --fix [--yes] [--dry-run]: for each failing check, show its fix and run it after a yes.
// Commands are always shown in full before they run (sudo included), and sign-ins are left
// for the person: those fixes only print the command to type.
import { resolve } from "node:path";
import { runChecks } from "./checks.mjs";
import { printChecks, requiredFailed } from "./doctor.mjs";
import { FAIL } from "./marks.mjs";
import { confirm } from "./prompt.mjs";
import { realSystem, showCommand } from "./system.mjs";

export async function doctorFix(dir = ".", { kitDir, sys = realSystem(), ask, yes = false, dryRun = false, log = console.log } = {}) {
  const checks = runChecks(resolve(dir), { kitDir, sys });
  printChecks(checks, log);
  const todo = checks.filter((ch) => ch.status === FAIL && ch.remedy);
  if (!todo.length) {
    log("\nNothing doctor can fix.");
    return requiredFailed(checks) ? 1 : 0;
  }
  log(dryRun ? "\nFix plan (dry run: nothing runs):" : "\nFixes:");
  let unfixed = checks.filter((ch) => ch.status === FAIL && ch.required && !ch.remedy).length;
  for (const ch of todo) {
    const fixed = await fixOne(ch, { sys, ask, yes, dryRun, log });
    if (!fixed && ch.required) unfixed++;
  }
  if (dryRun) return requiredFailed(checks) ? 1 : 0;
  log("\nRun npx ai-dev-workflow doctor again to check.");
  return unfixed ? 1 : 0;
}

async function fixOne(ch, { sys, ask, yes, dryRun, log }) {
  const { run = [], print = [], action, cwd } = ch.remedy;
  log(`\n${ch.label}`);
  for (const argv of run) log(`  run: ${showCommand(argv)}${cwd ? "   (in the project folder)" : ""}`);
  if (action) log(`  do: ${action.describe}`);
  for (const line of print) log(`  you do this yourself: ${line}`);
  if (dryRun || (!run.length && !action)) return false;

  if (yes) log("  yes (--yes)");
  else if (!(await confirm(ask, "  Run this?"))) return log("  skipped"), false;
  for (const argv of run) {
    if (!sys.exec(argv, { cwd })) return log(`  failed: ${showCommand(argv)}. Fix it by hand, then run doctor again.`), false;
  }
  if (action) action.run();
  log("  done");
  return true;
}
