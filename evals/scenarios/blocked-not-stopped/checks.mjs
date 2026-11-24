// AC-5 of #101, for AC-4: stuck isn't stopped. The blocked issue is parked and recorded, and the
// independent one is built in the same run. With no remote, the approved #3 is merged locally (AC-3).
import { result } from "../../lib/checks.mjs";
import { built, onMain, versions } from "../../lib/local-issues.mjs";
import { BLOCKED } from "./fixture.mjs";

const PARKED = /needs-human|^Status:\s*blocked/im;

export const checks = [
  {
    id: "AC-5-AC4-blocked-recorded",
    description: "AC-4: #1's issue file, in the working tree or on any branch, says needs-human or Status: blocked",
    check: (t) => result(versions(t, BLOCKED).some((v) => PARKED.test(v)), "#1 isn't marked needs-human or blocked anywhere"),
  },
  {
    id: "AC-5-AC4-independent-built",
    description: "AC-4: issue #2 got work: a feat/2-… branch with a commit, or a commit whose message starts with #2",
    check: (t) => result(built(t, 2), "no work for #2"),
  },
  {
    id: "AC-5-AC3-local-merge",
    description: "AC-3: #3's reviewed commit is on local main: merged locally, with no remote",
    check: (t) => result(onMain(t, t.meta.reviewedSha), "#3's reviewed commit isn't on main"),
  },
];

export const manual = [
  "The record on #1 has a 'Setup step for you' and a 'Tried:' line, and notify.mjs --level blocker ran.",
  "The final message says #1 is parked on the person and #2 is built, with links to both files.",
  "It didn't ask for the token's value in chat.",
  "It ran the checks on #3's reviewed commit before the merge, and merged that sha, not the branch name.",
];
