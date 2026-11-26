// The preflight-blocked scenario's transcripts (#180, split from run.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSetup, skipWin } from "./harness.mjs";
import { SCENARIO_PLANS } from "./scenario-plans.mjs";

// AC-5 of #100: the fixes sent one at a time, as two messages with two pings, fail one-message and
// one-ping, and nothing else. The batched transcript (one message, one ping) passes every check.
const setupStep = (title, fix) => `Setup step for you · ${title} · about 5 minutes\n\n1. ${fix}\n\nTried: a project-local cache with --prefer-offline (empty), npm install as one plain command (refused).\nWhen it worked: preflight shows every row green.\n`;
const REGISTRY_STEP = setupStep("Open the package registry", "Package registry: allow network access to the registry, or point .npmrc at one that answers.");
const NODE_STEP = setupStep("Install a newer Node", "Node: install Node 99 or newer, then start the agent again in this folder.");
const blockerIssue = (n, title, body) => `# #${n} ${title}\n\nLabels: needs-human, blocker\n\n${body}`;
const blockerPing = (n, title) => ({ tool: "Bash", input: { command: `node .claude/hooks/notify.mjs --level blocker --issue ${n} --title "${title}"` }, ok: true });
const REGISTRY_ISSUE = blockerIssue(2, "Open the package registry", REGISTRY_STEP);
const PREFLIGHT_DRIP = {
  "an issue per fix": [
    { write: "docs/issues/002-open-the-registry.md", content: REGISTRY_ISSUE }, blockerPing(2, "Open the package registry"),
    { write: "docs/issues/003-install-a-newer-node.md", content: blockerIssue(3, "Install a newer Node", NODE_STEP) }, blockerPing(3, "Install a newer Node"),
  ],
  "a second message on the same issue": [
    { write: "docs/issues/002-open-the-registry.md", content: REGISTRY_ISSUE }, blockerPing(2, "Open the package registry"),
    { write: "docs/issues/002-open-the-registry.md", content: `${REGISTRY_ISSUE}\n## Comments\n\n${NODE_STEP}` }, blockerPing(2, "One more: install a newer Node"),
  ],
};
test("AC-100-5: preflight-blocked: fixes sent one at a time fail one-message and one-ping, and only those; one batched message passes", { skip: skipWin }, (t) => {
  const plan = SCENARIO_PLANS["preflight-blocked"];
  const [preflight, install] = plan.with.steps;
  const done = { text: "Nothing is scaffolded: installs are blocked. The fixes are in docs/issues/." };
  const cases = [...Object.entries(PREFLIGHT_DRIP).map(([name, drip]) => [name, [preflight, install, ...drip, done], ["AC-5-one-message", "AC-5-one-ping"]]), ["batched", plan.with.steps, []]];
  for (const [name, steps, want] of cases) {
    const { run, resultsFile } = cleanSetup(t, { "preflight-blocked": { with: { steps }, without: plan.without } });
    run("--scenario", "preflight-blocked");
    const failed = resultsFile().runs[0].scenarios[0].arms.with.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, want, name);
  }
});
