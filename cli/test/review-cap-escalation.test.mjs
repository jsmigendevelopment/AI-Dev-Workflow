// #406: the review cap's extra round follows routing's two-step escalation and never lands on the strongest
// tier on its own; profile init asks for the fast tier; the accounts rule names the ChatGPT exception; and the
// small roles.mjs fixes from the issue's comment. The skill rules are text the agents read, so those tests read
// the shipped skill text, as full-never-parks.test.mjs does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { accountsList } from "../src/accounts.mjs";
import { profileInit, profilePath } from "../src/profile.mjs";
import { spawnSync } from "./child.mjs";
import { fakeAsk, logger, put, safeEnv, tmp } from "./helpers.mjs";

const repo = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(repo(p), "utf8");
const roles = () => import(repo(".agents/skills/routing/scripts/roles.mjs"));
const COPIES = [".agents/skills", ".claude/skills", "plugin/cli/kit/files/core/.agents/skills"];

/** coordinate's review-cap On Full bullet: one line. */
const capOnFull = (text) => text.split("\n").find((l) => l.startsWith("   - **On Full,** the cap never stops the issue")) ?? "";
/** afk's On Full line under "An issue fails twice". */
const afkOnFull = (text) => {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith("- **An issue fails twice**"));
  assert.ok(at >= 0, "afk has its 'An issue fails twice' rule");
  return lines[at + 1] ?? "";
};

test("AC-406-1: WHEN coordinate's review cap is read THEN the extra round runs only with an escalation step left under routing, else the issue is split", () => {
  for (const dir of COPIES) {
    const onFull = capOnFull(read(`${dir}/coordinate/SKILL.md`));
    assert.ok(onFull, `${dir}: the On Full bullet`);
    assert.match(onFull, /if the builder has an escalation step left under `routing`'s "Escalation"[^.]*, run one more round with a fresh builder that takes that step\./, dir);
    assert.match(onFull, /With no step left, skip this round and go straight to the split\./, dir);
    assert.match(onFull, /Never move a builder to the strongest tier on your own\./, dir);
    assert.doesNotMatch(onFull, /next tier up|tier above/, `${dir}: no climb by tier`);
    assert.ok(onFull.indexOf("escalation step left") < onFull.indexOf("Split it."), `${dir}: the extra round comes before the split`);
  }
});

test("AC-406-1: WHEN an issue can't be cut smaller THEN its one new issue is built on the last round's tier and effort, never a tier up", () => {
  const onFull = capOnFull(read(".agents/skills/coordinate/SKILL.md"));
  assert.match(onFull, /Can't be cut smaller\? Then `issues` files one new issue with every open finding as its checklist, and a fresh builder builds it on the same tier and effort as the last round, instead of a split at the same size\./);
});

test("AC-406-1: WHEN afk's On Full line for an issue that fails twice is read THEN it follows the same rule and never reaches the strongest tier", () => {
  for (const dir of COPIES) {
    const onFull = afkOnFull(read(`${dir}/afk/SKILL.md`));
    assert.match(onFull, /^ {2}- \*\*On Full:\*\* keep it moving with `coordinate`'s review cap: /, dir);
    assert.match(onFull, /one more round with a fresh builder only if it has an escalation step left under `routing`, else straight to a split through `issues`\./, dir);
    assert.match(onFull, /Never the strongest tier on its own\./, dir);
    assert.doesNotMatch(onFull, /next tier up/, `${dir}: no climb by tier`);
  }
});

test("AC-406-1: WHEN routing's Escalation section is read THEN it says the review cap follows it, not that it overrides the cap", () => {
  const escalation = read(".agents/skills/routing/SKILL.md").split(/^## /m).find((s) => s.startsWith("Escalation")) ?? "";
  assert.match(escalation, /`coordinate`'s review cap follows this: with a step left, the extra round takes that step, never the next tier; with none left, go straight to the split \(#406\)\./);
  assert.doesNotMatch(escalation, /Where the cap says "the next tier up"/);
});

test("AC-406-2: WHEN npx onrails profile init runs THEN it asks for the fast model and writes fast in [routing]", async () => {
  const home = tmp();
  const answers = ["octo-org", "free", "festival themed", "Big Model", "Daily Model", "Quick Model", "Art Model", "Other Vendor"];
  const ask = fakeAsk(answers);
  assert.equal(await profileInit({ home, ask, log: logger() }), 0);
  const fastQuestion = ask.questions.find((q) => /^Fast model \(the builder's model, e\.g\. Claude Sonnet 5\.5\)/.test(q));
  assert.ok(fastQuestion, `asked for the fast model: ${ask.questions.join(" / ")}`);
  const routing = readFileSync(profilePath(home), "utf8").split(/^\[routing\]$/m)[1].split(/^\[/m)[0];
  assert.match(routing, /^fast = "Quick Model" +# /m);
  assert.match(routing, /^everyday = "Daily Model"/m);
  assert.match(routing, /^creative = "Art Model"/m);
});

test("AC-406-3: WHEN npx onrails accounts prints the rule THEN it names the ChatGPT exception for non-security builds and never moves work between Claude accounts", () => {
  const home = tmp(), dir = tmp();
  put(dir, "docs/profile.toml", '[accounts.personal]\nlabel = "Personal"\ntool = "claude"\nconfig_dir = "~/.claude"\n');
  mkdirSync(join(home, ".claude"));
  const log = logger();
  assert.equal(accountsList(dir, { home, log }), 0);
  const rule = log.text().split("\n")[1];
  assert.match(rule, /never moves to another account/);
  assert.match(rule, /One exception: when you use Codex, non-security builds may go to ChatGPT\./);
  assert.match(rule, /Never to a second Claude account\./);
});

test("#406 comment, item 3: WHEN a value has a C1 control, U+2028 or U+2029 THEN it can't be read, so the output stays one line per role", async () => {
  const { resolveRoles } = await roles();
  for (const escape of ["\\u0085", "\\u009B", "\\u0080", "\\u2028", "\\u2029"]) {
    const warnings = [];
    const got = resolveRoles([{ label: "docs/profile.toml", text: `[routing]\ncto = "A${escape}B"\n` }], (w) => warnings.push(w));
    assert.equal(got.cto.model, "Claude Fable 5.2", escape);
    assert.equal(got.cto.from, "default; could not read cto in docs/profile.toml", escape);
    assert.equal(warnings.length, 1, escape);
  }
  const plain = resolveRoles([{ label: "docs/profile.toml", text: '[routing]\ncto = "Caf\\u00e9 \\u00a0Model"\n' }]);
  assert.equal(plain.cto.model, "Caf\u00e9 \u00a0Model", "printable characters past U+009F still read");
});

test("#406 comment, item 4: WHEN routing is set before [routing] THEN the warning says that line is skipped and the [routing] table is still read", async () => {
  const { resolveRoles } = await roles();
  const warnings = [];
  const got = resolveRoles([{ label: "docs/profile.toml", text: 'routing = 1\n[routing]\ncto = "Claude Opus 5.5"\n' }], (w) => warnings.push(w));
  assert.equal(got.cto.model, "Claude Opus 5.5", "the table is read");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /docs\/profile\.toml sets routing outside \[routing\][^\n]*that part is skipped and the \[routing\] table is still read[^\n]*write it under \[routing\]/);
  assert.doesNotMatch(warnings[0], /Skipped\.$/, "never says the whole routing table is skipped");
});

test("#406 comment, item 5: WHEN routing is an array of tables or a sub-table THEN it warns as the inline and dotted forms do", async () => {
  const { resolveRoles } = await roles();
  for (const text of ['[[routing]]\ncto = "Claude Opus 5.5"\n', '[routing.models]\ncto = "Claude Opus 5.5"\n', '[ routing . x ]\ncto = "Claude Opus 5.5"\n']) {
    const warnings = [];
    const got = resolveRoles([{ label: "docs/profile.toml", text }], (w) => warnings.push(w));
    assert.equal(got.cto.model, "Claude Fable 5.2", text);
    assert.equal(warnings.length, 1, text);
    assert.match(warnings[0], /docs\/profile\.toml[^\n]*write it under \[routing\]/, text);
  }
  const fine = [];
  resolveRoles([{ label: "docs/profile.toml", text: '[routing]\ncto = "Claude Opus 5.5"\n[routing_notes]\nx = "y"\n' }], (w) => fine.push(w));
  assert.deepEqual(fine, [], "a table that only starts with the word routing is another table");
});

test("#406 comment, item 6: WHEN roles.mjs is asked for one role THEN it warns only about that role", () => {
  const dir = tmp("onrails-routing-"), home = tmp("onrails-home-");
  put(dir, "docs/profile.toml", '[routing]\ncto = Claude Opus 5.5\nbuilder_effort = "ludicrous"\n');
  const run = (...args) => spawnSync(process.execPath, [repo(".agents/skills/routing/scripts/roles.mjs"), ...args, "--project", dir], {
    encoding: "utf8", timeout: 10_000, env: safeEnv({ HOME: home, USERPROFILE: home }),
  });
  const one = run("cto");
  assert.equal(one.status, 0, one.stderr);
  assert.equal(one.stdout, "cto: Claude Fable 5.2 · high (default; could not read cto in docs/profile.toml)\n");
  assert.equal(one.stderr.split("\n").filter(Boolean).length, 1, one.stderr);
  assert.match(one.stderr, /\bcto\b[^\n]*docs\/profile\.toml/);
  const all = run();
  assert.equal(all.stderr.split("\n").filter(Boolean).length, 2, `with no role asked, it warns about every role: ${all.stderr}`);
});
