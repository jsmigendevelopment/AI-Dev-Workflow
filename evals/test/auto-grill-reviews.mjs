// Transcripts for the auto-grill-door scenario (AC-6 of #102). Each writes kickoff/review.md
// the way that answer would. A, B and C bury or keep the float pick: from the reviews of #105.
// D and E follow grill's references/auto.md. `fails` lists the checks each one must fail.
const write = (content) => ({ write: "kickoff/review.md", content });

const GOOD_D = `# Review

### Door: money and time
Pick: Integer cents with the currency
Why: The draft stored float dollars. Floats lose cents, so I fixed it.
Alternatives: A decimal string; float dollars
Cost to change later: Migrating every stored amount
Question: Confirm, or which one?

## Look and feel

Layouts A (#list-a) and B (#list-b) side by side. Name: Basketcase.

## Everything else

| Topic | Pick | Alternatives | Reason |
|---|---|---|---|
| Theme | Both | Light; dark | Follows the device |

Change any row in plain words. "Looks good" accepts the rest.
`;

const GOOD_E = `# Review

### Door: money
Pick: Whole numbers of pennies, stored with the currency
Why: The draft used floating-point dollars, which lose pennies.
Alternatives: A decimal string; floating-point dollars
Cost to change later: Rewriting every saved total
Question: Confirm this pick, or which one?

## Look and feel

Layout A (#list-a) or B (#list-b).

## Everything else

| Topic | Pick |
|---|---|
| Theme | Both |
`;

const BAD_A = `# Review

## Everything else

Topic | Pick | Alternatives
---|---|---
Money and time | Dollars as a float number | Integer cents with the currency
Theme | Both | Light; dark

Looks good? That accepts every row, float money included.
`;

const BAD_B = `# Review

### Door: money and time
Pick: Dollars as a float number, kept
Why: Easy to type. Integer cents was the alternative.
Alternatives: Integer cents; a decimal string
Question: Looks good on everything, float money included?

## Everything else

| Topic | Pick | Alternatives |
|---|---|---|
| Money and time | Dollars as a float number | Integer cents; decimal string |
| Theme | Both | Light; dark |
`;

const BAD_C = `# Review

## Everything else

- Data model: the household owns a list
- Money and time: dollars as a float number (alternatives: integer cents with the currency; a decimal string)
- Theme: both

Reply "looks good" to accept all of these, float money too, or change any line?
`;

const DOOR_CHECKS = ["AC-6-money-door-block", "AC-6-money-not-in-table", "AC-6-money-pick-fixed", "AC-6-money-own-question"];

export const REVIEWS = {
  "A: a table without leading pipes, float kept, blanket looks good": { review: BAD_A, fails: DOOR_CHECKS },
  "B: float kept in its door block, money also in the table, blanket question": { review: BAD_B, fails: DOOR_CHECKS.slice(1) },
  "C: a bullet list buries money, no door block": { review: BAD_C, fails: DOOR_CHECKS },
  "D: auto.md to the letter, question on its own line": { review: GOOD_D, fails: [] },
  "E: plain words, whole pennies": { review: GOOD_E, fails: [] },
};

// #108: each tightened check catches a review that passed before, and each good review that failed
// before passes. Every one is GOOD_E with one change, so it fails only the check that change is about.
const edit = (from, to) => {
  if (!GOOD_E.includes(from)) throw new Error(`GOOD_E has no "${from}"`);
  return GOOD_E.replace(from, to);
};
const DOOR_E = GOOD_E.slice(GOOD_E.indexOf("### Door"), GOOD_E.indexOf("## Look"));

export const REVIEWS_108 = {
  "1: the money door after the first '##' section": {
    review: edit(DOOR_E, "").replace("## Everything else", `${DOOR_E}## Everything else`),
    fails: ["AC-6-money-door-block"],
  },
  "2: a question that points at the table below": {
    review: edit("Question: Confirm this pick, or which one?", "Question: Confirm this pick, or change it in the table below?"),
    fails: ["AC-6-money-own-question"],
  },
  "2: a question that sweeps in the rest too": {
    review: edit("Question: Confirm this pick, or which one?", "Question: Is this pick fine, and the theme too?"),
    fails: ["AC-6-money-own-question"],
  },
  "2: a float pick that only says cents": {
    review: edit("Pick: Whole numbers of pennies, stored with the currency", "Pick: Dollars as a plain JS number, rounded to cents"),
    fails: ["AC-6-money-pick-fixed"],
  },
  "3: money buried under 'Look and feel'": {
    review: edit("Layout A (#list-a) or B (#list-b).", "Layout A (#list-a) or B (#list-b). The split screen shows dollars as a float."),
    fails: ["AC-6-money-not-in-table"],
  },
  "4: bold door fields": {
    review: DOOR_E.split("\n").reduce((r, l) => r.replace(l, l.replace(/^(\w[\w ]*):/, "**$1:**")), GOOD_E),
    fails: [],
  },
  "4: door fields as a list": {
    review: DOOR_E.split("\n").reduce((r, l) => r.replace(l, l.replace(/^(\w[\w ]*):/, "- $1:")), GOOD_E),
    fails: [],
  },
  "4: money later in the door topic": { review: edit("### Door: money", "### Door: time and money"), fails: [] },
  "4: 'amount' in a table row": {
    review: edit("| Theme | Both |", "| Theme | Both |\n| Density | A small amount on each screen |"),
    fails: [],
  },
};

/** The plan for one review: write it, then show it. */
export const reviewPlan = (review) => ({ steps: [write(review), { text: review }] });

/** The scenario's good and bad arm for the every-scenario test. */
export const AUTO_GRILL_PLAN = {
  with: reviewPlan(GOOD_D),
  without: { steps: [write(BAD_A), { write: "kickoff/decisions.md", content: "# Decisions\n\nAll picks approved.\n" }, { text: BAD_A }] },
};
