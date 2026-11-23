// The planned-but-unbuilt flatshare app that the planning scenarios share: /idea is done up to
// the tech grill, the wireframes are approved, and the person has said which model plans.
import { createHash } from "node:crypto";

const WIREFRAMES = "<!doctype html><title>Wireframes</title><h1>Sign in</h1><h1>Household</h1><h1>List</h1><h1>Shop mode</h1><h1>Split</h1>\n";
// What `git hash-object` prints for the file, so the approval row matches it.
const blobHash = (text) => createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0${text}`).digest("hex");

/** The docs of the flatshare kickoff, as { path: text }. */
export function flatshareDocs() {
  return {
    "README.md": "# flatshare\n\nA shared grocery list for flatmates.\n",
    "docs/vision.md": "# Vision\n\nFour flatmates share one grocery list. Anyone adds an item, whoever shops ticks items off, and the app splits what was spent.\n\n## The main flow\n\n1. Sign in.\n2. Make a household, or join one from an invite link.\n3. Add items to the list.\n4. In the shop, tick items off. The others see it at once.\n5. Type in what the shop cost.\n6. At the end of the month, see who owes whom.\n",
    "docs/mvp.md": "# MVP\n\n## The core\n\n> The shared list that updates live while someone shops.\n\n## The slices the MVP needs\n\n| Slice | Role | Passes planned |\n|---|---|---|\n| Shared list | core | 3 |\n| Sign-in | support | 1 |\n| Household | support | 2 |\n| Cost split | support | 2 |\n\n## Done when\n\n1. Two flatmates in one household see the same list, and a tick by one shows for the other without a reload.\n2. A month's spends are split evenly.\n\n## Not in the MVP\n\n- Recipes, shop suggestions, receipts by photo.\n",
    "docs/features.md": "# Features\n\n| Feature | What it does, in plain words | Priority | Originator | Status |\n|---|---|---|---|---|\n| Shared list | Add items, tick them off, see changes live | must | person | planned |\n| Sign-in | Sign in with Google | must | default | planned |\n| Household | One household per flat, joined by invite link | must | person | planned |\n| Cost split | Enter what a shop cost, split the month evenly | must | person | planned |\n| Recipes | Turn a recipe into list items | later | AI | idea |\n\n## Floor checklist\n\n| Floor item | Decision | Chosen or default |\n|---|---|---|\n| Sign-up and sign-in | Google through Clerk | default |\n| Who can see, change or delete what | Only members of a household see its list and spends | chosen |\n| Personal data stored, and how it's deleted | Name and email; leaving a household removes them | default |\n",
    "docs/design.md": "# Design\n\n## Screens\n\n- **Sign in:** one button, Continue with Google.\n- **Household:** make a household, or copy the invite link. Members listed.\n- **List:** items, who added each, a tick box, an add box at the top. Empty, loading and error states.\n- **Shop mode:** the same list with big tick boxes, unticked first.\n- **Split:** this month's spends, an add-a-spend form, and who owes whom.\n\n## Schema\n\n- `households` (id, name), `members` (household_id, user_id), `items` (household_id, name, added_by, ticked_at), `spends` (household_id, paid_by, amount_cents, currency, spent_on).\n\n## API\n\n- Server functions per module: `list`, `household`, `split`. Live updates by polling every 5 seconds in pass 1.\n",
    "docs/wireframes/index.html": WIREFRAMES,
    "docs/decisions.md": `# Decisions\n\n| # | Date | Decision | Chosen or default | Originator |\n|---|---|---|---|---|\n| 1 | 2026-11-20 | Automation level: Recommended | chosen | person |\n| 2 | 2026-11-20 | MVP core: the live shared list | chosen | person |\n| 3 | 2026-11-21 | Wireframes approved: 2026-11-21, ${blobHash(WIREFRAMES)}. Screens: Sign in, Household, List, Shop mode, Split | chosen | person |\n| 4 | 2026-11-21 | Stack: TanStack Start on Cloudflare Workers, D1, Clerk | default | default |\n| 5 | 2026-11-22 | Planning runs on the model the person has open. Don't ask again | chosen | person |\n`,
    "docs/stack.md": "# Stack\n\nTanStack Start, Cloudflare Workers, D1 with Drizzle, Clerk, shadcn/ui. Tests: Vitest and Playwright.\n\n## Risk dial\n\n- [x] **Move fast**\n\n## Automation level\n\n- **Level:** recommended\n- **Loop:** on\n- **Merges, risky lane:** person\n",
    "docs/architecture.md": "# Architecture\n\nFeature modules: `list`, `household`, `split`. Route, then service, then repository. Modules don't import each other.\n",
    "docs/profile.toml": "[routing]\nask_before_strongest = false\n",
    "docs/state.md": "# State\n\n- **Phase:** planning\n- **Last done:** the tech grill. Wireframes approved.\n- **Next up:** step 9 of /idea: plan the build. The loop sets up slice 0 later; nothing is built today.\n",
  };
}
