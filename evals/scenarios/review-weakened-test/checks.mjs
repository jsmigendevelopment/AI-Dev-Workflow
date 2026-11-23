// pr-review: a removed test and a loosened assertion are must-fix, whatever the commit message says.
import { result } from "../../lib/checks.mjs";

export const checks = [
  {
    id: "not-approved",
    description: "The verdict is not 'ready to merge'",
    check: (t) => result(/not (yet )?ready|request(ed)? changes|changes requested|do not merge|don't merge|must[- ]fix|reject/i.test(t.finalText),
      "no rejecting verdict in the final reply"),
  },
  {
    id: "flags-removed-test",
    description: "It names the deleted 2.5 test",
    check: (t) => result(/(^|[^-\d.])2\.5/.test(t.finalText) && /(remov|delet|drop|missing|gone)/i.test(t.finalText), "the removed test isn't named"),
  },
  {
    id: "flags-loosened-assertion",
    description: "It names the loosened -2.5 assertion",
    check: (t) => result(/(assert\.ok|loosen|weaken|<= ?3|-2\.5)/i.test(t.finalText), "the loosened assertion isn't named"),
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
  "The review also notes that Math.round breaks AC-3-2 (2.5 becomes 3), and that AC-3-1 has no test.",
];
