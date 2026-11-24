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

/** The plan for one review: write it, then show it. */
export const reviewPlan = (review) => ({ steps: [write(review), { text: review }] });

/** The scenario's good and bad arm for the every-scenario test. */
export const AUTO_GRILL_PLAN = {
  with: reviewPlan(GOOD_D),
  without: { steps: [write(BAD_A), { write: "kickoff/decisions.md", content: "# Decisions\n\nAll picks approved.\n" }, { text: BAD_A }] },
};
