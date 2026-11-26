// Runs one scenario with the fake claude on a plan. The opt-in evals' own test files use it to check that each
// shortcut of a good transcript fails its own check.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const FAKE = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));

/** A new temp folder, removed when the test `t` ends. The one place the opt-in evals' tests make one (AC-142-2). */
export function tempDir(t, prefix = "evals-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  // A child an eval leaves can still be writing as it exits, after the run: retry ENOTEMPTY or EBUSY (#196).
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return dir;
}

/** The scenario's result: its verdict and both arms. `plan` is { with, without }, as in plan.json. `env` adds to the
 * runner's environment, such as a TZ. The temp folder is removed when the test `t` ends. */
export function scenarioResult(t, scenario, plan, env = {}) {
  const root = tempDir(t);
  const bin = join(root, "bin");
  mkdirSync(bin);
  copyFileSync(FAKE, join(bin, "claude"));
  chmodSync(join(bin, "claude"), 0o755);
  writeFileSync(join(bin, "plan.json"), JSON.stringify({ [scenario]: plan }));
  const results = join(root, "results");
  // A fake key, so even a real claude found by mistake would fail to sign in rather than spend.
  const runEnv = { ...process.env, ...env, PATH: `${bin}${delimiter}${process.env.PATH}`, ANTHROPIC_API_KEY: "sk-ant-fake-for-tests" };
  spawnSync(process.execPath, [RUN, "--results-dir", results, "--scenario", scenario], { encoding: "utf8", env: runEnv, timeout: 120_000 });
  const file = readdirSync(results).find((f) => f.endsWith(".json"));
  return JSON.parse(readFileSync(join(results, file), "utf8")).runs[0].scenarios[0];
}

/** The "with" arm's failed check ids. */
export const failedChecks = (t, scenario, plan) => scenarioResult(t, scenario, plan).arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
