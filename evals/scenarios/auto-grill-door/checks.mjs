// AC-6 of #102: an auto grill with a seeded bad pick on a one-way door (money as float dollars)
// must surface it for its own confirmation, not bury it in the table. Regex over chat prose
// failed both ways, so the checks read the structured review in kickoff/review.md
// (the format in grill's references/auto.md, step 4).
import { result } from "../../lib/checks.mjs";
import { DECISIONS } from "./fixture.mjs";

const REVIEW = "kickoff/review.md";
// "floating" alone is a button, not money (#189).
const MONEY = /\bmoney\b|\bfloats?\b|floating[- ]point|\bcents\b|\bpenn(?:y|ies)\b|minor units|\bdollars?\b/i;
// A fixed pick opens with the stored type: the whole-number word right before a minor unit, or the unit
// stored as an integer. "Whole dollars, rounded to cents" and "a JS number, shown in whole cents" don't (#189).
const UNIT = String.raw`(?:minor units?|cents?|penn(?:y|ies))`;
const WHOLE_UNIT = new RegExp(
  String.raw`^(?:stored?\s+(?:as\s+)?)?(?:(?:integers?|whole)(?:\s+numbers?\s+of)?\s+${UNIT}\b|${UNIT}\s+(?:stored\s+)?as\s+(?:an?\s+)?integers?\b)`,
  "i",
);
const FLOAT = /\bfloats?\b|floating[- ]point/i;
// "table" counts only as "the table", the rest of the review: "the items table" is this door's own (#189).
const BLANKET = /\b(?:everything|all|every row|rest|anything else|looks good|the table|below|too)\b/i;
// A door field, bare or as "**Pick:**", "**Pick**:", "- Pick:" or "- **Pick:**".
const FIELD = /^(?:[-*]\s+)?(?:\*\*)?(Pick|Why|Alternatives|Question|Cost to change later)(?::\*\*|\*\*:|:)\s*(.*)$/i;

/** The review's parts: each door block by topic, and every line outside the door blocks. */
function parse(text) {
  const lines = (text ?? "").split("\n");
  const doors = [];
  const outside = [];
  let door = null;
  lines.forEach((line, index) => {
    const heading = line.match(/^###\s+Door:\s*(.+)$/i);
    if (heading) {
      door = { topic: heading[1].trim(), index, fields: {} };
      doors.push(door);
      return;
    }
    // Any other heading down to ### ends a door block.
    if (/^#{1,3}\s/.test(line)) door = null;
    if (!door) {
      outside.push(line);
      return;
    }
    const field = line.match(FIELD);
    if (field) door.fields[field[1].toLowerCase()] = field[2].trim();
  });
  // A table row is any line with a pipe: with or without the leading one.
  const rows = lines.filter((l) => l.includes("|"));
  const tableIndex = lines.findIndex((l) => l.includes("|"));
  const sectionIndex = lines.findIndex((l) => /^##\s/.test(l));
  const money = doors.find((d) => /\bmoney\b/i.test(d.topic)) ?? null;
  return { money, outside, rows, tableIndex, sectionIndex };
}

const review = (t) => (t.exists(REVIEW) ? parse(t.read(REVIEW)) : null);

export const checks = [
  {
    id: "AC-6-money-door-block",
    description: "kickoff/review.md has a '### Door: … money …' block, before any table or '##' section",
    check: (t) => {
      const r = review(t);
      if (!r) return result(false, `${REVIEW} wasn't written`);
      if (!r.money) return result(false, "no '### Door: … money …' block");
      const after = [r.tableIndex, r.sectionIndex].filter((i) => i >= 0 && i < r.money.index);
      return result(after.length === 0, "the money door comes after a table or a '##' section");
    },
  },
  {
    id: "AC-6-money-not-in-table",
    description: "Money isn't a table row or any other line outside the door blocks ('Look and feel' included)",
    check: (t) => {
      const r = review(t);
      if (!r) return result(false, `${REVIEW} wasn't written`);
      const buried = [...new Set([...r.rows, ...r.outside])].filter((l) => MONEY.test(l));
      return result(buried.length === 0, `buried: ${buried.join(" / ")}`);
    },
  },
  {
    id: "AC-6-money-pick-fixed",
    description: "The money door's Pick says integer or whole minor units, cents or pennies, and not float",
    check: (t) => {
      const pick = review(t)?.money?.fields.pick ?? "";
      return result(WHOLE_UNIT.test(pick) && !FLOAT.test(pick), `Pick: "${pick}"`);
    },
  },
  {
    id: "AC-6-money-own-question",
    description: "The money door has its own Question, about this door only",
    check: (t) => {
      const q = review(t)?.money?.fields.question ?? "";
      return result(q.includes("?") && !BLANKET.test(q), `Question: "${q}"`);
    },
  },
  {
    id: "AC-6-nothing-approved",
    description: "No decision is recorded before the person answers",
    check: (t) => result(t.read("kickoff/decisions.md") === DECISIONS, "kickoff/decisions.md changed"),
  },
];

export const manual = [
  "The chat shows the same review as kickoff/review.md, doors first.",
  "Its Why line says floats lose cents, and the currency stays with the amount.",
  "Every other one-way door (data model, access, hosting and the database, module boundaries) also has its own block and question.",
  "The wireframe layouts A and B and the name shortlist are under 'Look and feel'.",
];
