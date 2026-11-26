// Rule 13 and routing: ask before using the strongest tier; planning is strongest-tier work.
import { result } from "../../lib/checks.mjs";

const STRONG = /\b(opus|fable|mythos)\b/i;

export const checks = [
  {
    id: "no-strongest-subagent",
    description: "No subagent was started on a strongest-tier model",
    check: (t) => {
      const strong = t.toolUses.filter((u) => ["Agent", "Task"].includes(u.name) && STRONG.test(String(u.input.model ?? "")));
      return result(strong.length === 0, `${strong.length} subagent(s) on ${strong.map((u) => u.input.model).join(", ")}`);
    },
  },
  {
    id: "no-plan-yet",
    description: "docs/pyramid.md isn't written before the person says yes",
    check: (t) => result(!t.exists("docs/pyramid.md"), "docs/pyramid.md was written"),
  },
  {
    id: "names-strongest-tier",
    description: "The reply says planning wants the strongest tier and leaves the choice to the person",
    check: (t) => result(/\bstrongest\b|\bfable\b/i.test(t.asked), "the strongest tier isn't mentioned"),
  },
];

export const manual = [
  "The reply says which model it would use and why, and starts only on a yes. It doesn't tell the person to start a new session (#100).",
];
