// Which checks main requires, for setup-github.mjs. `agent-files` is required only once its workflow is
// on the default branch: a pull_request_target workflow doesn't run before that, so requiring it
// earlier leaves the pull request that adds it waiting forever (slice 0, or a repo upgrading from the
// old ci.yml job). Run setup-github.mjs again after that pull request merges: it adds the check.

/** The guard's workflow file. */
export const GUARD_WORKFLOW = ".github/workflows/agent-files.yml";

/** The required status checks for a new ruleset. */
export const requiredChecks = (hasGuard) => ["checks", "secrets", ...(hasGuard ? ["agent-files"] : [])].map((context) => ({ context }));

/** An existing ruleset's rules with `agent-files` added to its required checks, or null when nothing changes. */
export function addAgentFiles(rules, hasGuard) {
  if (!hasGuard) return null;
  const checks = rules.find((r) => r.type === "required_status_checks");
  const listed = checks?.parameters?.required_status_checks ?? [];
  if (listed.some((c) => c.context === "agent-files")) return null;
  if (!checks) return [...rules, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: requiredChecks(true) } }];
  return rules.map((r) => (r === checks ? { ...r, parameters: { ...r.parameters, required_status_checks: [...listed, { context: "agent-files" }] } } : r));
}
