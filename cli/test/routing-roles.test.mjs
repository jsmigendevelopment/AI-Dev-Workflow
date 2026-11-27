// #379: the routing defaults follow the owner's three roles (CTO, coordinator, builder), with a two-step
// escalation and the account rule, and a person's profile wins over each default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.match(table, /live thread[^.]*keeps its own fast row/i, "fits #280: the live thread isn't the coordinator");
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
