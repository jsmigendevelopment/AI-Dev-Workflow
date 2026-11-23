#!/usr/bin/env node
// A stand-in for `claude -p --output-format stream-json` in the harness tests. No network.
// The test copies it as `claude` into a temp bin folder on PATH, next to a plan.json:
//   { "<scenario>": { "with": <plan>, "without": <plan> }, "*": {...} }
// A plan: { steps: [step], cost, tokens: { input, output, cacheRead, cacheWrite }, sleep, exit, noResult }
// A step: { text } | { write: path, content } | { bash: command } | { tool: name, input }.
// The arm is "with" when the folder has .onrails.json; the scenario comes from the runner's
// temp folder name (evals-<scenario>-XXXXXX/<arm>/repo). Every call is logged to calls.jsonl.
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => argv[argv.indexOf(name) + 1];
const cwd = process.cwd();
const arm = existsSync(join(cwd, ".onrails.json")) ? "with" : "without";
const scenario = basename(dirname(dirname(cwd))).match(/^evals-(.+)-[A-Za-z0-9]{6}$/)?.[1] ?? "?";
const plans = JSON.parse(readFileSync(join(here, "plan.json"), "utf8"));
const plan = plans[scenario]?.[arm] ?? plans["*"]?.[arm] ?? {};
const model = flag("--model");

let stdin = "";
for await (const chunk of process.stdin) stdin += chunk;
appendFileSync(join(here, "calls.jsonl"), JSON.stringify({ scenario, arm, argv, prompt: stdin }) + "\n");

const emit = (event) => process.stdout.write(JSON.stringify(event) + "\n");
emit({ type: "system", subtype: "init", model, claude_code_version: "0.0.0-fake", cwd, tools: ["Bash", "Write"],
  skills: arm === "with" ? ["build", "grill", "idea"] : [] });

let n = 0;
let lastText = "";
for (const step of plan.steps ?? []) {
  const id = `toolu_${++n}`;
  const message = (content) => emit({ type: "assistant", message: { id: `msg_${n}`, role: "assistant", content, usage: { input_tokens: 10, output_tokens: 5 } } });
  if (step.text !== undefined) {
    lastText = step.text;
    message([{ type: "text", text: step.text }]);
  } else if (step.write) {
    message([{ type: "tool_use", id, name: "Write", input: { file_path: join(cwd, step.write), content: step.content } }]);
    mkdirSync(dirname(join(cwd, step.write)), { recursive: true });
    writeFileSync(join(cwd, step.write), step.content);
    emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } });
  } else if (step.bash) {
    message([{ type: "tool_use", id, name: "Bash", input: { command: step.bash } }]);
    let out;
    try {
      out = execSync(step.bash, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      out = String(error.stdout ?? "") + String(error.stderr ?? "");
    }
    emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: out }] }] } });
  } else if (step.tool) {
    message([{ type: "tool_use", id, name: step.tool, input: step.input ?? {} }]);
    emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "denied", is_error: true }] } });
  }
}

if (plan.sleep) await new Promise((r) => setTimeout(r, plan.sleep * 1000));
if (!plan.noResult) {
  const t = { input: 100, output: 50, cacheRead: 1000, cacheWrite: 200, ...plan.tokens };
  const cost = plan.cost ?? 0.01;
  emit({ type: "result", subtype: "success", is_error: false, num_turns: n + 1, duration_ms: 5, result: lastText, total_cost_usd: cost,
    modelUsage: { [model]: { inputTokens: t.input, outputTokens: t.output, cacheReadInputTokens: t.cacheRead, cacheCreationInputTokens: t.cacheWrite, costUSD: cost } } });
}
process.exit(plan.exit ?? 0);
