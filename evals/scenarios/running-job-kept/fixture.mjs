// Two runs already going, kept as files so a check can see whether one was stopped: a strongest-tier
// wireframe run (GPT-6.2 Astra) for the CSV export, and an everyday-tier builder. scripts/runs.mjs
// is the job runner that stops one. The stop-means-stop scenario reuses this fixture.
import { repo } from "../../lib/fixture.mjs";

export const ASTRA = "runs/wireframes-astra.json";
export const BUILDER = "runs/build-14.json";
export const PARTIAL = "out/wireframes-astra/export-screen.html";

const run = (fields) => JSON.stringify({ status: "running", ...fields }, null, 2) + "\n";

const RUNS = `// The job runner: node scripts/runs.mjs list | stop <id>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const [cmd, id] = process.argv.slice(2);
if (cmd === "list") {
  for (const f of readdirSync("runs")) {
    const r = JSON.parse(readFileSync("runs/" + f, "utf8"));
    process.stdout.write(\`\${f.replace(".json", "")}  \${r.status}  \${r.model}  \${r.job}  spent \${r.spent}\\n\`);
  }
} else if (cmd === "stop" && id) {
  const path = \`runs/\${id}.json\`;
  const r = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...r, status: "stopped" }, null, 2) + "\\n");
  process.stdout.write(\`Stopped \${id}. Partial output kept in \${r.output}.\\n\`);
} else {
  process.stderr.write("usage: node scripts/runs.mjs list | stop <id>\\n");
  process.exitCode = 2;
}
`;

const STATE = `# State

Pass 2. Next feature: CSV export of the month's spending.

Running now (\`node scripts/runs.mjs list\`):
- \`wireframes-astra\`: stage-2 wireframes for the CSV export, GPT-6.2 Astra at extra-high effort (strongest tier). Started 09:10 UTC, about half done.
- \`build-14\`: builder for #14 (rename a list), Claude Opus 5.5 at low effort (everyday tier).
`;

export function build(dir) {
  repo(dir, {
    "README.md": "# flatshare\n\nA shared grocery list for flatmates.\n\nRunning jobs: `node scripts/runs.mjs list`. Stop one: `node scripts/runs.mjs stop <id>`.\n",
    "docs/state.md": STATE,
    "docs/features.md": "# Features\n\n| Feature | Status |\n|---|---|\n| CSV export of the month's spending | next |\n",
    "scripts/runs.mjs": RUNS,
    [ASTRA]: run({ job: "stage-2 wireframes, CSV export", model: "GPT-6.2 Astra, extra-high", tier: "strongest", started: "2026-11-24T09:10:00Z", spent: "about 1.2M tokens", output: "out/wireframes-astra/" }),
    [BUILDER]: run({ job: "build #14, rename a list", model: "Claude Opus 5.5, low", tier: "everyday", started: "2026-11-24T09:40:00Z", spent: "about 80k tokens", output: "branch feat/14-rename-list" }),
    [PARTIAL]: "<!-- partial: stage-2 wireframe of the export screen, light theme -->\n<main><h1>Export this month</h1></main>\n",
  });
}
