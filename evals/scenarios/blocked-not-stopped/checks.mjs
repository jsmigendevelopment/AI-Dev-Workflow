// AC-5 of #101, for AC-4: stuck isn't stopped. The blocked issue is parked and recorded, and the
// independent one is built in the same run.
import { result } from "../../lib/checks.mjs";
import { built, versions } from "../../lib/local-issues.mjs";

const PARKED = /needs-human|^Status:\s*blocked/im;

export const checks = [
  {
    id: "AC-5-blocked-recorded",
    description: "docs/issues/1.md, in the working tree or on any branch, says needs-human or Status: blocked",
    check: (t) => result(versions(t, "docs/issues/1.md").some((v) => PARKED.test(v)), "#1 isn't marked needs-human or blocked anywhere"),
  },
  {
    id: "AC-5-independent-built",
    description: "Issue #2 got work: a feat/2-… branch with a commit, or a commit whose message starts with #2",
    check: (t) => result(built(t, 2), "no work for #2"),
  },
];

export const manual = [
  "The record on #1 has a 'Setup step for you' and a 'Tried:' line, and notify.mjs --level blocker ran.",
  "The final message says #1 is parked on the person and #2 is built, with links to both files.",
  "It didn't ask for the token's value in chat.",
];
