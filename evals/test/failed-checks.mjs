// Runs one scenario with the fake claude on a plan and returns the "with" arm's failed check ids. The opt-in
// evals' own test files use it to check that each shortcut of a good transcript fails its own check.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const FAKE = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));

/** `plan` is { with, without }, as in plan.json. The temp folder is removed when the test `t` ends. */
export function failedChecks(t, scenario, plan) {
  const root = mkdtempSync(join(tmpdir(), "evals-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  copyFileSync(FAKE, join(bin, "claude"));
  chmodSync(join(bin, "claude"), 0o755);
  writeFileSync(join(bin, "plan.json"), JSON.stringify({ [scenario]: plan }));
  const results = join(root, "results");
  // A fake key, so even a real claude found by mistake would fail to sign in rather than spend.
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, ANTHROPIC_API_KEY: "sk-ant-fake-for-tests" };
  spawnSync(process.execPath, [RUN, "--results-dir", results, "--scenario", scenario], { encoding: "utf8", env, timeout: 120_000 });
  const file = readdirSync(results).find((f) => f.endsWith(".json"));
  return JSON.parse(readFileSync(join(results, file), "utf8")).runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
}
