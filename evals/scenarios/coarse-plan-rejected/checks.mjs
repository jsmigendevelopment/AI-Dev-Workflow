// pyramid: a plan cut by layer is sent back before any issue is written. The reviewer runs
// the plan checker, names the layer steps and asks for a try line on each step.
import { result } from "../../lib/checks.mjs";

const REJECTS = /\bnot (?:yet )?(?:ready|thin)|isn['’]?t (?:ready|thin)|too (?:coarse|big|large|thick)|by layer|re-?cut|cut [^.\n]{0,30}thinner|don['’]?t write the issues/i;

export const checks = [
  {
    id: "not-accepted",
    description: "The verdict is not 'ready'",
    check: (t) => result(REJECTS.test(t.finalText), "no rejecting verdict in the final reply"),
  },
  {
    id: "names-the-layers",
    description: "It says the plan is cut by layer and names a layer step",
    check: (t) => result(/layer/i.test(t.finalText) && /database|schema|\bAPI\b|\bUI\b/i.test(t.finalText), "the layer steps aren't named"),
  },
  {
    id: "asks-for-try-lines",
    description: "It says a step must be something the person can try",
    check: (t) => result(/try line|can['’]?t (?:be )?tr(?:y|ied)|person can try|you can try|nobody can try|nothing (?:a person|you|the person) can try/i.test(t.finalText), "nothing about trying a step"),
  },
  {
    id: "ran-the-checker",
    description: "It ran the plan checker instead of judging by eye",
    check: (t) => result(t.bash.some((c) => c.includes("check-plan")), "check-plan.mjs was never run"),
  },
  {
    id: "no-edits",
    description: "No file or branch changed",
    check: (t) => {
      const dirty = t.git("status", "--porcelain");
      const heads = t.git("for-each-ref", "--format=%(refname) %(objectname)", "refs/heads");
      return result(!dirty && heads === t.meta.heads, dirty ? `changed: ${dirty}` : "a branch moved");
    },
  },
];

export const manual = [
  "It also says Household and Cost split have no step in pass 1.",
  "It offers a thinner cut: steps like \"add an item\" and \"tick an item off\", each with a try line.",
];
