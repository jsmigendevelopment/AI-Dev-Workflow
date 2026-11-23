#!/usr/bin/env node
// One-time GitHub setup for a repo that uses this kit. An agent runs it for the person:
// first with --dry-run, shows the result, and runs it for real only after the person says yes.
//   node .agents/skills/name/scripts/setup-github.mjs --dry-run   (show what it would do)
//   node .agents/skills/name/scripts/setup-github.mjs             (do it)
// Needs the GitHub CLI (`gh`) signed in as a repo admin. Run it again any time: it skips what's done.
// Each step says what it needs. Steps your plan doesn't allow are skipped with the reason.
import { execFileSync } from "node:child_process";

const DRY = process.argv.includes("--dry-run");
const run = (args, input) =>
  execFileSync("gh", args, { encoding: "utf8", input, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
const api = (method, path, body) =>
  run(["api", "-X", method, path, ...(body ? ["--input", "-"] : [])], body ? JSON.stringify(body) : undefined);
const results = [];
async function step(name, needs, fn) {
  if (DRY) return results.push(["would do", name, needs]);
  try {
    const note = await fn();
    results.push(["done", name, note || ""]);
  } catch (e) {
    const msg = String(e.stderr || e.message).split("\n").find((l) => l.trim()) || "failed";
    const plan = /upgrade|not available|plan|403|Advanced Security|Secret Protection/i.test(msg);
    results.push([plan ? "skipped" : "failed", name, plan ? `needs ${needs}` : msg.slice(0, 160)]);
  }
}

let repo, me, visibility;
try {
  const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  repo = url.replace(/\.git$/, "").match(/github\.com[:/]([^/]+\/[^/]+)$/)[1];
  visibility = run(["api", `repos/${repo}`, "--jq", ".visibility"]).trim();
  me = JSON.parse(run(["api", "user"]));
} catch {
  console.error("Couldn't read the GitHub repo. Run this inside the repo, after `gh auth login`.");
  process.exit(1);
}
console.log(`${DRY ? "Dry run for" : "Setting up"} ${repo} (${visibility}), as ${me.login}\n`);

// 1. Labels the workflow uses.
const labels = [
  ["priority:p0", "b60205"], ["priority:p1", "d93f0b"], ["priority:p2", "fbca04"], ["priority:p3", "c5def5"],
  ["pass:1", "1d76db"], ["pass:2", "5319e7"], ["pass:3", "8b5cf6"],
  ["slice:core", "8b5cf6"], ["slice:support", "bfd4f2"],
  ["lane:tiny", "c2e0c6"], ["lane:normal", "0e8a16"], ["lane:risky", "b60205"],
  ["status:ready", "0e8a16"], ["status:in-progress", "fbca04"], ["needs-human", "d93f0b"], ["human-approved", "5319e7"],
];
await step("labels", "nothing (free)", () => {
  for (const [name, color] of labels) run(["label", "create", name, "--color", color, "--force", "--repo", repo]);
  return `${labels.length} labels`;
});

// 2. Dependabot: alerts and automatic security-fix pull requests. Free on every plan.
await step("dependabot alerts", "nothing (free)", () => api("PUT", `repos/${repo}/vulnerability-alerts`));
await step("dependabot security fixes", "nothing (free)", () => api("PUT", `repos/${repo}/automated-security-fixes`));

// 3. Secret scanning and push protection. Free on public repos; private repos need GitHub Secret Protection.
await step("secret scanning + push protection", "a public repo, or the Secret Protection add-on", () =>
  api("PATCH", `repos/${repo}`, {
    security_and_analysis: { secret_scanning: { status: "enabled" }, secret_scanning_push_protection: { status: "enabled" } },
  }),
);

// 4. Rules on main: pull requests only, no force push or delete, green checks required.
//    No approval required: GitHub won't let the author approve their own pull request.
await step("rules on main", "a public repo, or GitHub Team for private", () =>
  api("POST", `repos/${repo}/rulesets`, {
    name: "protect-main",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "pull_request", parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false } },
      { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "checks" }, { context: "secrets" }, { context: "agent-files" }] } },
    ],
  }),
);

// 5. Environments. `test` deploys from main. `production` deploys from main only
//    and waits for the person's approval. Put production secrets in the production environment only.
const envFromMain = async (name, body) => {
  api("PUT", `repos/${repo}/environments/${name}`, {
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    ...body,
  });
  try {
    api("POST", `repos/${repo}/environments/${name}/deployment-branch-policies`, { name: "main", type: "branch" });
  } catch (e) {
    if (!/already exists/i.test(String(e.stderr))) throw e;
  }
};
await step("environment: test (deploys from main)", "a public repo, or GitHub Team for private", () => envFromMain("test", {}));
await step("environment: production (main only, waits for you)", "a public repo, or GitHub Team for private", () =>
  envFromMain("production", { reviewers: [{ type: "User", id: me.id }], prevent_self_review: false }),
);

const width = Math.max(...results.map((r) => r[1].length));
for (const [status, name, note] of results) console.log(`${status.padEnd(9)} ${name.padEnd(width)}  ${note}`);
if (!DRY) console.log("\nNext: put production keys in the production environment's secrets, never in the repo.");
