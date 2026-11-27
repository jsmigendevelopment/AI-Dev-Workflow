// #377: pr-size.mjs, the one size rule. A pull request is read from a fake gh; a local diff from a throwaway repo
// whose one commit holds the coordinate scripts, as main's checkout does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { SCRIPTS, checkout, git } from "./pr-rules-fakes.mjs";

const read = (path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
const KIT_ATTRIBUTES = read(".gitattributes");
const PACK_ATTRIBUTES = read("stacks/tanstack-start/.gitattributes");
const listed = (files) => files.map(([filename, additions, deletions]) => ({ filename, additions, deletions }));

/** pr-size.mjs on pull request 9 of acme/app, with `labels`, `body` and the files changed ([name, additions, deletions]). */
function size({ files, labels = [], body = "Closes #5", attributes = "", args = ["9", "--repo", "acme/app"] } = {}) {
  const dir = checkout(attributes);
  const pull = { number: 9, body, labels: labels.map((name) => ({ name })), changed_files: files.length };
  const fake = fakeGh(tmp("onrails-gh-"), { "repos/acme/app/pulls/9": pull, "repos/acme/app/pulls/9/files": listed(files) });
  return spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), ...args], { cwd: dir, encoding: "utf8", env: fake.env });
}

/** pr-size.mjs --base main in a repo whose branch commits `files` ({ path: text }) on top of main. */
function local(files, attributes = "") {
  const dir = checkout(attributes);
  git(dir, "branch", "-M", "main");
  git(dir, "switch", "-q", "-c", "feat/5-share");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "branch");
  return spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "--base", "main"], { cwd: dir, encoding: "utf8", env: safeEnv() });
}
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n") + "\n";

test("AC-377-1: WHEN a diff has 1,000 or more counted lines THEN the script exits 1 and names the biggest files", unixOnly, () => {
  const files = [["src/a.ts", 400, 200], ["src/b.ts", 300, 0], ["docs/c.md", 90, 10], ["src/d.ts", 1, 0]];
  const r = size({ files });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /#9: 1001 changed lines counted, 0 not counted/);
  assert.match(r.stdout, /Biggest files:\n {2}600\tsrc\/a\.ts\n {2}300\tsrc\/b\.ts\n {2}100\tdocs\/c\.md\n {2}1\tsrc\/d\.ts/);
  assert.match(r.stderr, /1001 changed lines \(the limit is under 1000; lockfiles, generated files and test fixtures not counted\)\. Split the pull request, or add the size-exception label and a "Size exception: <reason>" line/);
  assert.equal(size({ files: [["src/a.ts", 500, 499]] }).status, 0, "999 lines pass");
  assert.equal(size({ files: [["src/a.ts", 500, 500]] }).status, 1, "1,000 lines fail");
  const big = local({ "src/a.ts": lines(1200), "src/b.ts": lines(30) });
  assert.equal(big.status, 1, big.stderr);
  assert.match(big.stdout, /HEAD against main: 1230 changed lines counted/);
  assert.match(big.stdout, /1200\tsrc\/a\.ts\n {2}30\tsrc\/b\.ts/);
});

test("AC-377-2: WHEN the same pull request has size-exception and a reason THEN it exits 0 and prints the reason", unixOnly, () => {
  const files = [["src/a.ts", 900, 300]];
  const body = "Renames the module.\n\nSize exception: a mechanical rename, one line per file\n\nCloses #5";
  const r = size({ files, labels: ["lane:normal", "size-exception"], body });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1200 changed lines counted/);
  assert.match(r.stdout, /Size exception: a mechanical rename, one line per file/);
  // The label alone, the reason alone, or the template's placeholder isn't enough.
  const noReason = size({ files, labels: ["size-exception"] });
  assert.equal(noReason.status, 1);
  assert.match(noReason.stderr, /It has the size-exception label but no "Size exception: <reason>" line/);
  assert.equal(size({ files, body }).status, 1, "a reason without the label");
  assert.equal(size({ files, labels: ["size-exception"], body: "Size exception: <reason>" }).status, 1, "the placeholder");
  assert.equal(size({ files, labels: ["size-exception"], body: "- **Size exception:** generated API types" }).status, 0, "a bold list item");
});

test("AC-377-3: WHEN the extra lines are only in generated files, lockfiles or fixtures THEN they're excluded, and it passes", unixOnly, () => {
  const files = [
    ["src/a.ts", 10, 5], ["pnpm-lock.yaml", 900, 800], ["cli/package-lock.json", 500, 0],
    ["plugin/skills/build/SKILL.md", 600, 0], [".claude/skills/build/SKILL.md", 600, 0], ["cli/README.md", 700, 0],
    ["stacks/tanstack-start/src/routeTree.gen.ts", 1500, 0], ["stacks/tanstack-start/migrations/meta/0001_snapshot.json", 2000, 0],
    ["stacks/tanstack-start/e2e/visual.spec.ts-snapshots/home.png", 0, 0], ["stacks/tanstack-start/worker-configuration.d.ts", 4000, 0],
    ["cli/test/fixtures/big.json", 3000, 0], ["src/__snapshots__/a.test.ts.snap", 1200, 0], ["e2e/__fixtures__/page.html", 1100, 0],
  ];
  const tree = checkout(KIT_ATTRIBUTES);
  mkdirSync(join(tree, "stacks", "tanstack-start"), { recursive: true });
  writeFileSync(join(tree, "stacks", "tanstack-start", ".gitattributes"), PACK_ATTRIBUTES);
  git(tree, "add", "-A");
  git(tree, "commit", "-q", "-m", "the pack's list");
  const pull = { number: 9, body: "Closes #5", labels: [], changed_files: files.length };
  const fake = fakeGh(tmp("onrails-gh-"), { "repos/acme/app/pulls/9": pull, "repos/acme/app/pulls/9/files": listed(files) });
  const r = spawnSync(process.execPath, [join(tree, SCRIPTS, "pr-size.mjs"), "9", "--repo", "acme/app"], { cwd: tree, encoding: "utf8", env: fake.env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#9: 15 changed lines counted, 16900 not counted \(lockfiles, generated files, test fixtures\)/);
  assert.match(r.stdout, /Biggest files:\n {2}15\tsrc\/a\.ts\n?$/);
  // The plugin manifests people edit still count, as the kit's .gitattributes says.
  assert.equal(size({ files: [["plugin/.claude-plugin/plugin.json", 1000, 0]], attributes: KIT_ATTRIBUTES }).status, 1);
  const ok = local({ "src/a.ts": lines(15), "pnpm-lock.yaml": lines(1500), "test/fixtures/data.json": lines(1200), "plugin/x.md": lines(1100), "e2e/home.png": "\0PNG\0" }, "plugin/** linguist-generated\n");
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /HEAD against main: 15 changed lines counted, 3800 not counted/);
});

test("#377: there is one size rule: the gate, the web pack's pr:rules and the kit's own checks all use pr-size.mjs", () => {
  assert.match(read(".agents/skills/coordinate/scripts/pr-rules.mjs"), /import \{ generated, measure, sizeProblem \} from "\.\/pr-size\.mjs";/);
  const pack = read("stacks/tanstack-start/scripts/pr/rules.ts");
  assert.match(pack, /export const SIZE_SCRIPT = '\.agents\/skills\/coordinate\/scripts\/pr-size\.mjs'/);
  assert.doesNotMatch(pack, /MAX_CHANGED_LINES|large-pr/, "no second limit in the pack");
  assert.match(read("stacks/tanstack-start/scripts/pr/check.ts"), /spawnSync\(process\.execPath, \[SIZE_SCRIPT, pr, '--repo', repo\]/);
  assert.match(read("CONTRIBUTING.md"), /\nnode \.agents\/skills\/coordinate\/scripts\/pr-size\.mjs --base origin\/main\n/);
  assert.match(read(".agents/skills/name/scripts/setup-github.mjs"), /\["size-exception", "[0-9a-f]{6}"\]/);
  assert.match(read(".agents/skills/coordinate/SKILL.md"), /\*\*The size rule\*\* is `pr-size\.mjs`'s, which `pr-rules\.mjs` shares \(#377\): 1,000 changed lines or more fails/);
});

test("#377: a rename is skipped only when both its names are, and a usage or API error is exit 2", unixOnly, () => {
  const dir = checkout();
  const fake = fakeGh(tmp("onrails-gh-"), {
    "repos/acme/app/pulls/9": { number: 9, body: "", labels: [], changed_files: 1 },
    "repos/acme/app/pulls/9/files": [{ filename: "test/fixtures/core.ts", previous_filename: "src/core.ts", status: "renamed", additions: 700, deletions: 650 }],
  });
  const run = (...args) => spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), ...args], { cwd: dir, encoding: "utf8", env: fake.env });
  const moved = run("9", "--repo", "acme/app");
  assert.equal(moved.status, 1, "a move into a fixtures folder still counts");
  assert.match(moved.stderr, /1350 changed lines/);
  for (const args of [[], ["9"], ["--base"], ["--base", "--output=x"], ["9", "--repo", "acme/app", "--base", "main"]]) {
    assert.equal(run(...args).status, 2, args.join(" "));
  }
  const missing = run("8", "--repo", "acme/app");
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Couldn't count the size/);
  const cut = fakeGh(tmp("onrails-gh-"), {
    "repos/acme/app/pulls/9": { number: 9, body: "", labels: [], changed_files: 3500 },
    "repos/acme/app/pulls/9/files": listed([["src/a.ts", 1, 0]]),
  });
  const short = spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "9", "--repo", "acme/app"], { cwd: dir, encoding: "utf8", env: cut.env });
  assert.equal(short.status, 2, "a list GitHub cut short is never a pass");
  assert.match(short.stderr, /GitHub listed 1 of the 3500 files #9 changes/);
});
