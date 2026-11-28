// #402: writing the issues is the CTO role's job (#379). `issues`, `pyramid` and `idea` point to `routing`'s CTO
// role instead of putting the job on a tier, so a profile override (`cto = ...`) applies, and one yes covers every
// CTO job. The ask still names the strongest tier: it is what the ask is about, not where the job runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const SKILLS = [".agents/skills/issues/SKILL.md", ".agents/skills/pyramid/SKILL.md"];
const IDEA = ".agents/skills/idea/SKILL.md";
const description = (text) => (/^description: (.*)$/m.exec(text) ?? [])[1] ?? "";

// Shapes that put a job on a tier or a model. Naming the strongest tier as the thing to ask about is not one.
const ASSIGNS = [
  /\b(everyday|cheaper|fast) (model|tier)\b/i,
  /\b(Fable|Opus|Sonnet)\b/,
  /\bon (the|your|a) strongest (model|tier)\b/i,
  /\bstrongest (model|tier),? (at )?(low|medium|high|extra-high) effort\b/i,
  /\bStrongest · /,
];
const assignsTier = (text) => ASSIGNS.filter((re) => re.test(text)).map(String);
const ASK = /Below Full, ask before the strongest tier when `roles\.mjs cto` prints it \(see `routing`\)/;

test("AC-402-1: WHEN a sentence asks before the strongest tier THEN the ban lets it pass; WHEN it puts the job on a tier THEN the ban refuses it", () => {
  for (const ok of ["Ask before the strongest tier, as the rules say.", "the strongest tier, so below Full, ask first",
    "Below Full, ask before using the strongest tier.", "Below Full, ask before the strongest tier when `roles.mjs cto` prints it (see `routing`).",
    "May the planner use your strongest model without asking each time?", "`ask_before_strongest = false`"]) assert.deepEqual(assignsTier(ok), [], ok);
  for (const bad of ["Write the issues on the everyday model.", "`issues` does that next on a cheaper model.", "Everyday model, medium effort.",
    "Run it on the strongest model at high effort.", "This is CTO work: the strongest model, high effort.", "Plan on the fast tier.",
    "Runs on Opus 5.5.", "**Strongest · high**."]) assert.notDeepEqual(assignsTier(bad), [], bad);
});

test("AC-402-1: WHEN issues, pyramid and idea are read THEN none puts writing the issues on the everyday or a cheaper model", () => {
  for (const file of [...SKILLS, IDEA]) assert.deepEqual(assignsTier(read(file)), [], `${file}: puts a job on a tier`);
});

test("AC-402-1: WHEN issues and pyramid are read THEN both point to routing's CTO role, so the profile wins", () => {
  for (const file of SKILLS) {
    const text = read(file);
    assert.match(text, /`routing`'s CTO role/, `${file}: points to the CTO role`);
    assert.match(text, /node \.agents\/skills\/routing\/scripts\/roles\.mjs cto/, `${file}: reads the role's model and effort`);
  }
  const issues = read(SKILLS[0]);
  assert.match(description(issues), /CTO role/, "issues: the description says who writes them");
  const pyramid = read(SKILLS[1]);
  assert.match(pyramid, /It doesn't write issues; `issues` does that next[^.]*CTO role/, "pyramid: issues are the CTO role's too");
});

test("AC-402-1: WHEN idea is read THEN steps 9 and 10 point to routing's CTO role, and so does the ask", () => {
  const idea = read(IDEA);
  const plan = (/^9\. \*\*Plan the build\.\*\*[\s\S]*?(?=^10\. )/m.exec(idea) ?? [""])[0];
  const write = (/^10\. \*\*Write the issues\.\*\*.*$/m.exec(idea) ?? [""])[0];
  assert.match(plan, /`routing`'s CTO role/, "step 9 points to the CTO role");
  assert.match(plan, /node \.agents\/skills\/routing\/scripts\/roles\.mjs cto/, "step 9 reads the role's model and effort");
  assert.match(plan, ASK, "step 9 asks before the strongest tier only when the role is on it");
  assert.match(write, /`routing`'s CTO role/, "step 10 points to the CTO role");
  assert.match(write, /step 9's yes covers it/, "step 10 needs no second ask");
});

test("AC-402-1: WHEN issues and pyramid are read THEN one yes to the strongest-tier question covers every CTO job", () => {
  const [issues, pyramid] = SKILLS.map(read);
  assert.match(pyramid, /Below Full, ask first, once per session, unless the profile says not to/, "pyramid keeps the ask");
  assert.match(issues, /`ask_before_strongest = false`/, "issues names the profile key");
  for (const text of [issues, pyramid]) {
    assert.match(text, /yes covers every CTO job in the session/);
    assert.match(text, ASK, "the ask says what it is about");
  }
});
