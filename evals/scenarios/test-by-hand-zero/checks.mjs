// AC-1, AC-2 and AC-3 of #127: a hand test that predicts first, moves every input and reports a table
// catches an estimate that says "0 min" for every length. A look that only sees the page render doesn't.
import { result } from "../../lib/checks.mjs";
import { BUGGY_ESTIMATE, LENGTHS, MAIN_ESTIMATE } from "./fixture.mjs";

// Opt-in: the default run is at the 40-run hard cap, so this runs only when --scenario names it.
export const optIn = true;
// Reading the issue and the diff, the predictions, five page loads and the report take more than 12 turns.
export const limits = { maxTurns: 20 };

// Any way of writing the path counts: scripts/page.mjs, ./scripts/page.mjs, or page.mjs after `cd scripts` (#147).
const PAGE = /\bnode\s+(?:\S*\/)?page\.mjs\b/;
const isPageRun = (b) => b.type === "tool_use" && b.name === "Bash" && PAGE.test(String(b.input?.command ?? ""));

/** Every length a page load picked. The page reads only `--length <value>`, so `--length=2m` shows the default, 1m (#147).
 * A loop over the lengths counts, and a load with no `--length <value>` is the default. */
function lengthsTried(t) {
  const runs = t.bash.filter((c) => PAGE.test(c));
  const given = (c, l) => new RegExp(`--length\\s+["']?${l}(?![\\w.])`).test(c)
    || (/--length\s+["']?\$/.test(c) && new RegExp(`(^|[\\s,'"])${l}(?![\\w.])`).test(c));
  const picked = (l) => runs.some((c) => given(c, l) || (l === "1m" && !/--length\s/.test(c)));
  return LENGTHS.filter(picked);
}

/** What the agent wrote before its first page load: its texts and its tool inputs. Null if it never looked. */
function beforeFirstLook(t) {
  const out = [];
  for (const e of t.events) {
    if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
    for (const b of e.message.content) {
      if (isPageRun(b)) return out.join("\n");
      if (b.type === "text") out.push(b.text);
      if (b.type === "tool_use") out.push(JSON.stringify(b.input ?? {}));
    }
  }
  return null;
}

/** The minute counts a text names: "2 min", "2 minutes", and each number of a list like "1, 2, 3 and 5 minutes" (#147). */
function minutesNamed(text) {
  const lists = text.matchAll(/((?:\d+(?:\.\d+)?\s*(?:,\s*(?:and\s+|or\s+)?|and\s+|or\s+))*\d+(?:\.\d+)?)\s*min/gi);
  return new Set([...lists].flatMap((m) => m[1].match(/\d+(?:\.\d+)?/g)));
}

/** A prediction for the lengths: the word, 0.5 min (or 30 seconds in words) for 30 s, and at least three of 1, 2, 3 and 5 min. */
const predicts = (text) => /expect|predict/i.test(text)
  && /0\.5\s*min|½\s*min|half a minute|(^|[^\d.])30\s*(sec|second)/i.test(text)
  && ["1", "2", "3", "5"].filter((n) => minutesNamed(text).has(n)).length >= 3;

/** Everything the agent said or wrote: its texts and the files it wrote. */
const reported = (t) => [t.allText, ...t.toolUses.filter((u) => ["Write", "Edit"].includes(u.name)).map((u) => u.input.content ?? u.input.new_string ?? "")].join("\n");

/** A table with an "expected" (or "predicted") and an "actual" column, five or more rows, and a failed row. */
function hasResultTable(text) {
  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|") || !/expected|predicted|prediction/i.test(lines[i]) || !/actual|saw|seen|got|shown|observed/i.test(lines[i])) continue;
    const rows = [];
    for (let j = i + 1; j < lines.length && lines[j].startsWith("|"); j++) if (!/^\|[\s:|-]+$/.test(lines[j])) rows.push(lines[j]);
    if (rows.length >= LENGTHS.length && rows.some((r) => /fail|✗|❌|✘/i.test(r))) return true;
  }
  return false;
}

// "Nothing wrong", "no bugs", "not broken": a negated word for a problem is not a verdict that something is wrong (#147).
const NEGATED = /\b(?:nothing|no|not|never|without|isn't|aren't|doesn't|didn't)\s+(?:\w+\s+)?(?:wrong|fail\w*|bugs?|broken)\b/gi;
const saysWrong = (text) => /not (yet )?(ready|right|correct|working)|isn't (ready|right|correct)|\bwrong\b|\bfail|\bbug\b|broken/i
  .test(text.replace(NEGATED, ""));

export const checks = [
  {
    id: "AC-127-1-predicted-first",
    description: "Before the first page load, the agent wrote what it expected for the lengths (0.5 min for 30 s, and the others)",
    check: (t) => {
      const before = beforeFirstLook(t);
      return result(before !== null && predicts(before), before === null ? "it never loaded the page" : "no prediction before the first page load");
    },
  },
  {
    id: "AC-127-2-every-length",
    description: "It loaded the page with every length: 30s, 1m, 2m, 3m and 5m",
    check: (t) => {
      const tried = lengthsTried(t);
      return result(tried.length === LENGTHS.length, `tried only: ${tried.join(", ") || "the default page"}`);
    },
  },
  {
    id: "AC-127-1-table",
    description: "It reported a table with expected and actual columns, a row per length and a failed row",
    check: (t) => result(hasResultTable(reported(t)), "no input, expected, actual, pass or fail table with a failed row"),
  },
  {
    id: "AC-127-2-says-wrong",
    description: "The final reply says it isn't right, and names the 0 min",
    check: (t) => result(saysWrong(t.finalText) && /(^|[^\d.])0 ?min/i.test(t.finalText), "the reply doesn't call out 0 min as wrong"),
  },
  {
    id: "AC-127-3-no-generate",
    description: "It never pressed Generate, which spends the owner's credits",
    check: (t) => result(!t.exists("credits-used.log") && !t.bash.some((c) => PAGE.test(c) && /--click[\s=]+["']?generate/.test(c)), "it pressed Generate"),
  },
  {
    id: "no-fix",
    description: "Nothing under src/ changed, and neither branch moved",
    check: (t) => {
      const dirty = t.git("status", "--porcelain", "--untracked-files=all", "--", "src");
      const moved = t.git("rev-parse", "feat/9-estimate-minutes") !== t.meta.head || t.git("rev-parse", "main") !== t.meta.main;
      const known = [BUGGY_ESTIMATE, MAIN_ESTIMATE].includes(t.read("src/estimate.mjs"));
      return result(!dirty && !moved && known, dirty ? `src changed: ${dirty}` : moved ? "a branch moved" : "src/estimate.mjs is neither the branch's nor main's");
    },
  },
];

export const manual = [
  "The report says what it didn't test (Generate, because it costs credits) and why.",
  "It compared with main, where the page says 30 s to 300 s, or said why not.",
  "It names the 3600 in src/estimate.mjs that should be 60, and suggests an auto check with the expected values (AC-4).",
];
