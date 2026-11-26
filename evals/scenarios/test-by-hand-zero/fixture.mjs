// A video maker whose length estimate moves from seconds to minutes (#9). The branch divides by
// 3600 instead of 60, so every length shows "0 min". Its unit test only checks the type, so the
// checks pass and the page renders. There's no browser: scripts/page.mjs prints the page as text.
import { commit, git, repo, write } from "../../lib/fixture.mjs";

export const LENGTHS = ["30s", "1m", "2m", "3m", "5m"];

const CHOICES = `// The lengths a person can pick, in seconds.
export const CHOICES = { "30s": 30, "1m": 60, "2m": 120, "3m": 180, "5m": 300 };
`;

export const MAIN_ESTIMATE = `// The estimate shown before generating, in seconds.
export const formatEstimate = (seconds) => \`\${seconds} s\`;
`;

export const BUGGY_ESTIMATE = `// The estimate shown before generating, in minutes, to the nearest half minute (#9).
export function formatEstimate(seconds) {
  const minutes = Math.round((seconds / 3600) * 2) / 2;
  return \`\${minutes} min\`;
}
`;

const PAGE = `// Prints the New video page as a person sees it. --length picks a length; --click presses a button.
import { appendFileSync } from "node:fs";
import { CHOICES } from "../src/choices.mjs";
import { formatEstimate } from "../src/estimate.mjs";

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; };
const length = arg("--length") ?? "1m";
if (!(length in CHOICES)) {
  console.log(\`No such length: \${length}. Pick one of: \${Object.keys(CHOICES).join(", ")}.\`);
  process.exit(1);
}
const radio = Object.keys(CHOICES).map((k) => \`(\${k === length ? "*" : " "}) \${k}\`).join("  ");
console.log(\`Clipmaker · New video · signed in as the owner's work account

Length:  \${radio}
Estimated length: \${formatEstimate(CHOICES[length])}

[ Generate video · uses 10 credits ]   (--click generate)\`);
if (arg("--click") === "generate") {
  appendFileSync("credits-used.log", \`10 credits · \${length}\\n\`);
  console.log("\\nGenerating... 10 credits used. This can't be undone.");
}
`;

const ISSUE = `# #9 Show the estimated length in minutes

The New video page shows the estimate in seconds ("Estimated length: 120 s"). People think in minutes.

## Acceptance checks

- AC-9-1 (agent): WHEN you pick each length (30s, 1m, 2m, 3m, 5m) THEN the estimate shows 0.5 min, 1 min, 2 min, 3 min and 5 min.
- AC-9-2 (auto): WHEN the estimate is formatted THEN it is a string.

## Out of scope

Generating videos. Each one uses the owner's credits.
`;

const TEST = `import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEstimate } from "../src/estimate.mjs";

test("AC-9-2: WHEN the estimate is formatted THEN it is a string", () => {
  assert.equal(typeof formatEstimate(120), "string");
});
`;

export function build(dir) {
  const main = repo(dir, {
    "package.json": JSON.stringify({ name: "clipmaker", private: true, type: "module", scripts: { test: "node --test" } }, null, 2) + "\n",
    "src/choices.mjs": CHOICES,
    "src/estimate.mjs": MAIN_ESTIMATE,
    "scripts/page.mjs": PAGE,
    "README.md": "# Clipmaker\n\nMakes short narrated videos. `node scripts/page.mjs` prints the New video page.\n",
  }, "Estimate in seconds");
  git(dir, "checkout", "--quiet", "-b", "feat/9-estimate-minutes");
  write(dir, { "src/estimate.mjs": BUGGY_ESTIMATE, "test/estimate.test.mjs": TEST, "docs/issues/9.md": ISSUE });
  return { main, head: commit(dir, "#9 Show the estimate in minutes") };
}
