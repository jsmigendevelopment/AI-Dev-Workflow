// Command-line flags for evals/run.mjs.
export const DEFAULTS = {
  model: "claude-haiku-5-5",
  maxTurns: 12,
  timeoutSec: 240,
  maxBudgetUsd: 0.5,
  maxRuns: 36,
};
// No flag can raise the number of runs past this. Each run is one paid Claude Code session.
export const HARD_CAP = 40;

export const HELP = `node evals/run.mjs [options]

Runs each scenario twice, with the onRails kit installed and without, and compares the checks.

  --scenario <a,b>       only these scenarios (default: all)
  --model <id>           model for every run (default: ${DEFAULTS.model})
  --max-turns <n>        agent turns per run (default: ${DEFAULTS.maxTurns})
  --timeout <sec>        wall-clock limit per run (default: ${DEFAULTS.timeoutSec})
  --max-budget-usd <n>   Claude Code's spending stop per run (default: ${DEFAULTS.maxBudgetUsd})
  --max-runs <n>         refuse to start above this many runs (default: ${DEFAULTS.maxRuns}, never above ${HARD_CAP})
  --dry-run              print what would run; run nothing, write nothing
  --summary <file>       also append the markdown summary to this file (CI: $GITHUB_STEP_SUMMARY)
  --results-dir <dir>    where results go (default: evals/results)
  --scenarios-dir <dir>  where scenarios live (default: evals/scenarios)
  --claude <path>        the claude binary (default: claude on PATH)
  --keep                 keep the temp folders, and print where they are

Exit: 0 every scenario passed, 1 a "with" check failed or a scenario showed no difference (a guard scenario may), 2 a usage error.`;

const NUMBER = { "--max-turns": "maxTurns", "--timeout": "timeoutSec", "--max-budget-usd": "maxBudgetUsd", "--max-runs": "maxRuns" };
const STRING = { "--scenario": "scenario", "--model": "model", "--summary": "summary", "--results-dir": "resultsDir",
  "--scenarios-dir": "scenariosDir", "--claude": "claude" };
const BOOL = { "--dry-run": "dryRun", "--keep": "keep", "--help": "help", "-h": "help" };

// The limits a scenario may set for itself, in its checks.mjs: `export const limits = { maxTurns: 40 }`.
const SCENARIO_LIMITS = ["maxTurns", "timeoutSec", "maxBudgetUsd"];
// No scenario's own budget goes past this, per run.
export const SCENARIO_BUDGET_CAP = 2;

/** One scenario's options: its own limits replace the defaults, and a flag on the command line still wins. */
export function withLimits(opts, limits = {}) {
  const out = { ...opts };
  for (const key of SCENARIO_LIMITS) if (limits[key] !== undefined && !opts.given.includes(key)) out[key] = limits[key];
  out.maxBudgetUsd = opts.given.includes("maxBudgetUsd") ? out.maxBudgetUsd : Math.min(out.maxBudgetUsd, SCENARIO_BUDGET_CAP);
  return out;
}

/** Parses argv into options. Returns { error } on a bad flag. */
export function parseArgs(argv) {
  const opts = { ...DEFAULTS, dryRun: false, keep: false, help: false, given: [] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    if (BOOL[flag]) { opts[BOOL[flag]] = true; continue; }
    const key = NUMBER[flag] ?? STRING[flag];
    if (!key) return { error: `Unknown option: ${argv[i]}` };
    const value = inline ?? argv[++i];
    if (value === undefined || value === "") return { error: `${flag} needs a value` };
    if (NUMBER[flag]) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return { error: `${flag} needs a positive number, got "${value}"` };
      opts[key] = n;
      opts.given.push(key);
    } else opts[key] = value;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(opts.model)) return { error: `--model "${opts.model}" doesn't look like a model id` };
  if (opts.maxRuns > HARD_CAP) return { error: `--max-runs ${opts.maxRuns} is above the hard cap of ${HARD_CAP}` };
  return opts;
}
