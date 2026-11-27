// Tests for scripts/check-research.mjs, the research folder checker (the master copy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "./child.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_FIELDS, checkResearch, parseCsv, staleDossiers } from "../../scripts/check-research.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../scripts/check-research.mjs", import.meta.url));
const SCHEMA_FILE = fileURLToPath(new URL("../../.agents/skills/research/references/provenance.schema.json", import.meta.url));
const TODAY = "2026-12-01";
const HEADER = "| Dossier | Question | Decision | Date | Status | Re-check | Author model · effort |\n|---|---|---|---|---|---|---|\n";

const role = (r, extra = {}) => ({
  role: r, model: "model-a-1", effort: "high", harness: "a tool 1.0", started: "2026-11-01", finished: "2026-11-02", brief: "unknown", ...extra,
});
const check = (extra = {}) => role("fact-check", { model: "model-b-2", effort: "medium", disposition: "fact-check.csv", ...extra });
const row = (topic, o = {}) =>
  `| [${topic}](${topic}.md) | ${o.question ?? "Which one?"} | ${o.decision ?? "none yet"} | ${o.date ?? "2026-11-02"} | ${o.status ?? "current"} | ${o.recheck ?? "2027-02-02"} | ${o.author ?? "model-a-1 · high"} |\n`;

// A research folder with one dossier, "pick", that passes. Overrides change one part.
function folder({ rows, roles = [role("author"), check()], stores = [], record = {}, disposition = "finding,claim,disposition,reason\nf1,,fixed,Corrected the version.\n" } = {}) {
  const dir = tmp("onrails-research-");
  put(dir, "README.md", `# Research\n\n${HEADER}${rows ?? row("pick")}`);
  put(dir, "pick.md", "# Pick\n");
  put(dir, "pick/provenance.json", JSON.stringify({ schema: "research-provenance/1", dossier: "pick.md", stores, roles, ...record }));
  if (disposition !== null) put(dir, "pick/fact-check.csv", disposition);
  return dir;
}

function desk(dir, { claims = "id,claim,label,sources,date\nc1,It is MIT,read-in-source,s1,2026-11-01\n" } = {}) {
  put(dir, "pick/hypotheses.md", "- It is MIT.\n");
  put(dir, "pick/coverage.md", "| | Licence |\n|---|---|\n| A | c1 |\n");
  put(dir, "pick/sources.csv", 'id,title,location,accessed,read\ns1,"The licence, in full",repo/LICENSE,2026-11-01,full\n');
  put(dir, "pick/claims.csv", claims);
}

const errors = (dir, opts) => checkResearch(dir, { today: TODAY, ...opts }).errors.join("\n");

test("a complete folder passes, and an empty index passes too", () => {
  const r = checkResearch(folder(), { today: TODAY });
  assert.deepEqual(r.errors, []);
  assert.equal(r.dossiers, 1);
  const empty = tmp("onrails-research-");
  put(empty, "README.md", `# Research\n\n${HEADER}`);
  assert.deepEqual(checkResearch(empty, { today: TODAY }).errors, []);
});

test("the index must exist, have every column and list every dossier once", () => {
  assert.match(errors(tmp("onrails-research-")), /README\.md: missing/);
  const dir = folder({ rows: row("pick") + row("pick") });
  put(dir, "other.md", "# Other\n");
  const text = errors(dir);
  assert.match(text, /pick\.md is listed twice/);
  assert.match(text, /other\.md: not in the index/);
  const noCols = folder();
  put(noCols, "README.md", "| Dossier | Question |\n|---|---|\n| [pick](pick.md) | Which? |\n");
  assert.match(errors(noCols), /missing columns: decision, date, status, re-check, author model · effort/);
});

test("a row needs a real file, a question, a decision, a date and a known status", () => {
  const text = errors(folder({ rows: row("pick") + "| [Gone](gone.md) |  |  | 2026-13-40 | done | 2027-01-01 | model-a-1 · high |\n" }));
  assert.match(text, /gone\.md not found/);
  assert.match(text, /Question is empty/);
  assert.match(text, /Decision is empty/);
  assert.match(text, /Date must be YYYY-MM-DD/);
  assert.match(text, /Status must start with one of draft, current, stale, superseded/);
  assert.match(errors(folder({ rows: row("pick", { decision: "[D3](../decisions.md#d3)" }) })), /Decision links \.\.\/decisions\.md, which is not found/);
});

test("every dossier needs a provenance.json with the schema, the dossier name and the stores", () => {
  const dir = folder();
  put(dir, "pick/provenance.json", "{ not json");
  assert.match(errors(dir), /pick\/provenance\.json: not valid JSON/);
  assert.match(errors(folder({ record: { schema: "v0", dossier: "other.md", stores: "desk" } })),
    /schema must be "research-provenance\/1"[\s\S]*dossier must be "pick\.md"[\s\S]*stores must be a list/);
});

test("every role field must be present: unknown is allowed, a missing field is not", () => {
  for (const field of ROLE_FIELDS) {
    const author = role("author");
    delete author[field];
    assert.match(errors(folder({ roles: [author, check()] })), new RegExp(`${field} is missing \\(write "unknown"`), field);
  }
  const unknowns = Object.fromEntries(ROLE_FIELDS.map((f) => [f, "unknown"]));
  assert.deepEqual(checkResearch(folder({ rows: row("pick", { author: "unknown · unknown" }), roles: [role("author", unknowns), check()] }), { today: TODAY }).errors, []);
});

test("the model is an exact ID, the effort is from the list, the dates are real", () => {
  const text = errors(folder({ roles: [role("author", { model: "Fancy Model 5", effort: "extreme", started: "soon", finished: "2026-10-01" }), check()] }));
  assert.match(text, /model "Fancy Model 5" is not an exact model ID/);
  assert.match(text, /effort must be one of/);
  assert.match(text, /started must be a date/);
  assert.match(errors(folder({ roles: [role("author", { started: "2026-11-05" }), check()] })), /finished is before started/);
  assert.match(errors(folder({ roles: [role("author", { brief: "briefs/author.md" }), check()] })), /brief briefs\/author\.md not found/);
});

test("a requested model or effort that differs from the run needs notes", () => {
  const asked = { requested: { model: "model-b-3", effort: "high" } };
  assert.match(errors(folder({ roles: [role("author"), check(asked)] })), /requested and actual model or effort differ: say why in notes/);
  assert.deepEqual(checkResearch(folder({ roles: [role("author"), check({ ...asked, notes: "Fell back to model-b-2." })] }), { today: TODAY }).errors, []);
});

test("a current or stale dossier needs an author and a fact-check; a draft needs only the author", () => {
  assert.match(errors(folder({ roles: [check()] })), /no author entry/);
  assert.match(errors(folder({ roles: [role("author")] })), /no fact-check entry, so the dossier can't be current: mark it draft/);
  assert.deepEqual(checkResearch(folder({ rows: row("pick", { status: "draft" }), roles: [role("author")] }), { today: TODAY }).errors, []);
});

test("the index shows the author's model, effort and date from provenance.json", () => {
  const text = errors(folder({ rows: row("pick", { author: "model-z · low", date: "2026-11-03" }) }));
  assert.match(text, /Author model · effort must be "model-a-1 · high"/);
  assert.match(text, /Date must be 2026-11-02, the author's finished date/);
});

test("the fact-check's disposition file gives every finding fixed, disputed or accepted, with a reason", () => {
  assert.match(errors(folder({ roles: [role("author"), check({ disposition: undefined })] })), /needs disposition/);
  assert.match(errors(folder({ disposition: null })), /disposition fact-check\.csv not found/);
  const text = errors(folder({ disposition: "finding,claim,disposition,reason\nf1,c1,ignored,\n" }));
  assert.match(text, /fact-check\.csv:2: disposition must be one of fixed, disputed, accepted/);
  assert.match(text, /fact-check\.csv:2: every finding needs a reason/);
  assert.match(errors(folder({ disposition: "finding,result\n" })), /columns must be exactly: finding,claim,disposition,reason/);
});

test("a fact-check on the author's model is a warning, not an error", () => {
  const r = checkResearch(folder({ roles: [role("author"), check({ model: "model-a-1" })] }), { today: TODAY });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join("\n"), /fact-check ran on the author's model/);
});

test("a desk store needs its four files, labelled claims and sources that exist", () => {
  assert.match(errors(folder({ stores: ["desk"] })), /desk store is missing hypotheses\.md, coverage\.md, sources\.csv, claims\.csv/);
  const ok = folder({ stores: ["desk"] });
  desk(ok);
  assert.deepEqual(checkResearch(ok, { today: TODAY }).errors, []);
  const bad = folder({ stores: ["desk"] });
  desk(bad, { claims: "id,claim,label,sources,date\nc1,It is fast,obvious,s9,2026-11-01\nc2,No source,anecdote,,2026-11-01\nc3,Ran it,measured,run:nope,2026-11-01\n" });
  const text = errors(bad);
  assert.match(text, /claims\.csv:2: label must be one of measured, read-in-source, vendor-claim, anecdote, summary-only/);
  assert.match(text, /claims\.csv:2: source s9 is not in sources\.csv/);
  assert.match(text, /claims\.csv:3: a claim needs at least one source id/);
  assert.match(text, /claims\.csv:4: source run:nope is not in sources\.csv or runs\//);
});

test("a measurement store needs a manifest, fixed result columns and a summary per machine", () => {
  assert.match(errors(folder({ stores: ["measurements"] })), /measurement store has no run folder/);
  const dir = folder({ stores: ["measurements"] });
  put(dir, "pick/runs/2026-11-01-start/results.csv", "run,machine,case,metric,unit,iteration,phase,value,status\n");
  assert.match(errors(dir), /runs\/2026-11-01-start: manifest\.json is missing \(write it before the data\)/);
  put(dir, "pick/runs/2026-11-01-start/manifest.json", JSON.stringify({ run: "2026-11-01-start", created: "2026-11-01" }));
  put(dir, "pick/runs/2026-11-01-start/results.csv", [
    "run,machine,case,metric,unit,iteration,phase,value,status",
    "2026-11-01-start,laptop,cold,start,ms,1,warmup,120,ok",
    "2026-11-01-start,laptop,cold,start,ms,2,measure,,failed",
    "other,laptop,cold,start,ms,3,steady,fast,ok",
  ].join("\n"));
  const r = checkResearch(dir, { today: TODAY });
  const text = r.errors.join("\n");
  assert.match(text, /manifest\.json: missing question, machine, command, cases, metrics/);
  assert.match(text, /results\.csv:4: run must be 2026-11-01-start/);
  assert.match(text, /results\.csv:4: phase must be warmup or measure/);
  assert.match(text, /results\.csv:4: an ok row needs a number in value/);
  assert.doesNotMatch(text, /results\.csv:3/, "a failed row may have no value");
  assert.match(r.warnings.join("\n"), /no summary for machine laptop/);
});

test("re-check dates: after the date, warned past 6 months, and listed once due", () => {
  assert.match(errors(folder({ rows: row("pick", { recheck: "2026-11-01" }) })), /Re-check must be after Date/);
  assert.match(errors(folder({ rows: row("pick", { recheck: "later" }) })), /Re-check must be YYYY-MM-DD/);
  const far = checkResearch(folder({ rows: row("pick", { recheck: "2027-09-01" }) }), { today: TODAY });
  assert.match(far.warnings.join("\n"), /more than 6 months after Date/);
  const dir = folder({ rows: row("pick", { recheck: "2026-12-01" }) });
  assert.deepEqual(checkResearch(dir, { today: TODAY }).stale, [{ dossier: "pick.md", recheck: "2026-12-01", status: "current" }]);
  assert.deepEqual(staleDossiers(dir, { today: "2026-11-30" }), []);
  assert.equal(staleDossiers(dir, { today: TODAY }).length, 1);
  assert.deepEqual(staleDossiers(tmp("onrails-research-"), { today: TODAY }), []);
});

test("a superseded dossier says by what, and needs no re-check date or fact-check", () => {
  const roles = [role("author")];
  assert.match(errors(folder({ rows: row("pick", { status: "superseded", recheck: "—" }), roles })), /superseded by <what>/);
  const ok = folder({ rows: row("pick", { status: "superseded by the build in #4", recheck: "—" }), roles });
  assert.deepEqual(checkResearch(ok, { today: TODAY }).errors, []);
  assert.deepEqual(staleDossiers(ok, { today: "2030-01-01" }), []);
});

test("with --base, sources and claims only grow and run files never change", () => {
  const dir = folder({ stores: ["desk", "measurements"] });
  desk(dir);
  put(dir, "pick/runs/r1/manifest.json", JSON.stringify({ run: "r1", created: "2026-11-01", question: "q", machine: "m", command: "c", cases: ["a"], metrics: ["t"] }));
  put(dir, "pick/runs/r1/results.csv", "run,machine,case,metric,unit,iteration,phase,value,status\nr1,m,a,t,ms,1,measure,5,ok\n");
  put(dir, "pick/summaries/m.md", "# m\n");
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe", env: safeEnv() });
  git("init", "-q", "-b", "main");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "root");
  git("add", ".");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", "research");
  put(dir, "pick/claims.csv", `${readFileSync(join(dir, "pick/claims.csv"), "utf8")}c2,It is small,measured,run:r1,2026-11-02\n`);
  assert.deepEqual(errors(dir, { base: "main" }), "", "appending a claim is fine");
  put(dir, "pick/sources.csv", "id,title,location,accessed,read\n");
  put(dir, "pick/runs/r1/results.csv", "run,machine,case,metric,unit,iteration,phase,value,status\n");
  const text = errors(dir, { base: "main" });
  assert.match(text, /pick\/sources\.csv: changed, but it is append-only/);
  assert.match(text, /pick\/runs\/r1\/results\.csv: changed, but it is append-only/);
  assert.match(errors(folder(), { base: "main" }), /--base: git could not find the merge base with main/);
});

test("the CSV reader handles quotes, commas, doubled quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n'), [["a", "b"], ["x, y", 'say "hi"']]);
});

test("the JSON schema and the checker agree on the required fields", () => {
  const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));
  assert.deepEqual(schema.required, ["schema", "dossier", "stores", "roles"]);
  assert.deepEqual(schema.$defs.role.required, ["role", ...ROLE_FIELDS]);
});

test("the command line fails on errors, passes a good folder and lists stale dossiers", () => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: safeEnv() });
  const good = folder();
  assert.equal(run(good, "--today", TODAY).status, 0);
  const bad = folder({ roles: [role("author")] });
  const failed = run(bad, "--today", TODAY);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /error: pick\/provenance\.json: no fact-check entry/);
  const stale = run(good, "--stale", "--today", "2027-03-01");
  assert.equal(stale.status, 0);
  assert.match(stale.stdout, /stale: pick\.md \(re-check 2027-02-02\)/);
  assert.equal(run(join(good, "missing")).status, 0);
  assert.equal(run().status, 2);
});
