// Tests for overlap.mjs (#255): no two issues in flight share a module. A fake gh answers the API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fakeGh, tmp, unixOnly } from "./helpers.mjs";

const SCRIPT = fileURLToPath(new URL("../../.agents/skills/coordinate/scripts/overlap.mjs", import.meta.url));
const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");
const issue = (modules) => ({ body: modules === null ? "## Goal\nShare a list." : `## Goal\nShare a list.\n\n- **Modules:** ${modules}\n` });
const ref = (branch) => ({ ref: `refs/heads/${branch}` });
const compare = (...files) => ({ files: files.map((filename) => ({ filename })) });

/** overlap.mjs for candidate 7 against `inFlight` in acme/app. `issues` maps a number to its Modules line (null: none). */
function overlap({ issues = {}, inFlight = "5", refs = [], compares = {}, args, api = {} } = {}) {
  const dir = tmp("onrails-overlap-");
  const fake = fakeGh(tmp("onrails-gh-"), { // gh outside the folder it runs in (#274)
    "repos/acme/app": { default_branch: "main" },
    // The exact path: the real API answers HTTP 400 to matching-refs/heads/ with a trailing slash.
    "repos/acme/app/git/matching-refs/heads": refs.map(ref),
    ...Object.fromEntries(Object.entries(issues).map(([n, modules]) => [`repos/acme/app/issues/${n}`, issue(modules)])),
    ...Object.fromEntries(Object.entries(compares).map(([branch, files]) => [`repos/acme/app/compare/main...${branch}`, compare(...files)])),
    ...api,
  });
  const argv = args ?? ["7", "--in-flight", inFlight, "--repo", "acme/app"];
  return { ...spawnSync(process.execPath, [SCRIPT, ...argv], { cwd: dir, encoding: "utf8", env: fake.env }), calls: fake.calls() };
}

test("AC-255-1: two issues that name the same module clash; the output names the module and the issue in flight", unixOnly, () => {
  const r = overlap({ issues: { 7: "features/lists, features/auth", 5: "`features/lists` (decoupled)" } });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /#7 waits; try the next ready issue/);
  assert.match(r.stderr, /#7 and #5 both name module features\/lists/);
  const nested = overlap({ issues: { 7: "src/features/lists/api", 5: "features/lists" } });
  assert.equal(nested.status, 1, "a module inside another clashes");
});

test("AC-255-1: issues on different modules both start; coordinate step 2 runs the script before every start", unixOnly, () => {
  const r = overlap({ issues: { 7: "features/lists", 5: "features/auth", 8: "features/billing" }, inFlight: "5,8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#7 can start \(modules features\/lists\): no overlap with #5, #8/);
  const step2 = read(".agents/skills/coordinate/SKILL.md");
  assert.match(step2, /node \.agents\/skills\/coordinate\/scripts\/overlap\.mjs <n> --in-flight <n,n,\.\.\.> --repo <owner>\/<repo>/);
  assert.match(step2, /Exit 1 is a clash: the candidate waits, and you try the next ready issue/);
  assert.match(step2, /every issue already picked earlier in this sweep, so two ready issues are checked against each other too/);
});

test("AC-255-1: an issue with no Modules line is unknown and starts only when nothing else is in flight", unixOnly, () => {
  const alone = overlap({ issues: { 7: null }, inFlight: "" });
  assert.equal(alone.status, 0, alone.stderr);
  assert.match(alone.stdout, /unknown modules, alone/);
  const crowded = overlap({ issues: { 7: null, 5: "features/auth" } });
  assert.equal(crowded.status, 1);
  assert.match(crowded.stderr, /#7 has no Modules line \(unknown\)/);
  const empty = overlap({ issues: { 7: "<!-- e.g. features/lists -->", 5: "features/auth" } });
  assert.equal(empty.status, 1, "the template's empty line is unknown too");
  const beside = overlap({ issues: { 7: "features/lists", 5: null } });
  assert.equal(beside.status, 1, "nothing starts beside an unknown issue");
  assert.match(beside.stderr, /#5 is in flight with no Modules line/);
});

test("AC-255-2: a file an in-flight branch changes inside the candidate's module is a clash, though the issue text didn't say so", unixOnly, () => {
  const r = overlap({
    issues: { 7: "features/lists", 5: "features/auth" },
    refs: ["main", "feat/5-sign-in", "feat/55-other"],
    compares: { "feat/5-sign-in": ["src/features/auth/login.ts", "src/features/lists/share.ts"] },
  });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /#5's branch feat\/5-sign-in already changes src\/features\/lists\/share\.ts, inside #7's module features\/lists/);
  assert.doesNotMatch(r.calls, /feat\/55-other/, "only the in-flight issue's branch is read");
  assert.match(r.calls, /^api --paginate --slurp repos\/acme\/app\/git\/matching-refs\/heads$/m, "the refs path has no trailing slash");
  const lookalike = overlap({ issues: { 7: "features/lists", 5: "features/auth" }, refs: ["fix/5-x"], compares: { "fix/5-x": ["src/features/listsx/a.ts"] } });
  assert.equal(lookalike.status, 0, "a module matches whole path segments only");
});

test("AC-255-3: when the only overlap is a shared hot spot, both start", unixOnly, () => {
  const r = overlap({
    issues: { 7: "features/lists, CHANGELOG.md", 5: "features/auth, CHANGELOG.md" },
    refs: ["feat/5-sign-in"],
    compares: { "feat/5-sign-in": ["AGENTS.md", "docs/decisions.md", "CHANGELOG.md", "pnpm-lock.yaml", "src/routeTree.gen.ts", ".claude/skills/coordinate/SKILL.md", "src/features/auth/login.ts"] },
  });
  assert.equal(r.status, 0, r.stderr);
  const hot = overlap({ issues: { 7: "docs", 5: "features/auth" }, refs: ["feat/5-sign-in"], compares: { "feat/5-sign-in": ["docs/decisions.md"] } });
  assert.equal(hot.status, 0, "a hot spot inside the candidate's module doesn't clash");
  const real = overlap({ issues: { 7: "docs", 5: "features/auth" }, refs: ["feat/5-sign-in"], compares: { "feat/5-sign-in": ["docs/decisions.md", "docs/design.md"] } });
  assert.equal(real.status, 1, "a real file next to the hot spot still clashes");
});

test("a usage or API error exits 2 and passes nothing", unixOnly, () => {
  assert.equal(overlap({ args: ["7", "--in-flight", "5"] }).status, 2, "no --repo");
  assert.equal(overlap({ args: ["7", "--in-flight", "5,x", "--repo", "acme/app"] }).status, 2, "a bad number");
  assert.equal(overlap({ args: ["7", "--repo", "acme/app"] }).status, 2, "no --in-flight: a forgotten flag never passes");
  assert.equal(overlap({ args: ["7", "--repo", "acme/app", "--in-flight"] }).status, 2, "--in-flight with no value");
  const missing = overlap({ issues: { 7: "features/lists" } });
  assert.equal(missing.status, 2, "issue 5 can't be read");
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /Couldn't read the issues or branches from the API/);
  const refused = overlap({ issues: { 7: "a", 5: "b" }, api: { "repos/acme/app/git/matching-refs/heads": { ghError: "HTTP 403: forbidden" } } });
  assert.equal(refused.status, 2);
  assert.doesNotMatch(refused.calls, /graphql/);
});
