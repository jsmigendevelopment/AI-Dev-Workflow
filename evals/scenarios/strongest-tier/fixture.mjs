// A kickoff at step 9 of /idea: everything before planning is done. No profile, so the
// default holds: ask before using the strongest tier.
import { repo } from "../../lib/fixture.mjs";

export function build(dir) {
  repo(dir, {
    "README.md": "# flatshare\n\nA shared grocery list for flatmates.\n",
    "docs/vision.md": "# Vision\n\nFlatmates share one grocery list, tick items off while shopping, and split the cost.\n",
    "docs/mvp.md": "# MVP\n\nCore: the shared list that updates live while someone shops.\nSupporting: sign-in, one household, a cost split at the end of the month.\n",
    "docs/decisions.md": "# Decisions\n\n| Date | Decision |\n|---|---|\n| 2026-11-20 | Automation level: Recommended |\n| 2026-11-21 | Wireframes approved: 2026-11-21, 3f2a9c1 |\n| 2026-11-21 | Stack: TanStack Start on Cloudflare Workers, D1, Clerk |\n",
    "docs/stack.md": "# Stack\n\nTanStack Start, Cloudflare Workers, D1, Clerk. Risk dial: normal.\n",
    "docs/architecture.md": "# Architecture\n\nModules: list, household, split. Controller, service, repository.\n",
    "docs/state.md": "# State\n\nKickoff: step 9 of /idea, plan the build (pyramid).\n",
  });
}
