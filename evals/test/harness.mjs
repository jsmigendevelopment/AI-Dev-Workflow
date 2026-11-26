// The harness tests' shared setup: a fake `claude` on PATH prints canned stream-json, so nothing calls a model.
// Needs the bundled kit for the "with" arm: run `cd cli && npm run bundle` first.
import { after } from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT = JSON.parse(readFileSync(new URL("../../cli/package.json", import.meta.url), "utf8")).version;
export const KIT_RE = KIT.replaceAll(".", "\\.");

export const RUN = fileURLToPath(new URL("../run.mjs", import.meta.url));
const FAKE = fileURLToPath(new URL("./fake-claude.mjs", import.meta.url));
export const TEST_SCENARIOS = fileURLToPath(new URL("./scenarios", import.meta.url));
export const skipWin = process.platform === "win32" ? "the fake claude is a shebang script" : false;

// Every folder setup() makes is removed when the test file that imports this one ends, so a run leaves nothing in
// TMPDIR (#142).
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

/** A temp bin folder holding the fake as `claude`, plus its plan. Returns a runner. */
export function setup(plan) {
  const root = mkdtempSync(join(tmpdir(), "evals-test-"));
  made.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  copyFileSync(FAKE, join(bin, "claude"));
  chmodSync(join(bin, "claude"), 0o755);
  writeFileSync(join(bin, "plan.json"), JSON.stringify(plan));
  const results = join(root, "results");
  const run = (...args) => {
    // A fake key, so even a real claude found by mistake would fail to sign in rather than spend.
    const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, ANTHROPIC_API_KEY: "sk-ant-fake-for-tests" };
    return spawnSync(process.execPath, [RUN, "--results-dir", results, ...args], { encoding: "utf8", env, timeout: 120_000 });
  };
  const resultsFile = () => {
    const file = readdirSync(results).find((f) => f.endsWith(".json"));
    return JSON.parse(readFileSync(join(results, file), "utf8"));
  };
  const calls = () => readFileSync(join(bin, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { root, run, results, resultsFile, calls };
}

/** setup, with its temp folder removed as soon as the test ends, not the file. The tests that loop over many runs use it. */
export function cleanSetup(t, plan) {
  const s = setup(plan);
  t.after(() => rmSync(s.root, { recursive: true, force: true }));
  return s;
}
