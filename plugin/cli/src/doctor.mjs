// doctor [dir]: check the tools and the kit, one line each, with a fix for each problem.
// doctor --fix: see fix.mjs.
import { resolve } from "node:path";
import { runChecks } from "./checks.mjs";
import { FAIL } from "./marks.mjs";

export function printChecks(checks, log) {
  for (const ch of checks) {
    log(`${ch.status} ${ch.label}`);
    if (ch.status === FAIL && ch.fix) log(`    fix: ${ch.fix}`);
  }
}

export const requiredFailed = (checks) => checks.some((ch) => ch.status === FAIL && ch.required);

export function doctor(dir = ".", { kitDir, sys, log = console.log } = {}) {
  const checks = runChecks(resolve(dir), { kitDir, sys });
  printChecks(checks, log);
  const failed = requiredFailed(checks);
  log(failed ? "\nSome required checks failed." : "\nAll required checks passed.");
  if (checks.some((ch) => ch.status === FAIL && ch.remedy)) log("To fix what can be fixed: npx onrails doctor --fix");
  return failed ? 1 : 0;
}
