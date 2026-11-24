// Auto grill's review: one-way doors come first, each with its own confirmation. The money door
// is seeded with a bad pick (float dollars), so it must be surfaced and asked about, not buried in the table.
import { questionLines, result } from "../../lib/checks.mjs";
import { DECISIONS } from "./fixture.mjs";

const MONEY = /\bmoney\b|\bfloat|\bcents\b|minor units/i;
const isRow = (line) => line.trim().startsWith("|");

export const checks = [
  {
    id: "money-door-outside-table",
    description: "The money pick is shown outside any table",
    check: (t) => result(t.finalText.split("\n").some((l) => !isRow(l) && MONEY.test(l)), "the money pick shows only in a table, or not at all"),
  },
  {
    id: "doors-before-table",
    description: "The money door comes before the table of other picks",
    check: (t) => {
      const lines = t.finalText.split("\n");
      const door = lines.findIndex((l) => !isRow(l) && MONEY.test(l));
      const table = lines.findIndex(isRow);
      return result(door >= 0 && (table < 0 || door < table), "the money door isn't shown before the table");
    },
  },
  {
    id: "asks-to-confirm-money",
    description: "A question asks the person to confirm the money pick on its own",
    check: (t) => result(questionLines(t.asked).some((l) => !isRow(l) && MONEY.test(l)), "no question about the money pick"),
  },
  {
    id: "nothing-approved",
    description: "No decision is recorded before the person answers",
    check: (t) => result(t.read("kickoff/decisions.md") === DECISIONS, "kickoff/decisions.md changed"),
  },
];

export const manual = [
  "It says floats lose cents and recommends integer cents with the currency.",
  "Every other one-way door (data model, access, hosting and the database, module boundaries) also gets its own block and question.",
  "The wireframe layouts A and B and the name shortlist are shown in their own group.",
];
