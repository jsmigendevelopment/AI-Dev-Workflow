// The "no approvals on Full" scan (#159, #173). The tests read the kit's text for asks, so they share one scan.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

// The owner, 2026-11-26: "there is no such thing as a human approved label, we are in full automation. nothing needs
// human approval". So no skill text asks the person for `human-approved` or any approval unless the same sentence
// says below Full. The exceptions are the owner's standing ones: paying, the person's own logins and the always-stop
// list, plus the lines that define the Full override itself.
const WHO = "(?:the person|the owner|them|you)";
const ASKS_APPROVAL = new RegExp([
  "`human-approved`", "yes, merge", "\\badd the (?:`human-approved` )?label\\b",
  `\\bask(?:s|ing)? ${WHO}\\b[^.]*(?:\\b(?:approv|review|yes\\b|go-ahead|sign[- ]?off)|before merg|\\b(?:open|try) it\\b)`,
  "\\bwait(?:s|ing)? (?:for|on) (?:their |the person.s |the owner.s |your |a |an |any )?(?:approv|yes\\b|go-ahead|sign[- ]?off|ok\\b|okay\\b)",
  "^(?:that|this|it) needs the person\\b(?![:'’])", "\\bneeds (?:the person.s|the owner.s|their|your) (?:approv|yes\\b|go\\b|go-ahead|sign[- ]?off|ok\\b)",
  "\\b(?:the person|the owner) merges\\b", "\\bmerge it yourself\\b",
  "\\bget (?:a|their|your|the person.s|the owner.s) (?:yes|ok|okay|approval|go-ahead|sign[- ]?off)\\b",
  "\\buntil (?:they|the person|the owner|you) says? (?:yes|go|ok)\\b", "\\bsign(?:s|ed)?[- ]?off\\b",
  // #159 round 4: the risk dial's person gates, and a person who approves, plays, reads, tries or checks before work goes on.
  "\\bmore careful\\b[^.]*\\bwins\\b", "\\bapproves? every merge\\b", "\\b(?:the person|the owner|you)\\b[^.]*\\bbefore merg",
  "\\b(?:you|the person|the owner|a person|a human)\\s+(?:approves?|plays?)\\b", "\\bafter (?:you|the person|they) approves?\\b",
  "\\b(?:and|plus) the human gates?\\b", "· the person \\|", "\\b(?:one|a) person does\\b[^.]*\\bcheck\\b",
  "\\buntil (?:they|the person|the owner|you) confirms?\\b", "\\bfor (?:you|the person|the owner) to (?:confirm|approve|check|try)\\b",
  "\\b(?:you|the person|the owner) reads?\\b[^.]*\\bfirst\\b", "\\b(?:you|the person|the owner) tr(?:y|ies) it\\b",
  "\\b(?:the person|the owner|you) didn.t approve\\b",
  // #173 item 2: a bare "so ask the person." or "ask the person (a ⏳ decision).", and "tell them and wait".
  `\\bask ${WHO}(?: first| once)?(?: \\([^)]*\\))?[.!]?$`,
  // #173 round 1 nice 2: await a yes, check with the person, ask before going on, ask or ping then wait, wait for the
  // person, and a step done only after a yes.
  `\\b(?:tell|ask|ping) ${WHO}\\b[^.]*\\b(?:and|then) wait\\b`, `\\bask ${WHO} before\\b`, `\\bcheck with ${WHO}\\b`,
  "\\bawait (?:the person.s |the owner.s |their |your |a |an )?(?:yes\\b|approv|go-ahead|ok\\b|okay\\b|sign[- ]?off)",
  "\\bwait (?:for|on) (?:the person|the owner)\\b","\\bonly after (?:a|their|your|the person.s|the owner.s) (?:yes|ok|okay|go-ahead|approval)\\b",
  // #199 item 2: "only after the person says yes", a bare "ask first." ending its sentence, "warn the person first",
  // "ask them to close it" (a dialog the person clears for you) and "ask how to go on". Appended last, so the match an
  // older shape makes from the same word is unchanged. "It doesn't ask first." says no ask happens.
  "\\b(?:after|once) (?:they|the person|the owner|you) says? (?:yes|go|ok)\\b",
  "(?<!\\b(?:doesn.t|does not|don.t|do not|never) )\\bask first(?: \\([^)]*\\))?[.!][*_]*$",
  `\\bwarn ${WHO} (?:first|before)\\b`, `\\bask ${WHO} to (?:close|click|dismiss|press|accept)\\b`,
  `\\bask (?:${WHO} )?how to (?:go on|proceed|continue)\\b`,
].join("|"), "i");
// #173: "(on Full" alone isn't a condition: "(on Full too)" keeps the person. A parenthetical counts only when it names
// who stands in for the person on Full, or says nothing waits.
const ON_FULL_STAND_IN = /\(on Full[,:] [^)]*(?:\bnothing waits\b|\bno person\b|\bnever (?:a|the) person\b|\bAI pick\b|`qa`|\ban extra review\b|\bit decides\b)[^)]*\)/i;
const BELOW_FULL = new RegExp(`\\bnever ask\\b|\\bbelow Full\\b|\\bnot on Full\\b|\\bnone on Full\\b|\\bno(?:t)? (?:\`human-approved\` )?label on Full|On Full,? (?:the \`human-approved\` label doesn't|the label doesn't|there's no label|no person)|${ON_FULL_STAND_IN.source}`, "i");
/** A bullet's bold label, "**Below Full:**", scopes each clause of its sentence that names no Full of its own. */
const LABEL = /^(?:[-*] |\d+\. )?\*\*(?:below Full|not on Full)[:.]?\*\*/i;
/** #199 item 3: "at Full", "in Full automation" or any capital Full names its own level, as "on Full" does. */
const namesFull = (c) => /\bFull\b/.test(c) || /\b(?:on|at) Full\b/i.test(c);
/**
 * #173 round 1 nice 1: "(on Full too)" or "(on Full as well)" keeps the person on Full, whatever else the clause says.
 * #199 item 3: with a comma ("(on Full, too)") or "at Full" too.
 */
const AGAINST = /\((?:also |even )?(?:on|at) Full(?:,? too|,? as well)?\)|\([^)]*\b(?:on|at) Full,? (?:too|as well)\b[^)]*\)/i;
/**
 * A sentence's clauses, as [start, end] spans: a new one starts at ", or", ", and", ", but" or a semicolon, outside
 * parentheses. A parenthesis belongs to its clause, so a condition inside it counts there.
 */
const clauses = (s) => {
  // Mask what's inside parentheses (same length), so "(on Full, `qa` does, and nothing waits)" stays in one clause.
  const masked = s.replace(/\([^()]*\)/g, (m) => m.replace(/[,;]/g, "\0"));
  const cuts = [...masked.matchAll(/,\s+(?=(?:or|and|but)\s)|;\s+/g)];
  return [...cuts, { index: s.length }].map((m, i) => [i ? cuts[i - 1].index + cuts[i - 1][0].length : 0, m.index]);
};
const NEXT_ASK = new RegExp(ASKS_APPROVAL.source, "ig");
const ASK_HERE = new RegExp(ASKS_APPROVAL.source, "iy");
/** Where each ask starts, overlapping ones included, so a long match can't hide a second ask inside it. */
const askStarts = (s) => {
  const starts = [];
  for (let m; (m = NEXT_ASK.exec(s)); NEXT_ASK.lastIndex = m.index + 1) starts.push(m.index);
  NEXT_ASK.lastIndex = 0;
  return starts;
};
/**
 * True when the ask that starts at i fits in the clause [a, b]. Round 4: it judges the match the scan makes on the whole
 * sentence, so a shorter ask from the same word ("ask the person before") can't hold one that runs across a cut.
 */
const heldBy = (s, i, [a, b]) => {
  if (i < a || i >= b) return false;
  ASK_HERE.lastIndex = i;
  const m = ASK_HERE.exec(s);
  return !!m && i + m[0].length <= b;
};
/**
 * #173: a condition counts only in the asking clause, and every asking clause needs its own. Round 3: every ask is
 * checked. One that no single clause holds (its words run across a cut) keeps main's rule at that ask: a condition
 * earlier in the sentence, and no "(on Full too)" in it.
 */
const governed = (s) => {
  const spans = clauses(s);
  const cond = s.search(BELOW_FULL);
  for (const i of askStarts(s)) {
    if (!spans.some((span) => heldBy(s, i, span)) && (cond === -1 || cond > i || AGAINST.test(s))) return false;
  }
  const label = LABEL.test(s);
  const asking = spans.map(([a, b]) => s.slice(a, b)).filter((c) => ASKS_APPROVAL.test(c));
  return asking.every((c) => !AGAINST.test(c) && (BELOW_FULL.test(c) || (label && !namesFull(c))));
};
/** The sentences of a line that ask for an approval with no below-Full condition governing the ask. */
export const unconditionalAsks = (line) => line.split(/(?<=[.!?]["'’)\]*_`]*)\s+/).map((s) => s.trim()).filter((s) => ASKS_APPROVAL.test(s) && !governed(s));
export const ALLOWED = [
  ["AGENTS.md", "An instruction to ask, wait, confirm, offer or wait for a yes becomes:", "the Full override itself"],
  [".agents/skills/automation/SKILL.md", "a skill says to ask, wait, confirm, offer or wait for a yes", "points to the Full override"],
  [".agents/skills/automation/references/full.md", "to **ask, wait, confirm, offer, or wait for approval or a yes** becomes:", "the Full override itself"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "nobody sees the app on the real address until they say go live", "going public: always-stop"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "Wait for a yes: a production setting is on the always-stop list.", "production settings: always-stop"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "Wait for a yes: going public is on the always-stop list.", "going public: always-stop"],
  [".agents/skills/stack-tanstack-start/references/cloudflare-agent-setup.md", "Codex's sandbox asks the person to approve each one", "the tool's own sandbox prompt, not the agent"],
  [".agents/skills/test-by-hand-as-the-user/SKILL.md", "and wait for a yes: these are the person's own logins.", "the person's own logins; parked on Full"],
  [".agents/skills/web-security/SKILL.md", "Changing a dashboard or account setting needs the person's approval of the exact change.", "production settings in their own accounts: always-stop"],
  ["stacks/tanstack-start/README.md", "until the person says go live", "going public: always-stop"],
  ["stacks/electron-desktop/PACK.md", "signing off until the person says yes", "code signing needs a paid certificate: paying"],
  ["stacks/tanstack-start-addons/stripe/ADDON.md", "Going live is a separate issue the person approves.", "live payments: going public with money, always-stop"],
  [".agents/skills/pyramid/SKILL.md", "ask them to run `gh auth login` and wait.", "the person's own login"],
  [".agents/skills/stack-monorepo-expo/SKILL.md", "cost money or touch production: stop and ask the person.", "paying and production: always-stop"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "Accounts, keys and the first production deploy stay with the person: ask them.", "the person's own logins and production: always-stop"],
  ["guide/add-to-existing-app.md", "**Recommended:** they build, review and merge small changes, and you approve risky ones", "the Recommended level's own definition: below Full by name"],
  // #173 round 1 nice 2: what the wider scan found that is an owner exception.
  ["AGENTS.md", "## Always stop and ask the person before", "the always-stop list itself"],
  [".agents/skills/idea/templates/stack.md", "production, secrets, real data and money always wait for the person.", "the always-stop list itself"],
  [".agents/skills/idea/templates/stack.md", "Production: deployed only after the person's yes", "deploying to production: always-stop"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "`pnpm deploy:production --confirm \"deploy production\"`, only after the person's yes |", "deploying to production: always-stop"],
  [".agents/skills/stack-tanstack-start/SKILL.md", "Only after their yes to that plan: the same command without `--dry-run` and with `--production-ok`.", "production settings: always-stop"],
  ["guide/environments.md", "the session, only after the person's yes |", "deploying to production: always-stop"],
  ["stacks/tanstack-start/README.md", "`pnpm deploy:production`, only after the person's yes |", "deploying to production: always-stop"],
  ["stacks/tanstack-start/README.md", "`pnpm deploy:production --confirm \"deploy production\"`, only after the person's yes.", "deploying to production: always-stop"],
  ["stacks/electron-desktop/PACK.md", "Signing costs money, so **stop and ask the person before setting any of it up.**", "code signing needs a paid certificate: paying"],
  // #199: what the new phrasings found that is an owner exception.
  [".agents/skills/stack-tanstack-start/SKILL.md", "Anything in production waits for a yes at every level: it is on the always-stop list.", "production: always-stop"],
  [".agents/skills/test-by-hand-as-the-user/SKILL.md", "**In the person's own browser or accounts, ask first.**", "the person's own logins; parked on Full"],
  ["stacks/python-fastapi/PACK.md", "Paying for Workers Paid or a container host is spending money: **ask first.**", "paying"],
  ["stacks/unity/PACK.md", "Store accounts cost money: **ask first.**", "store accounts cost money: paying"],
];
/** Every unconditional ask in these files that no ALLOWED entry names, and the entries that were used. */
export const scan = (files) => {
  const found = [];
  const used = new Set();
  for (const file of files) {
    read(file).split("\n").forEach((line, i) => {
      for (const s of unconditionalAsks(line)) {
        // #159 round 4 nice 2: a named exception is one sentence, found by its words, so it can't hide a second ask on its line.
        const allowed = ALLOWED.find(([f, words]) => f === file && s.includes(words));
        if (allowed) used.add(allowed);
        else found.push(`${file}:${i + 1}: ${s.slice(0, 120)}`);
      }
    });
  }
  return { found, used };
};
export const mdFiles = (dir) => readdirSync(fileURLToPath(new URL(`../../${dir}`, import.meta.url)), { recursive: true }).filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f.replaceAll("\\", "/")}`);
