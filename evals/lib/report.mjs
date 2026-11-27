// Verdicts, the append-only results file and the markdown summary.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * pass: every "with" check passed and at least one failed without the kit. fail: a "with" check failed.
 * A guard scenario checks that the kit doesn't make the agent worse (too cautious, say), so no
 * difference between the arms is expected there: it gets "guard", which counts as a pass.
 */
export function verdict(arms, { guard = false } = {}) {
  const withChecks = arms.with.checks;
  if (arms.with.status !== "ok" || withChecks.some((c) => !c.pass)) return "fail";
  const without = new Map(arms.without.checks.map((c) => [c.id, c.pass]));
  if (withChecks.some((c) => c.pass && without.get(c.id) === false)) return "pass";
  return guard ? "guard" : "no-difference";
}

/** The verdicts that keep the exit code at 0. */
export const passed = (v) => v === "pass" || v === "guard";

export function totals(scenarios) {
  const t = { runs: 0, costUsd: 0, costUnknown: 0, durationMs: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  for (const s of scenarios) {
    for (const arm of Object.values(s.arms)) {
      t.runs += 1;
      t.durationMs += arm.durationMs;
      if (arm.costUsd === null) t.costUnknown += 1;
      else t.costUsd += arm.costUsd;
      for (const k of Object.keys(t.tokens)) t.tokens[k] += arm.tokens[k];
    }
  }
  t.costUsd = Math.round(t.costUsd * 1e6) / 1e6;
  return t;
}

export const resultsName = (date, model, kitVersion) =>
  `${date}-${model.replace(/[^A-Za-z0-9._-]/g, "_")}-${kitVersion}`;

/** Appends the run to <dir>/<name>.json ({ runs: [...] }). Earlier runs are never changed. */
export function appendResults(dir, name, run) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.json`);
  const file = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { runs: [] };
  file.runs.push(run);
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
  return path;
}

const mark = (pass) => pass === undefined ? "–" : pass ? "✅" : "❌";
const usd = (n) => n === null ? "unknown" : `$${n.toFixed(4)}`;
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
const tok = (t) => `${t.input + t.cacheRead + t.cacheWrite} in · ${t.output} out`;

/** A short markdown summary of one run. */
export function summary(run) {
  const lines = [`## Skill evals · ${run.model} · kit ${run.kitVersion}`, ""];
  const t = run.totals;
  const unknown = t.costUnknown ? ` (${t.costUnknown} run(s) reported no cost)` : "";
  lines.push(`${run.scenarios.length} scenario(s), ${t.runs} run(s), ${sec(t.durationMs)} of agent time.`);
  lines.push(`Estimated cost: **${usd(t.costUsd)}**${unknown}. Tokens: ${tok(t.tokens)}. Claude Code's own estimate, not a bill.`, "");
  lines.push("| Scenario | Verdict | With kit | Without | Cost (with / without) | Time (with / without) |", "|---|---|---|---|---|---|");
  for (const s of run.scenarios) {
    const w = s.arms.with, o = s.arms.without;
    const count = (arm) => `${arm.checks.filter((c) => c.pass).length}/${arm.checks.length}${arm.status === "ok" ? "" : ` (${arm.status})`}`;
    lines.push(`| ${s.name} | ${s.verdict} | ${count(w)} | ${count(o)} | ${usd(w.costUsd)} / ${usd(o.costUsd)} | ${sec(w.durationMs)} / ${sec(o.durationMs)} |`);
  }
  for (const s of run.scenarios) {
    lines.push("", `### ${s.name}: ${s.verdict}`, "", "| Check | With | Without |", "|---|---|---|");
    const without = new Map(s.arms.without.checks.map((c) => [c.id, c]));
    for (const c of s.arms.with.checks) {
      const detail = c.pass ? "" : c.detail ? ` (${c.detail})` : "";
      lines.push(`| ${c.id} | ${mark(c.pass)}${detail} | ${mark(without.get(c.id)?.pass)} |`);
    }
    for (const w of s.warnings ?? []) lines.push("", `⚠️ ${w}`);
    if (s.manual?.length) lines.push("", "Check by hand (needs judgement, not automated):", ...s.manual.map((m) => `- ${m}`));
  }
  // Opt-in scenarios left out of this run, so a reader of the summary knows they weren't checked (#147).
  if (run.optedOut?.length) lines.push("", `Opt-in, not in this run: ${run.optedOut.join(", ")}. Name them with --scenario.`);
  lines.push("", `Exit: ${run.exitCode === 0 ? "pass" : "fail"}.`);
  return lines.join("\n") + "\n";
}
