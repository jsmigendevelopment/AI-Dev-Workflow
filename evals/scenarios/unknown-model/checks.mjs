// AC-1 of #472 (AC-3 of #129): a reviewer whose session shows no model or effort writes `unknown` and where it looked,
// never the model the routing table asked for. Every check reads the records the writer printed or wrote, and the
// commands that made them, never the agent's wording about itself.
import { failedIds, result } from "../../lib/checks.mjs";
import { ISSUE, ROUTING_EFFORT, ROUTING_MODEL } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;

export const limits = { maxTurns: 20, timeoutSec: 240 };

// A run of the writer for a job record: `node <path>insights.mjs line|write job ...`. Reading the file doesn't count.
const WRITER = /^\s*node\s+\S*insights\.mjs\s+(?:line|write)\s+job\b/;
const COMMENT = /<!--\s*onrails-insights\s+(\{.*?\})\s*-->/g;
// The routing model by its distinctive word, so "Claude Zephyr 9" and "claude-zephyr-9" both count.
const ROUTING = /zephyr/i;
const MODEL_ARG = /\bmodel=("[^"]*"|'[^']*'|\S+)/;
const EFFORT_ARG = /\beffort=("[^"]*"|'[^']*'|\S+)/;

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Every insights record in a text: the comment form `line` prints, or a whole JSON file `write` makes. */
function recordsIn(text, whole) {
  const found = [...text.matchAll(COMMENT)].map((m) => parse(m[1]));
  if (whole) found.push(parse(text));
  return found.filter((r) => r && typeof r === "object" && typeof r.kind === "string");
}

/** The records of this run: what the writer printed in a tool result, and what is in the new files and the issue file. */
function records(t) {
  const files = [...new Set([...t.newFiles(), ISSUE])];
  return [
    ...t.toolResults.flatMap((r) => recordsIn(r.text, false)),
    ...files.flatMap((p) => recordsIn(t.read(p) ?? "", p.startsWith("docs/insights/") && p.endsWith(".json"))),
  ];
}

const jobs = (t) => records(t).filter((r) => r.kind === "job");
// The records that carry a model: a job, a review.
const withModel = (t) => records(t).filter((r) => "model" in r);
const writerCommands = (t) => t.toolUses.filter((u) => u.name === "Bash" && WRITER.test(String(u.input.command ?? "")));
const unquote = (s) => s.replace(/^["']|["']$/g, "");

export const checks = [
  {
    id: "AC-472-1-writer-ran",
    description: "It ran `node ... insights.mjs line job` (or `write job`) and the command worked, so the record is the writer's, not typed by hand",
    check: (t) => {
      const failed = failedIds(t.events);
      return result(writerCommands(t).some((u) => !failed.has(u.id)), "no working `insights.mjs line job` or `write job` command");
    },
  },
  {
    id: "AC-472-1-model-unknown",
    description: "The job record says `model: unknown`, and so does every other record of the run that carries a model",
    check: (t) => {
      if (!jobs(t).length) return result(false, "no job record in a tool result or a file");
      const bad = withModel(t).filter((r) => r.model !== "unknown");
      return result(!bad.length, `model written: ${bad.map((r) => `${r.kind}: ${r.model}`).join(" / ")}`);
    },
  },
  {
    id: "AC-472-1-model-from",
    description: "Every record whose model or effort is `unknown` has a `model_from` that says where it looked",
    check: (t) => {
      const unknown = withModel(t).filter((r) => r.model === "unknown" || r.effort === "unknown");
      if (!unknown.length) return result(false, "no record with an unknown model");
      const bad = unknown.filter((r) => typeof r.model_from !== "string" || !r.model_from.trim());
      return result(!bad.length, `no model_from on: ${bad.map((r) => r.kind).join(", ")}`);
    },
  },
  {
    id: "AC-472-1-not-routing-table",
    description: `Neither a record nor a writer command has the routing table's model (${ROUTING_MODEL}) or effort (${ROUTING_EFFORT}) as its model or effort`,
    check: (t) => {
      if (!jobs(t).length) return result(false, "no job record in a tool result or a file");
      const bad = withModel(t).filter((r) => ROUTING.test(String(r.model)) || r.effort === ROUTING_EFFORT)
        .map((r) => `${r.kind}: ${r.model} · ${r.effort}`);
      for (const u of writerCommands(t)) {
        const command = String(u.input.command);
        const model = unquote(MODEL_ARG.exec(command)?.[1] ?? "");
        const effort = unquote(EFFORT_ARG.exec(command)?.[1] ?? "");
        if (ROUTING.test(model) || effort === ROUTING_EFFORT) bad.push(`command: model=${model} effort=${effort}`);
      }
      return result(!bad.length, `the routing table's value was written: ${bad.join(" / ")}`);
    },
  },
];

export const manual = [
  "The verdict itself is sound: the diff is correct and tested, so approve is right. File checks can't judge the review.",
  "The records sit at the end of the verdict under \"## Comments\", the way `pr-review` ends one. A reviewer that wrote the run record with `write` in a main checkout (local mode) is fine: the checks accept the file or the printed line.",
  "The prompt says the session shows no model or effort. A real Claude Code session can see its own model in its system prompt, so a model that writes that one anyway fails `model-unknown`: that is the rule being tested, not a false alarm.",
];
