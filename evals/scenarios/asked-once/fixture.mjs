// The flatshare kickoff, where the repo already answers everything this step could ask:
// the person said yes to the strongest tier for this session, and picked the automation level.
import { repo } from "../../lib/fixture.mjs";
import { flatshareDocs } from "../../lib/flatshare.mjs";

export function build(dir) {
  const docs = flatshareDocs();
  repo(dir, {
    ...docs,
    "docs/profile.toml": "[defaults]\nautomation = \"recommended\"\nrisk_dial = \"move-fast\"\n\n[routing]\nstrongest = \"Claude Fable 5.2\"\nask_before_strongest = true\n",
    "docs/stack.md": "# Stack\n\nTanStack Start, Cloudflare Workers, D1 with Drizzle, Clerk, shadcn/ui. Tests: Vitest and Playwright.\n\n## Risk dial\n\n- [x] **Move fast**\n",
    "docs/decisions.md": docs["docs/decisions.md"].replace(/\| 5 \|[^\n]*\n/, "| 5 | 2026-11-25 | Strongest tier: yes for this session, every CTO job. Don't ask again | chosen | person |\n"),
    "docs/state.md": "# State\n\n- **Phase:** planning\n- **Environment:** ok · checked 2026-11-25T09:00Z · claude · fp 000000000000\n- **Strongest tier:** yes · kickoff session · 2026-11-25T09:02Z\n- **Last done:** the tech grill. The person picked the automation level: Recommended (decision 1).\n- **Next up:** write the \"Automation level\" section of docs/stack.md.\n",
  });
}
