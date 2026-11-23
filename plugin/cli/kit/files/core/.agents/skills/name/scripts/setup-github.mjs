#!/usr/bin/env node
// One-time GitHub setup for a repo that uses this kit. An agent runs it for the person:
// first with --dry-run, shows the result, and runs it for real only after the person says yes.
//   node .agents/skills/name/scripts/setup-github.mjs --dry-run [--plan free|team|enterprise]
//   node .agents/skills/name/scripts/setup-github.mjs [--plan free|team|enterprise]
// Needs the GitHub CLI (`gh`) signed in as a repo admin. Run it again any time: it skips what's done.
// The plan comes from --plan, else `github_plan` in docs/profile.toml or ~/.ai-dev-workflow/profile.toml,
// else it asks. Each step says which plan it needs. Steps your plan doesn't allow are skipped with the reason.
//   Free:        Dependabot on every repo. Rules, environments and secret scanning on public repos only.
//   Team:        adds rules on main, environments, deployment branches and environment secrets on
//                private repos (also draft PRs, code owners and required reviewers on pull requests).
//                A personal account's Pro plan gets the same steps here: pass --plan team.
//   Enterprise:  Team, plus environment protection rules on private repos, such as a required
//                reviewer before a production deploy. Public repos get them on every plan.
// It reads the repo from the git remote and calls only the REST API (no GraphQL, no `gh repo view`).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const PLANS = ["free", "team", "enterprise"];
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");

const run = (cmd, input) =>
  execFileSync("gh", cmd, { encoding: "utf8", input, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
const api = (method, path, body) =>
  run(["api", "-X", method, path, ...(body ? ["--input", "-"] : [])], body ? JSON.stringify(body) : undefined);
const git = (cmd) => execFileSync("git", cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// --- Which plan? --plan, then the profile, then ask. ---
function planFromArgs() {
  const i = args.findIndex((a) => a === "--plan" || a.startsWith("--plan="));
  if (i === -1) return null;
  const value = args[i].includes("=") ? args[i].split("=")[1] : args[i + 1];
  return { plan: (value || "").toLowerCase(), from: "--plan" };
}
function planFromProfile() {
  let root = ".";
  try { root = git(["rev-parse", "--show-toplevel"]); } catch {}
  for (const file of [join(root, "docs", "profile.toml"), join(homedir(), ".ai-dev-workflow", "profile.toml")]) {
    if (!existsSync(file)) continue;
    const value = /^github_plan\s*=\s*"([^"\n]*)"/m.exec(readFileSync(file, "utf8"))?.[1]?.trim().toLowerCase();
    if (value) return { plan: value, from: file };
  }
  return null;
}
async function planFromPerson() {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Which GitHub plan is this repo's owner on? (free / team / enterprise) ")).trim().toLowerCase();
  rl.close();
  return { plan: answer, from: "your answer" };
}
const chosen = planFromArgs() || planFromProfile() || (await planFromPerson());
if (!chosen) {
  console.error("Which GitHub plan is the repo's owner on? Ask the person, then run again with --plan free|team|enterprise.");
  process.exit(2);
}
if (chosen.plan === "pro") chosen.plan = "team"; // a personal account's Pro gets the same steps as Team
if (!PLANS.includes(chosen.plan)) {
  console.error(`Unknown plan "${chosen.plan}" (from ${chosen.from}). Use free, team or enterprise (pro counts as team).`);
  process.exit(2);
}
const PLAN = chosen.plan;

// --- The repo, from the git remote. ---
let repo, me, visibility;
try {
  const url = git(["remote", "get-url", "origin"]);
  repo = url.replace(/\/+$/, "").replace(/\.git$/, "").match(/github\.com[:/]([^/]+\/[^/]+)$/)[1];
  visibility = run(["api", `repos/${repo}`, "--jq", ".visibility"]).trim();
  me = JSON.parse(run(["api", "user"]));
} catch {
  console.error("Couldn't read the GitHub repo. Run this inside the repo, with a github.com `origin` remote, after `gh auth login`.");
  process.exit(1);
}
const PUBLIC = visibility === "public";

// --- What each step needs. `min` is the lowest plan that allows it on a private repo. ---
const ANY = { min: "free", label: "any plan" };
const TEAM = { min: "team", label: "public repo, or Team if private" };
const ENTERPRISE = { min: "enterprise", label: "public repo, or Enterprise if private" };
// Secret Protection is a paid add-on for Team and Enterprise. The plan alone can't say if it's on.
const SECRET_PROTECTION = { min: "team", label: "public repo, or the Secret Protection add-on if private" };
const allowed = (needs) => PUBLIC || PLANS.indexOf(PLAN) >= PLANS.indexOf(needs.min);

const results = [];
async function step(name, needs, fn) {
  if (!allowed(needs)) return results.push(["skipped", name, needs.label, `your plan is ${PLAN} and this repo is ${visibility}`]);
  if (DRY) return results.push(["would do", name, needs.label, ""]);
  try {
    const note = await fn();
    results.push(["done", name, needs.label, typeof note === "string" && !/^\s*[{\[]/.test(note) ? note.trim() : ""]);
  } catch (e) {
    const msg = String(e.stderr || e.message).split("\n").find((l) => l.trim()) || "failed";
    const plan = /upgrade|not available|plan|403|Advanced Security|Secret Protection/i.test(msg);
    results.push([plan ? "skipped" : "failed", name, needs.label, plan ? "GitHub says this account's plan doesn't include it" : msg.slice(0, 160)]);
  }
}

console.log(`${DRY ? "Dry run for" : "Setting up"} ${repo} (${visibility}), as ${me.login}, on the ${PLAN} plan (from ${chosen.from})\n`);

// 1. Labels the workflow uses.
const labels = [
  ["priority:p0", "b60205"], ["priority:p1", "d93f0b"], ["priority:p2", "fbca04"], ["priority:p3", "c5def5"],
  ["pass:1", "1d76db"], ["pass:2", "5319e7"], ["pass:3", "8b5cf6"],
  ["slice:core", "8b5cf6"], ["slice:support", "bfd4f2"],
  ["lane:tiny", "c2e0c6"], ["lane:normal", "0e8a16"], ["lane:risky", "b60205"],
  ["status:ready", "0e8a16"], ["status:in-progress", "fbca04"], ["needs-human", "d93f0b"], ["human-approved", "5319e7"],
];
await step("labels", ANY, () => {
  for (const [name, color] of labels) run(["label", "create", name, "--color", color, "--force", "--repo", repo]);
  return `${labels.length} labels`;
});

// 2. Dependabot: alerts and automatic security-fix pull requests. Free on every plan.
await step("dependabot alerts", ANY, () => api("PUT", `repos/${repo}/vulnerability-alerts`));
await step("dependabot security fixes", ANY, () => api("PUT", `repos/${repo}/automated-security-fixes`));

// 3. Secret scanning and push protection. Free on public repos; private repos need GitHub Secret Protection.
await step("secret scanning + push protection", SECRET_PROTECTION, () =>
  api("PATCH", `repos/${repo}`, {
    security_and_analysis: { secret_scanning: { status: "enabled" }, secret_scanning_push_protection: { status: "enabled" } },
  }),
);

// 4. Rules on main: pull requests only, no force push or delete, green checks required.
//    No approval required: GitHub won't let the author approve their own pull request.
//    A free private repo relies on the kit's blocked git commands instead.
await step("rules on main", TEAM, () => {
  const existing = JSON.parse(run(["api", `repos/${repo}/rulesets`]));
  if (existing.some((r) => r.name === "protect-main")) return "already there";
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
  });
});

// 5. Environments. `test` and `production` deploy from main only. Put production secrets
//    in the production environment only.
const fromMain = { deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } };
const envFromMain = async (name) => {
  api("PUT", `repos/${repo}/environments/${name}`, fromMain);
  try {
    api("POST", `repos/${repo}/environments/${name}/deployment-branch-policies`, { name: "main", type: "branch" });
  } catch (e) {
    if (!/already exists/i.test(String(e.stderr))) throw e;
  }
};
await step("environment: test (deploys from main)", TEAM, () => envFromMain("test"));
await step("environment: production (deploys from main)", TEAM, () => envFromMain("production"));

// 6. Production waits for you: you are its required reviewer. This is an environment protection
//    rule, so a private repo needs Enterprise; Team and Pro don't include it. A separate step,
//    so a Team repo still gets the production environment above. Without it, the deploy
//    workflow's manual start is the gate: only you start a production deploy.
await step("production: waits for your approval", ENTERPRISE, () =>
  api("PUT", `repos/${repo}/environments/production`, {
    ...fromMain,
    reviewers: [{ type: "User", id: me.id }],
    prevent_self_review: false,
  }),
);

const w1 = Math.max(...results.map((r) => r[1].length));
const w2 = Math.max(...results.map((r) => r[2].length));
console.log(`${"status".padEnd(9)} ${"step".padEnd(w1)}  ${"needs".padEnd(w2)}  note`);
for (const [status, name, needs, note] of results) {
  console.log(`${status.padEnd(9)} ${name.padEnd(w1)}  ${needs.padEnd(w2)}  ${note}`.trimEnd());
}

if (!PUBLIC) {
  const notes = {
    free: [
      "No rules on main, environments or secret scanning on a free private repo.",
      "Builders open normal pull requests (no drafts), and the kit's blocked git commands guard main.",
      "Team adds rules and environments; Enterprise also adds the production approval. A public repo gets all of it free.",
    ],
    team: [
      "Rules on main, environments and environment secrets are on. Draft pull requests work.",
      "Production can't wait for your approval on a private repo without Enterprise. Only you start a",
      "production deploy (it's a manual run), so that is the gate.",
    ],
    enterprise: ["Every step here is on your plan. Secret scanning still needs the Secret Protection add-on."],
  };
  console.log(`\nThis repo is ${visibility}, on the ${PLAN} plan:\n${notes[PLAN].map((l) => `  ${l}`).join("\n")}`);
}
if (!DRY) console.log("\nNext: put production keys in the production environment's secrets, never in the repo.");
