#!/usr/bin/env node
// Skill evals: each scenario runs twice in a fresh temp repo, once with the onRails kit
// installed (through cli/) and once without, then deterministic checks read the transcript
// and the files. `node evals/run.mjs --help` lists the flags; evals/README.md explains it.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HELP, parseArgs } from "./lib/args.mjs";
import { claudeArgs, claudeEnv, runClaude } from "./lib/claude.mjs";
import { git, listFiles, readText } from "./lib/fixture.mjs";
import { appendResults, passed, resultsName, summary, totals, verdict } from "./lib/report.mjs";
import { parseStream, summarize, usage } from "./lib/transcript.mjs";

const EVALS = dirname(fileURLToPath(import.meta.url));
const REPO = join(EVALS, "..");
const CLI = join(REPO, "cli", "bin", "cli.mjs");
const KIT_MANIFEST = join(REPO, "cli", "kit", "manifest.json");

async function loadScenarios(dir, only) {
  const names = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort();
  const wanted = only ? only.split(",").map((s) => s.trim()).filter(Boolean) : names;
  const missing = wanted.filter((n) => !names.includes(n));
  if (missing.length) throw new UsageError(`No such scenario: ${missing.join(", ")}. There are: ${names.join(", ")}`);
  const out = [];
  for (const name of wanted) {
    const base = join(dir, name);
    const fixture = await import(pathToFileURL(join(base, "fixture.mjs")).href);
    const checks = await import(pathToFileURL(join(base, "checks.mjs")).href);
    out.push({ name, prompt: readFileSync(join(base, "prompt.md"), "utf8").trim(), build: fixture.build, checks: checks.checks, manual: checks.manual ?? [], guard: checks.guard === true });
  }
  return out;
}

class UsageError extends Error {}

function kitVersion({ dryRun }) {
  if (existsSync(KIT_MANIFEST)) return JSON.parse(readFileSync(KIT_MANIFEST, "utf8")).kitVersion;
  if (!dryRun) throw new UsageError("The CLI's kit isn't bundled. Run: cd cli && npm run bundle");
  return JSON.parse(readFileSync(join(REPO, "cli", "package.json"), "utf8")).version;
}

// Installs the kit the way a person would, then hides its files from git, so the
// fixture's history, diffs and `git status` match the run without the kit.
function installKit(repoDir, home) {
  const r = spawnSync(process.execPath, [CLI, "init", repoDir, "--no-start"], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
  if (r.status !== 0) throw new Error(`onrails init failed: ${r.stderr || r.stdout}`);
  const manifest = JSON.parse(readFileSync(join(repoDir, ".onrails.json"), "utf8"));
  const paths = [".onrails.json", ...Object.keys(manifest.files ?? {})].map((p) => `/${p}`);
  appendFileSync(join(repoDir, ".git", "info", "exclude"), "\n" + paths.join("\n") + "\n");
}

async function runChecks(scenario, ctx) {
  const results = [];
  for (const c of scenario.checks) {
    try {
      const out = await c.check(ctx);
      const pass = typeof out === "object" && out !== null ? Boolean(out.pass) : Boolean(out);
      results.push({ id: c.id, pass, detail: typeof out === "object" && out?.detail ? String(out.detail) : undefined });
    } catch (error) {
      results.push({ id: c.id, pass: false, detail: `check threw: ${error.message}` });
    }
  }
  return results;
}

async function runArm(scenario, arm, opts, tmp) {
  const armDir = join(tmp, arm);
  const repoDir = join(armDir, "repo");
  const home = join(armDir, "home");
  mkdirSync(repoDir, { recursive: true });
  mkdirSync(home, { recursive: true });
  const meta = (await scenario.build(repoDir, { root: armDir })) ?? {};
  if (arm === "with") installKit(repoDir, home);
  const before = new Set(listFiles(repoDir));
  const run = await runClaude({
    bin: opts.claude, cwd: repoDir, prompt: scenario.prompt, timeoutSec: opts.timeoutSec,
    args: claudeArgs(opts), env: claudeEnv(process.env, { home }),
  });
  const events = parseStream(run.stdout);
  const t = summarize(events, repoDir);
  const ctx = {
    ...t, arm, dir: repoDir, root: armDir, meta, events,
    read: (p) => readText(repoDir, p),
    exists: (p) => existsSync(join(repoDir, p)),
    git: (...args) => git(repoDir, ...args),
    newFiles: () => listFiles(repoDir).filter((p) => !before.has(p)),
  };
  const checks = await runChecks(scenario, ctx);
  const u = usage(events);
  const warnings = [];
  if (run.status !== "ok") warnings.push(`${arm}: claude ${run.status}${run.error ? `: ${run.error}` : ""}${run.stderr ? `: ${run.stderr.trim().split("\n").at(-1)}` : ""}`);
  if (arm === "with" && Array.isArray(t.init?.skills) && !t.init.skills.some((s) => /(^|:)build$/.test(s))) {
    warnings.push("with: the init event lists no kit skills, so the kit may not have loaded");
  }
  return {
    arm: { status: run.status, checks, durationMs: run.durationMs, ...u, claudeCodeVersion: t.init?.claude_code_version ?? null },
    warnings,
  };
}

async function runScenario(scenario, opts) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `evals-${scenario.name}-`)));
  try {
    const [w, o] = await Promise.all([runArm(scenario, "with", opts, tmp), runArm(scenario, "without", opts, tmp)]);
    const arms = { with: w.arm, without: o.arm };
    return { name: scenario.name, verdict: verdict(arms, { guard: scenario.guard }), arms, manual: scenario.manual, warnings: [...w.warnings, ...o.warnings] };
  } finally {
    if (opts.keep) console.log(`kept ${tmp}`);
    else rmSync(tmp, { recursive: true, force: true });
  }
}

function dryRun(scenarios, opts, version) {
  const args = claudeArgs(opts);
  console.log(`Dry run: ${scenarios.length * 2} run(s) of claude, model ${opts.model}, kit ${version}. Nothing runs, nothing is written.`);
  console.log(`Limits per run: ${opts.maxTurns} turns, ${opts.timeoutSec} s, $${opts.maxBudgetUsd} budget. Cap: ${opts.maxRuns} runs.`);
  console.log(`Command (prompt on stdin): ${opts.claude} ${args.map((a) => (/[\s(*,]/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
  for (const s of scenarios) {
    for (const arm of ["with", "without"]) console.log(`  ${s.name} [${arm}]: ${s.checks.length} check(s): ${s.checks.map((c) => c.id).join(", ")}`);
  }
  console.log(`Results would go to ${join(opts.resultsDir, resultsName(new Date().toISOString().slice(0, 10), opts.model, version))}.json`);
  console.log(process.env.ANTHROPIC_API_KEY ? "Auth: ANTHROPIC_API_KEY, with a clean temp HOME per run." : "Auth: no ANTHROPIC_API_KEY, so your own Claude Code login.");
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) throw new UsageError(opts.error);
  if (opts.help) return console.log(HELP), 0;
  opts.claude ??= "claude";
  opts.resultsDir = resolve(opts.resultsDir ?? join(EVALS, "results"));
  const scenarios = await loadScenarios(resolve(opts.scenariosDir ?? join(EVALS, "scenarios")), opts.scenario);
  if (scenarios.length * 2 > opts.maxRuns) {
    throw new UsageError(`${scenarios.length * 2} runs planned, above --max-runs ${opts.maxRuns}. Pick fewer with --scenario.`);
  }
  const version = kitVersion(opts);
  if (opts.dryRun) return dryRun(scenarios, opts, version), 0;
  if (!process.env.ANTHROPIC_API_KEY) console.log("No ANTHROPIC_API_KEY: using your own Claude Code login. It counts against your plan's limits.");

  const startedAt = new Date().toISOString();
  const results = [];
  for (const s of scenarios) {
    console.log(`Running ${s.name} (with and without the kit)...`);
    results.push(await runScenario(s, opts));
  }
  const exitCode = results.every((s) => passed(s.verdict)) ? 0 : 1;
  const claudeCodeVersion = results.flatMap((s) => Object.values(s.arms)).find((a) => a.claudeCodeVersion)?.claudeCodeVersion ?? null;
  const run = {
    startedAt, finishedAt: new Date().toISOString(), model: opts.model, kitVersion: version, claudeCodeVersion,
    limits: { maxTurns: opts.maxTurns, timeoutSec: opts.timeoutSec, maxBudgetUsd: opts.maxBudgetUsd, maxRuns: opts.maxRuns },
    auth: process.env.ANTHROPIC_API_KEY ? "api-key" : "login",
    scenarios: results, totals: totals(results), exitCode,
  };
  const name = resultsName(startedAt.slice(0, 10), opts.model, version);
  const path = appendResults(opts.resultsDir, name, run);
  const md = summary(run);
  writeFileSync(join(opts.resultsDir, `${name}.md`), md);
  if (opts.summary) appendFileSync(opts.summary, md);
  console.log(md);
  console.log(`Results: ${path}`);
  return exitCode;
}

main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
  console.error(error instanceof UsageError ? error.message : error.stack);
  process.exit(error instanceof UsageError ? 2 : 1);
});
