// Which checks main requires, for setup-github.mjs: only `onrails/check`, the commit status the local
// merge gate posts through the REST API (`coordinate`). Never a GitHub Actions check: the kit's repos
// run no workflows (`ci = "local"` in docs/stack.md), and a required check that never reports blocks
// every merge.

/** The one required status: the local merge gate's. */
export const LOCAL_CHECK = "onrails/check";

/** The checks the kit's old workflows reported. A rule that still requires one waits forever. */
export const ACTIONS_CHECKS = ["checks", "secrets", "agent-files", "ci", "pr-rules", "issue-link", "size", "preview", "visual", "semgrep", "supply-chain", "research", "web-e2e"];

/** The required status checks for a new ruleset. */
export const requiredChecks = () => [{ context: LOCAL_CHECK }];

/**
 * An existing ruleset's rules with the old workflows' checks swapped for `onrails/check`, or null
 * when nothing changes. Any other required check stays.
 */
export function localChecks(rules) {
  const checks = rules.find((r) => r.type === "required_status_checks");
  const listed = checks?.parameters?.required_status_checks ?? [];
  const kept = listed.filter((c) => !ACTIONS_CHECKS.includes(c.context));
  const want = kept.some((c) => c.context === LOCAL_CHECK) ? kept : [...kept, { context: LOCAL_CHECK }];
  if (checks && want.length === listed.length && want.every((c, i) => c === listed[i])) return null;
  if (!checks) return [...rules, { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: want } }];
  return rules.map((r) => (r === checks ? { ...r, parameters: { ...r.parameters, required_status_checks: want } } : r));
}
