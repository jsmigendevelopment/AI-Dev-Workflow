// AC-6 of #102: an auto grill with a seeded bad pick on a one-way door (money as float dollars)
// must surface it for its own confirmation, not bury it in the table. Regex over chat prose
// failed both ways, so the checks read the structured review in kickoff/review.md
// (the format in grill's references/auto.md, step 4).
import { result } from "../../lib/checks.mjs";
import { DECISIONS } from "./fixture.mjs";

const REVIEW = "kickoff/review.md";
const MONEY = /\bmoney\b|\bfloat|\bcents\b|\bpenn(?:y|ies)\b|minor units|\bdollars?\b|\bamounts?\b/i;
const FIXED = /minor units|\bcents\b|whole (?:numbers of )?penn(?:y|ies)|\bpenn(?:y|ies)\b/i;
const FLOAT = /\bfloat|floating[- ]point/i;
const BLANKET = /\b(?:everything|all|every row|the rest|looks good)\b/i;

/** The review's parts: each door block by topic, and the "Everything else" section. */
function parse(text) {
  const lines = (text ?? "").split("\n");
  const doors = [];
  let door = null;
  let section = null;
  let elseStart = -1;
  lines.forEach((line, index) => {
    const heading = line.match(/^###\s+Door:\s*(.+)$/i);
    if (heading) {
      door = { topic: heading[1].trim(), index, fields: {} };
      doors.push(door);
      return;
    }
    if (/^##\s/.test(line)) {
      door = null;
      section = line.replace(/^##\s+/, "").trim().toLowerCase();
      if (section === "everything else" && elseStart < 0) elseStart = index;
      return;
    }
    const field = door && line.match(/^(Pick|Why|Alternatives|Question|Cost to change later):\s*(.*)$/i);
    if (field) door.fields[field[1].toLowerCase()] = field[2].trim();
  });
  // A table row is any line with a pipe: with or without the leading one.
  const tableIndex = lines.findIndex((l) => l.includes("|"));
  const elseLines = elseStart < 0 ? [] : lines.slice(elseStart + 1).filter((l) => !/^##\s/.test(l));
  const money = doors.find((d) => /^money\b/i.test(d.topic)) ?? null;
  return { lines, doors, money, tableIndex, elseLines };
}

const review = (t) => (t.exists(REVIEW) ? parse(t.read(REVIEW)) : null);

export const checks = [
  {
    id: "AC-6-money-door-block",
    description: "kickoff/review.md has a '### Door: money' block, before any table",
    check: (t) => {
      const r = review(t);
      if (!r) return result(false, `${REVIEW} wasn't written`);
      if (!r.money) return result(false, "no '### Door: money …' block");
      return result(r.tableIndex < 0 || r.money.index < r.tableIndex, "the money door comes after the table");
    },
  },
  {
    id: "AC-6-money-not-in-table",
    description: "Money isn't a table row or a line under 'Everything else'",
    check: (t) => {
      const r = review(t);
      if (!r) return result(false, `${REVIEW} wasn't written`);
      const buried = [...r.lines.filter((l) => l.includes("|")), ...r.elseLines].filter((l) => MONEY.test(l));
      return result(buried.length === 0, `buried: ${buried.join(" / ")}`);
    },
  },
  {
    id: "AC-6-money-pick-fixed",
    description: "The money door's Pick recommends integer minor units, cents or whole pennies, not float",
    check: (t) => {
      const pick = review(t)?.money?.fields.pick ?? "";
      return result(FIXED.test(pick) && !FLOAT.test(pick), `Pick: "${pick}"`);
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
