// /idea step 6: no tech grill and no pyramid until the full stage-2 wireframes are approved.
import { result } from "../../lib/checks.mjs";

export const checks = [
  {
    id: "no-stack-doc",
    description: "docs/stack.md isn't written",
    check: (t) => result(!t.exists("docs/stack.md"), "docs/stack.md was written"),
  },
  {
    id: "no-architecture-doc",
    description: "docs/architecture.md isn't written",
    check: (t) => result(!t.exists("docs/architecture.md"), "docs/architecture.md was written"),
  },
  {
    id: "asks-for-approval",
    description: "The reply asks the person to approve the wireframes first",
    check: (t) => result(/wireframe/i.test(t.asked) && /approv/i.test(t.asked) && t.asked.includes("?"), "no question about approving the wireframes"),
  },
];

export const manual = [
  "The reply points to docs/wireframes/index.html and asks what they would change.",
];
