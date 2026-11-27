// #379: the routing defaults follow the owner's three roles (CTO, coordinator, builder), with a two-step
// escalation and the account rule, and a person's profile wins over each default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const repo = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(repo(p), "utf8");
const SCRIPT = repo(".agents/skills/routing/scripts/roles.mjs");
// Loaded per test, so the text tests still run (and fail on their own) while the script is missing.
const roles = () => import(SCRIPT);

/** The text of the `## heading` section of a markdown file, up to the next `## `. */
const section = (text, heading) => {
  const found = text.split(/^## /m).find((s) => s.startsWith(heading));
  assert.ok(found, `found ## ${heading}`);
  return found;
};
const rowFor = (text, name) => text.split("\n").find((l) => new RegExp(`^\\|\\s*\\*\\*${name}\\*\\*`).test(l)) ?? "";

test("AC-379-1: WHEN routing is read THEN it has the three roles with the owner's defaults", () => {
  const table = section(read(".agents/skills/routing/SKILL.md"), "Roles");
  assert.match(rowFor(table, "CTO"), /Fable 5\.2[^|]*· high \|[^|]*research[^|]*architecture[^|]*the pyramid[^|]*writing the issues/i);
  assert.match(rowFor(table, "Coordinator"), /Opus 5\.5[^|]*· medium \|[^|]*the loop[^|]*gates[^|]*reviews[^|]*security reviews[^|]*merges/i);
  assert.match(rowFor(table, "Builder"), /Sonnet 5\.5[^|]*· medium \|[^|]*most issues/i);
  assert.match(table, /security path[^.]*big slices[^.]*start on Opus|start on Opus[^.]*security path[^.]*big slices/i);
  assert.match(table, /Codex[^.]*\(ChatGPT, medium or high[^.]*builder option for non-security work/);
  assert.match(table, /live thread keeps its own row \(Everyday · low/i, "fits #280: the live thread isn't the coordinator");
  assert.doesNotMatch(table, /own fast row/, "the live thread's row isn't the Fast tier");
});

test("AC-379-1: WHEN routing is read THEN it has the escalation rule: one step per verified failure, two at most", () => {
  const rule = section(read(".agents/skills/routing/SKILL.md"), "Escalation");
  assert.match(rule, /one step per verified failure, two steps at most/i);
  assert.match(rule, /Sonnet to Opus, then effort up/);
  assert.match(rule, /Infrastructure errors and process blocks don't count against the model/);
  assert.match(rule, /a failed check or a rejected review, not a hunch/);
});

test("AC-379-1: WHEN routing is read THEN it has the account rule: a home account per app, never a move between Claude accounts", () => {
  const rules = section(read(".agents/skills/routing/SKILL.md"), "Rules");
  const accounts = rules.split("\n").find((l) => l.startsWith("- **Accounts")) ?? "";
  assert.match(accounts, /Never move work between Claude accounts because of a limit/);
  assert.match(accounts, /Each app has a home account/);
  assert.match(accounts, /When it's out, the app waits[^.]*or sends Codex-able work to ChatGPT/);
});

test("AC-379-1: WHEN the README and the cheat sheet are read THEN each shows the three roles and that the profile wins", () => {
  for (const [file, heading] of [["README.md", "🧠 Model routing"], ["guide/cheat-sheet.md", "🧠 Model routing"]]) {
    const text = section(read(file), heading);
    assert.match(rowFor(text, "CTO"), /Fable 5\.2[^|]*high/, `${file}: CTO`);
    assert.match(rowFor(text, "Coordinator"), /Opus 5\.5[^|]*medium/, `${file}: coordinator`);
    assert.match(rowFor(text, "Builder"), /Sonnet 5\.5[^|]*medium/, `${file}: builder`);
    assert.match(text, /"no Fable"[^\n]*CTO on Opus/i, `${file}: the profile wins`);
    assert.match(text, /two steps at most/i, `${file}: escalation`);
  }
});

test("AC-379-1: WHEN the role script's defaults are read THEN they match the routing skill's Roles table", async () => {
  const { DEFAULTS } = await roles();
  const table = section(read(".agents/skills/routing/SKILL.md"), "Roles");
  assert.deepEqual(Object.keys(DEFAULTS), ["cto", "coordinator", "builder"]);
  for (const [role, name] of [["cto", "CTO"], ["coordinator", "Coordinator"], ["builder", "Builder"]]) {
    const row = rowFor(table, name);
    assert.ok(row.includes(DEFAULTS[role].model.replace(/^Claude /, "")), `${role} model in the table`);
    assert.ok(row.includes(`· ${DEFAULTS[role].effort} |`), `${role} effort in the table`);
  }
});

test("AC-379-2: WHEN the profile sets a different model for a role THEN that wins over the default", async () => {
  const { resolveRoles } = await roles();
  const got = resolveRoles([{ label: "docs/profile.toml", text: '[routing]\nstrongest = ""\ncto = "Claude Opus 5.5"            # no Fable\n' }]);
  assert.deepEqual(got.cto, { model: "Claude Opus 5.5", effort: "high", from: "docs/profile.toml" });
  assert.deepEqual(got.coordinator, { model: "Claude Opus 5.5", effort: "medium", from: "default" });
  assert.deepEqual(got.builder, { model: "Claude Sonnet 5.5", effort: "medium", from: "default" });
});

test("AC-379-2: WHEN the profile sets a role's effort THEN that wins too, and empty lines keep the default", async () => {
  const { resolveRoles } = await roles();
  const text = '[routing]\ncto = ""\nbuilder = "Claude Opus 5.5"\nbuilder_effort = "high"\ncoordinator_effort = ""\n';
  const got = resolveRoles([{ label: "docs/profile.toml", text }]);
  assert.deepEqual(got.builder, { model: "Claude Opus 5.5", effort: "high", from: "docs/profile.toml" });
  assert.deepEqual(got.cto, { model: "Claude Fable 5.2", effort: "high", from: "default" });
  assert.deepEqual(got.coordinator, { model: "Claude Opus 5.5", effort: "medium", from: "default" });
});

test("AC-379-2: WHEN both profiles set a role THEN the project's wins, and only [routing] is read", async () => {
  const { resolveRoles } = await roles();
  const project = { label: "docs/profile.toml", text: '[accounts.work]\nbuilder = "Not routing"\n\n[routing]\ncto = "Claude Opus 5.5"\n' };
  const home = { label: "~/.onrails/profile.toml", text: '[routing]\ncto = "Claude Fable 5.2"\nbuilder = "Claude Opus 5.5"\n' };
  const got = resolveRoles([project, home]);
  assert.equal(got.cto.model, "Claude Opus 5.5");
  assert.equal(got.cto.from, "docs/profile.toml");
  assert.equal(got.builder.model, "Claude Opus 5.5", "the home profile fills what the project leaves out");
  assert.equal(got.builder.from, "~/.onrails/profile.toml");
});

test("AC-379-2: WHEN the script runs on a project whose profile says no Fable THEN it prints the CTO on Opus", () => {
  const dir = tmp("onrails-routing-");
  const home = tmp("onrails-home-");
  put(dir, "docs/profile.toml", '[routing]\ncto = "Claude Opus 5.5"\n');
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args, "--project", dir], { encoding: "utf8", env: safeEnv({ HOME: home, USERPROFILE: home }) });
  const one = run("cto");
  assert.equal(one.status, 0, one.stderr);
  assert.equal(one.stdout, "cto: Claude Opus 5.5 · high (docs/profile.toml)\n");
  const all = run();
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /^builder: Claude Sonnet 5\.5 · medium \(default\)$/m);
  const bad = run("intern");
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Unknown role "intern"\. Roles: cto, coordinator, builder\./);
});

test("AC-379-2: WHEN the profile template is read THEN its [routing] section has a line per role, and says the profile wins", () => {
  const routing = read(".agents/skills/idea/templates/profile.toml").split("[routing]")[1].split("\n[")[0];
  for (const key of ["cto", "cto_effort", "coordinator", "coordinator_effort", "builder", "builder_effort"]) {
    assert.match(routing, new RegExp(`^${key} = ""`, "m"), key);
  }
  assert.match(routing, /"No Fable"\? cto = "Claude Opus 5\.5"/);
  assert.match(routing, /wins over the kit's default/);
  assert.match(read(".agents/skills/routing/SKILL.md"), /node \.agents\/skills\/routing\/scripts\/roles\.mjs <role>/);
});

// Fix round 1 (review of PR #403).
/** Runs the script with a throwaway HOME, and a timeout so a hang fails instead of blocking. */
function runScript(dir, home, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args, "--project", dir], {
    encoding: "utf8", timeout: 10_000, env: safeEnv({ HOME: home, USERPROFILE: home }),
  });
}
const homeWithOpus = () => {
  const home = tmp("onrails-home-");
  put(home, ".onrails/profile.toml", '[routing]\ncto = "Claude Opus 5.5"\n');
  return home;
};
const posixOnly = { skip: process.platform === "win32" ? "FIFOs and symlink loops are POSIX" : false };

test("AC-379-2: WHEN docs/profile.toml is a directory THEN the script warns once and falls through to the home profile", () => {
  const dir = tmp("onrails-routing-");
  mkdirSync(join(dir, "docs", "profile.toml"), { recursive: true });
  const run = runScript(dir, homeWithOpus(), "cto");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "cto: Claude Opus 5.5 · high (~/.onrails/profile.toml)\n");
  assert.match(run.stderr, /^[^\n]*docs\/profile\.toml[^\n]*\n$/, "one stderr line naming the file");
});

test("AC-379-2: WHEN docs/profile.toml is a FIFO THEN the script neither hangs nor crashes", posixOnly, () => {
  const dir = tmp("onrails-routing-");
  mkdirSync(join(dir, "docs"), { recursive: true });
  const fifo = spawnSync("mkfifo", [join(dir, "docs", "profile.toml")], { env: safeEnv() });
  assert.equal(fifo.status, 0, "mkfifo");
  const run = runScript(dir, homeWithOpus(), "cto");
  assert.equal(run.signal, null, "it didn't hang");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "cto: Claude Opus 5.5 · high (~/.onrails/profile.toml)\n");
  assert.match(run.stderr, /^[^\n]*docs\/profile\.toml[^\n]*\n$/, "one stderr line naming the file");
});

test("AC-379-2: WHEN docs/profile.toml can't be read THEN the script warns once and uses the default", posixOnly, () => {
  const dir = tmp("onrails-routing-");
  mkdirSync(join(dir, "docs"), { recursive: true });
  symlinkSync("profile.toml", join(dir, "docs", "profile.toml")); // a link to itself: stat fails with ELOOP
  const run = runScript(dir, tmp("onrails-home-"), "cto");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "cto: Claude Fable 5.2 · high (default)\n");
  assert.match(run.stderr, /^[^\n]*docs\/profile\.toml[^\n]*\n$/, "one stderr line naming the file");
});

test("AC-379-2: WHEN [routing] is written in other valid TOML forms THEN the profile still wins", async () => {
  const { resolveRoles } = await roles();
  const forms = {
    "a header with a comment": '[routing] # my models\ncto = "Claude Opus 5.5"\n',
    "spaces in the header": '[ routing ]\ncto = "Claude Opus 5.5"\n',
    "a literal string": "[routing]\ncto = 'Claude Opus 5.5'\n",
    "a quoted key": '[routing]\n"cto" = "Claude Opus 5.5"\n',
    "a single-quoted key and a comment": "[routing]\n'cto' = \"Claude Opus 5.5\"   # no Fable\n",
  };
  for (const [name, text] of Object.entries(forms)) {
    const got = resolveRoles([{ label: "docs/profile.toml", text }]);
    assert.deepEqual(got.cto, { model: "Claude Opus 5.5", effort: "high", from: "docs/profile.toml" }, name);
  }
});

test("AC-379-2: WHEN a value has escaped quotes THEN they are read as quotes", async () => {
  const { resolveRoles } = await roles();
  const got = resolveRoles([{ label: "docs/profile.toml", text: '[routing]\ncto = "with \\"x\\" y"\n' }]);
  assert.equal(got.cto.model, 'with "x" y');
});

test("AC-379-2: WHEN a role key is present but its value can't be read THEN it warns with the key and file and says so in the source", async () => {
  const { resolveRoles } = await roles();
  const warnings = [];
  const got = resolveRoles([{ label: "docs/profile.toml", text: '[routing]\nbuilder = Claude Opus 5.5\ncto = "unclosed\n' }], (w) => warnings.push(w));
  assert.equal(got.builder.model, "Claude Sonnet 5.5");
  assert.equal(got.builder.from, "default; could not read builder in docs/profile.toml");
  assert.equal(got.cto.model, "Claude Fable 5.2");
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some((w) => /\bbuilder\b/.test(w) && /docs\/profile\.toml/.test(w)), "names builder and the file");
  assert.ok(warnings.some((w) => /\bcto\b/.test(w) && /docs\/profile\.toml/.test(w)), "names cto and the file");
});

test("AC-379-2: WHEN an effort isn't low, medium, high or extra-high THEN it warns and keeps the default effort", async () => {
  const { resolveRoles } = await roles();
  const warnings = [];
  const text = '[routing]\ncto = "GPT-9 Imaginary"\ncto_effort = "ludicrous"\nbuilder_effort = "HIGH"\ncoordinator_effort = "Extra-High"\n';
  const got = resolveRoles([{ label: "docs/profile.toml", text }], (w) => warnings.push(w));
  assert.equal(got.cto.model, "GPT-9 Imaginary", "any model name passes");
  assert.equal(got.cto.effort, "high");
  assert.equal(got.cto.from, "docs/profile.toml; could not read cto_effort in docs/profile.toml");
  assert.equal(got.builder.effort, "high", "any case");
  assert.equal(got.coordinator.effort, "extra-high");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cto_effort[^\n]*ludicrous[^\n]*docs\/profile\.toml/);
});

test("AC-379-2: WHEN the script gets an inherited name, two roles or an unknown flag THEN it exits 2", () => {
  const dir = tmp("onrails-routing-");
  const home = tmp("onrails-home-");
  for (const args of [["__proto__"], ["toString"], ["cto", "builder"], ["--nope"]]) {
    const run = runScript(dir, home, ...args);
    assert.equal(run.status, 2, `${args.join(" ")}: ${run.stdout}`);
    assert.equal(run.stdout, "", args.join(" "));
    assert.notEqual(run.stderr, "", args.join(" "));
  }
});

test("AC-379-1: WHEN routing is read THEN the security review stays one step above code review, and the wording agrees", () => {
  const skill = read(".agents/skills/routing/SKILL.md");
  assert.match(section(skill, "Roles"), /role's effort is the base[^\n]*never below the builder[^\n]*one step above the code reviewer/i);
  assert.match(section(skill, "Jobs"), /Security review[^\n]*one step above the code reviewer/);
  const rules = section(skill, "Rules");
  assert.doesNotMatch(rules, /\*\*Start low\.\*\*/, "Rules and Escalation both start on the role's default");
  assert.match(rules, /\*\*Start on the role's default\.\*\*/);
  assert.doesNotMatch(skill, /Its own limits win/);
  assert.match(section(read("guide/cheat-sheet.md"), "🧠 Model routing"), /\| 🛡️ Security review[^\n]*\| Opus 5\.5 high \+ ChatGPT \|/);
});

test("AC-379-1: WHEN decision 379-1 is read THEN it names the review-cap follow-up and the security review pick", () => {
  const decision = read("docs/decisions/379-1.md");
  assert.match(decision, /review cap[^\n]*#406/);
  assert.match(decision, /one step above the code review/);
});
