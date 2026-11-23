#!/usr/bin/env node
// Turns the harness's results file in raw/ into this run's tidy results.csv: one row per value.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = "2026-11-23-evals";
const MACHINE = "cloud-linux";
const file = readdirSync(join(HERE, "raw")).find((f) => f.endsWith(".json"));
const { runs } = JSON.parse(readFileSync(join(HERE, "raw", file), "utf8"));
const rows = ["run,machine,case,metric,unit,iteration,phase,value,status"];
runs.forEach((run, n) => {
  for (const s of run.scenarios) {
    for (const [arm, a] of Object.entries(s.arms)) {
      const status = a.status === "ok" ? "ok" : "failed";
      const add = (metric, unit, value) => rows.push([RUN, MACHINE, `${s.name}:${arm}`, metric, unit, n + 1, "measure", value ?? "", value === null || value === undefined ? "failed" : status].join(","));
      add("checks_passed", "count", a.checks.filter((c) => c.pass).length);
      add("checks_total", "count", a.checks.length);
      if (arm === "with") add("scenario_pass", "flag", s.verdict === "pass" ? 1 : 0);
      add("cost_usd", "usd", a.costUsd);
      add("duration_s", "s", Math.round(a.durationMs / 1000));
    }
  }
});
writeFileSync(join(HERE, "results.csv"), rows.join("\n") + "\n");
console.log(`${runs.length} run(s), ${rows.length - 1} rows`);
