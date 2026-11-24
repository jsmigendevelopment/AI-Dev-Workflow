#!/usr/bin/env node
// The plan-grain measurement: the same planning prompt on the same fixture, with no kit, with
// the kit as it is on main, and with the kit on this branch. It counts what each plan would
// open as issues for pass 1. The manifest next to this file fixes the cases and the metrics.
// Usage: node measure.mjs --model <id> --n <runs per arm> --main-kit <checkout of main, bundled>
//          [--arms no-kit,kit-main,kit-branch] [--budget <usd per run>] [--first <iteration number>]
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPlan, readSteps } from "../../../../.agents/skills/pyramid/scripts/check-plan.mjs";
import { claudeArgs, claudeEnv, runClaude } from "../../../../evals/lib/claude.mjs";
import { flatshareDocs } from "../../../../evals/lib/flatshare.mjs";
import { repo } from "../../../../evals/lib/fixture.mjs";
import { parseStream, usage } from "../../../../evals/lib/transcript.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const RUN = "2026-11-23-plan-grain";
const MACHINE = "cloud-linux";
const HEADER = "run,machine,case,metric,unit,iteration,phase,value,status";
const PROMPT = `Plan the build now: write docs/pyramid.md, with the first pass in detail. Plan it on this model, I've decided that, so don't ask. Don't set up the app or write any code today. The plan is all I want. At the very end of the file add a section called "## Build order": one line for each issue you would open for the first pass, in order, written as "- <title> :: <what I could try on the test site once it's merged, or the word nothing>".`;

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const model = arg("--model");
const n = Number(arg("--n", "1"));
const first = Number(arg("--first", "1"));
const budget = Number(arg("--budget", "0.5"));
const mainKit = arg("--main-kit");
const arms = arg("--arms", "no-kit,kit-main,kit-branch").split(",");
if (!model || !mainKit || !Number.isInteger(n) || n < 1) {
  console.error("Usage: node measure.mjs --model <id> --n <runs per arm> --main-kit <checkout of main, bundled> [--arms a,b] [--budget usd] [--first i]");
  process.exit(2);
}
const CLI = { "kit-main": join(mainKit, "cli", "bin", "cli.mjs"), "kit-branch": join(REPO, "cli", "bin", "cli.mjs") };

/** The numbers read from one plan file. Empty when the file or its Build order section is missing. */
export function measure(plan) {
  const section = plan.split(/^## Build order\s*$/m)[1]?.split(/^## /m)[0];
  const lines = section ? section.split("\n").filter((l) => /^\s*[-*] /.test(l)) : null;
  const tryable = lines?.filter((l) => {
    const after = l.split(" :: ")[1]?.trim().replace(/[.`*"]/g, "") ?? "";
    return after !== "" && !/^nothing\b/i.test(after);
  });
  const steps = readSteps(plan);
  return {
    units: lines ? lines.length : "",
    tryable_units: lines ? tryable.length : "",
    steps_table: steps ? 1 : 0,
    checker_errors: steps ? checkPlan(plan).errors.length : "",
  };
}

async function one(arm, iteration) {
  const tmp = mkdtempSync(join(tmpdir(), `plan-grain-${arm}-`));
  const dir = join(tmp, "repo"), home = join(tmp, "home");
  mkdirSync(home, { recursive: true });
  repo(dir, flatshareDocs());
  if (CLI[arm]) {
    const r = spawnSync(process.execPath, [CLI[arm], "init", dir, "--no-start"], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
    if (r.status !== 0) throw new Error(`init failed for ${arm}: ${r.stderr || r.stdout}`);
  }
  const run = await runClaude({ cwd: dir, prompt: PROMPT, timeoutSec: 420, args: claudeArgs({ model, maxTurns: 20, maxBudgetUsd: budget }), env: claudeEnv(process.env, { home }) });
  const u = usage(parseStream(run.stdout));
  const planPath = join(dir, "docs", "pyramid.md");
  const plan = existsSync(planPath) ? readFileSync(planPath, "utf8") : "";
  const raw = join(HERE, "raw", model);
  mkdirSync(raw, { recursive: true });
  writeFileSync(join(raw, `${arm}-${iteration}.pyramid.md`), plan);
  const meta = { arm, model, iteration, status: run.status, subtype: u.subtype, turns: u.numTurns, costUsd: u.costUsd, durationMs: run.durationMs, tokens: u.tokens, finished: new Date().toISOString() };
  writeFileSync(join(raw, `${arm}-${iteration}.json`), JSON.stringify(meta, null, 2) + "\n");
  rmSync(tmp, { recursive: true, force: true });
  const m = measure(plan);
  // A run that hit a limit still counts when it left a plan with a Build order: the plan is what is measured.
  const status = m.units === "" ? "failed" : "ok";
  const rows = [["units", "count", m.units], ["tryable_units", "count", m.tryable_units], ["steps_table", "flag", m.steps_table], ["checker_errors", "count", m.checker_errors],
    ["cost_usd", "usd", u.costUsd ?? ""], ["duration_s", "s", Math.round(run.durationMs / 1000)], ["turns", "count", u.numTurns ?? ""]];
  return rows.map(([metric, unit, value]) => [RUN, MACHINE, `${model}:${arm}`, metric, unit, iteration, "measure", value, value === "" ? "failed" : status].join(","));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(HERE, "results.csv");
  if (!existsSync(out)) writeFileSync(out, HEADER + "\n");
  for (let i = first; i < first + n; i++) {
    const rows = (await Promise.all(arms.map((arm) => one(arm, i)))).flat();
    appendFileSync(out, rows.join("\n") + "\n");
    console.log(rows.filter((r) => /,units,|,tryable_units,|,cost_usd,/.test(r)).join("\n"));
  }
}
