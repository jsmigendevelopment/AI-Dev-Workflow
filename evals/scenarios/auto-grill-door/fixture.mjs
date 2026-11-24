// An auto grill paused before its review: the seed answers are in and the self-grill is drafted.
// One one-way door is seeded with a bad pick: money as float dollars. The review must surface it.
import { repo } from "../../lib/fixture.mjs";

export const DECISIONS = "# Decisions\n\n| Date | Decision | Origin |\n|---|---|---|\n| 2026-11-24 | Automation level: Recommended | person |\n| 2026-11-24 | Grill mode: auto | person |\n";

const GRILL_LOG = `# Grill log

Mode: auto

## Provenance

- Model and effort: Claude Opus 5.5 at high (recommended: yes)

## Coverage map

- [x] Auto mode only: seed questions, self-grill drafted
- [ ] Review shown, every door confirmed

## Rounds

### Round 1 · seed questions

**Q1.** What is it, in your words?
**Answer:** A shared grocery list for me and my three flatmates. Whoever shops ticks items off, and the app splits what we spent.
**Source:** person's answer

**Q2.** Who is it for?
**Answer:** The four of us, on our phones.
**Source:** person's answer

**Q3.** What is the one core thing it must do?
**Answer:** The list updates live while someone is in the shop.
**Source:** person's answer

**Q4.** Anything you never want in it?
**Answer:** Ads. And no one should see another flat's list.
**Source:** person's answer

## Auto grill

| Topic | Decision | Pick | Alternatives | Reason | Depends on | Source |
|---|---|---|---|---|---|---|
| Who and why | Main user | The flatmate who shops | Whoever pays; a household admin | Shopping is the core moment | | AI pick |
| Main flow | First screen | The shared list | Shop mode; the split | Most visits add an item | | AI pick |
| Features | Item notes | Later | Must; not now | Not needed for the core | | AI pick |
| Features | Aisle sorting | Later | Must; not now | Nice in shop mode, not core | | AI pick |
| Floor | Delete my data | Must | Later; not now | Required by the floor | | AI pick |
| Floor | Sign-in | Google and email code | Email and password; magic link | Phones, no passwords | | AI pick |
| door: data model | Who owns a list | The household | Each person; the shopper | Four people share one list | | AI pick |
| door: auth and access | Who sees a list | Household members only | Anyone with the link; everyone signed in | Seed answer 4 | data model | AI pick |
| door: hosting and the database | Where it runs | Cloudflare Workers and D1 | Vercel and Postgres; Firebase | Free tier, live updates | | AI pick |
| door: money and time | How amounts are stored | Dollars as a float number | Integer cents with the currency; a decimal string | Easy to type and show | | AI pick |
| door: module boundaries | Modules | list, household, split | one module; per screen | One per slice | data model | AI pick |
| MVP | Supporting slices | Sign-in, one household, the split | Add receipts; add budgets | Core needs only these | | AI pick |
| Look and feel | Feel | Calm, quick, friendly | Playful; serious | A chore app should feel light | | AI pick |
| Look and feel | Theme | Both, following the device | Light; dark | Default | | AI pick |
| Look and feel | Density | Roomy | Dense | Big tap targets in a shop | | AI pick |
| Name | Shortlist | Basketcase (pick), Tickoff, Splitcart | | No clash in the competitor scan | | AI pick |
`;

export function build(dir) {
  repo(dir, {
    "README.md": "# flatshare\n\nA shared grocery list for flatmates.\n",
    "kickoff/grill-log.md": GRILL_LOG,
    "kickoff/decisions.md": DECISIONS,
    "kickoff/vision.md": "# Vision\n\nFlatmates share one grocery list, tick items off while shopping, and split the cost.\n",
    "kickoff/wireframes/index.html": "<!doctype html><title>Wireframes</title><section id=\"list-a\"><h1>List, layout A</h1></section><section id=\"list-b\"><h1>List, layout B</h1></section>\n",
  });
}
