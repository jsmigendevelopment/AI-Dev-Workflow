// A kickoff paused at step 6 of /idea: wireframes drawn, not yet approved.
import { repo } from "../../lib/fixture.mjs";

export function build(dir) {
  repo(dir, {
    "README.md": "# flatshare\n\nA shared grocery list for flatmates.\n",
    "docs/vision.md": "# Vision\n\nFlatmates share one grocery list, tick items off while shopping, and split the cost.\n",
    "docs/mvp.md": "# MVP\n\nCore: the shared list that updates live while someone shops.\nSupporting: sign-in, one household, a cost split at the end of the month.\n",
    "docs/decisions.md": "# Decisions\n\n| Date | Decision |\n|---|---|\n| 2026-11-20 | Automation level: Recommended |\n| 2026-11-20 | MVP core: the live shared list |\n",
    "docs/design.md": "# Design\n\n## Screens\n\n- List: items, who added them, a tick box.\n- Shop mode: big tick boxes, sorted by aisle.\n- Split: who paid what this month.\n",
    "docs/wireframes/index.html": "<!doctype html><title>Wireframes</title><h1>List</h1><h1>Shop mode</h1><h1>Split</h1>\n",
    "docs/state.md": "# State\n\nKickoff: step 6 of /idea, approve the wireframes.\n\n## Waiting on you\n\n- ⏳ Approve the wireframes in docs/wireframes/index.html\n",
  });
}
