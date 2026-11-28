// #377: pr-size.mjs, the one size rule. A pull request is read from a fake gh; a local diff from a throwaway repo
// whose one commit holds the coordinate scripts, as main's checkout does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "./child.mjs";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeGh, safeEnv, tmp, unixOnly } from "./helpers.mjs";
import { HEAD, SCRIPTS, checkout, git, rules } from "./pr-rules-fakes.mjs";

const read = (path) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
const KIT_ATTRIBUTES = read(".gitattributes");
const PACK_ATTRIBUTES = read("stacks/tanstack-start/.gitattributes");
const listed = (files) => files.map(([filename, additions, deletions]) => ({ filename, additions, deletions }));
const headOf = (dir) => git(dir, "rev-parse", "HEAD").trim();

/** Commits `files` ({ path: text }) in `dir` on a new branch, as a pull request's head. */
function commitBranch(dir, files) {
  git(dir, "branch", "-M", "main");
  git(dir, "switch", "-q", "-c", "feat/5-share");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "branch");
}

/** pr-size.mjs on pull request 9 of acme/app, with `labels`, `body` and the files changed ([name, additions, deletions],
 * or GitHub's own entries as `entries`). Its base is main's commit; `branch` commits files on top, so the checkout
 * is on the head; `base` names another base sha. */
function size({ files = [], entries = listed(files), labels = [], body = "Closes #5", attributes = "", branch, base, api = {}, args = ["9", "--repo", "acme/app"] } = {}) {
  const dir = checkout(attributes);
  const pull = { number: 9, body, labels: labels.map((name) => ({ name })), changed_files: entries.length, base: { ref: "main", sha: base ?? headOf(dir) }, head: { sha: HEAD } };
  if (branch) commitBranch(dir, branch);
  const fake = fakeGh(tmp("onrails-gh-"), { "repos/acme/app/pulls/9": pull, "repos/acme/app/pulls/9/files": entries, ...api });
  return spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), ...args], { cwd: dir, encoding: "utf8", env: fake.env });
}

/** pr-size.mjs --base main in a repo whose branch commits `files` ({ path: text }) on top of main. */
function local(files, attributes = "") {
  const dir = checkout(attributes);
  commitBranch(dir, files);
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
    ["test/fixtures/big.json", 3000, 0], ["test/__snapshots__/a.test.ts.snap", 1200, 0], ["e2e/__fixtures__/page.json", 1100, 0],
  ];
  const tree = checkout(KIT_ATTRIBUTES);
  mkdirSync(join(tree, "stacks", "tanstack-start"), { recursive: true });
  writeFileSync(join(tree, "stacks", "tanstack-start", ".gitattributes"), PACK_ATTRIBUTES);
  git(tree, "add", "-A");
  git(tree, "commit", "-q", "-m", "the pack's list");
  const pull = { number: 9, body: "Closes #5", labels: [], changed_files: files.length, base: { ref: "main", sha: headOf(tree) }, head: { sha: HEAD } };
  const fake = fakeGh(tmp("onrails-gh-"), { "repos/acme/app/pulls/9": pull, "repos/acme/app/pulls/9/files": listed(files) });
  const r = spawnSync(process.execPath, [join(tree, SCRIPTS, "pr-size.mjs"), "9", "--repo", "acme/app"], { cwd: tree, encoding: "utf8", env: fake.env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#9: 15 changed lines counted, 16900 not counted \(lockfiles, generated files, test fixtures\)/);
  assert.match(r.stdout, /Biggest files:\n {2}15\tsrc\/a\.ts\nBinary files, not counted:\n {2}stacks\/tanstack-start\/e2e\/visual\.spec\.ts-snapshots\/home\.png\n?$/);
  // The plugin manifests people edit still count, as the kit's .gitattributes says.
  assert.equal(size({ files: [["plugin/.claude-plugin/plugin.json", 1000, 0]], attributes: KIT_ATTRIBUTES }).status, 1);
  const ok = local({ "src/a.ts": lines(15), "pnpm-lock.yaml": lines(1500), "test/fixtures/data.json": lines(1200), "plugin/x.md": lines(1100), "e2e/home.png": "\0PNG\0" }, "plugin/** linguist-generated\n");
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /HEAD against main: 15 changed lines counted, 3800 not counted/);
});

test("#377: there is one size rule: the gate, the web pack's pr:rules and the kit's own checks all use pr-size.mjs", () => {
  assert.match(read(".agents/skills/coordinate/scripts/pr-rules.mjs"), /import \{ generated, markBinaries, measure, sizeProblem \} from "\.\/pr-size\.mjs";/);
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
    "repos/acme/app/pulls/9": { number: 9, body: "", labels: [], changed_files: 1, base: { ref: "main", sha: headOf(dir) }, head: { sha: HEAD } },
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
    "repos/acme/app/pulls/9": { number: 9, body: "", labels: [], changed_files: 3500, base: { ref: "main", sha: headOf(dir) }, head: { sha: HEAD } },
    "repos/acme/app/pulls/9/files": listed([["src/a.ts", 1, 0]]),
  });
  const short = spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "9", "--repo", "acme/app"], { cwd: dir, encoding: "utf8", env: cut.env });
  assert.equal(short.status, 2, "a list GitHub cut short is never a pass");
  assert.match(short.stderr, /GitHub listed 1 of the 3500 files #9 changes/);
});

test("#377 round 1, must 1: the .gitattributes that mark generated files come from the base, never from the branch", unixOnly, () => {
  const marked = { "src/a.ts": lines(1500), ".gitattributes": "src/** linguist-generated\n" };
  const branchMarks = local(marked);
  assert.equal(branchMarks.status, 1, branchMarks.stdout);
  assert.match(branchMarks.stdout, /HEAD against main: 1501 changed lines counted, 0 not counted/);
  const nested = local({ "src/a.ts": lines(1500), "src/.gitattributes": "*.ts linguist-generated\n" });
  assert.equal(nested.status, 1, nested.stdout);
  // A pull request read from a checkout that is on its head, not its base.
  const pr = size({ files: [["src/a.ts", 1500, 0]], branch: { ".gitattributes": "src/** linguist-generated\n" } });
  assert.equal(pr.status, 1, pr.stdout);
  assert.match(pr.stdout, /#9: 1500 changed lines counted, 0 not counted/);
  const missing = size({ files: [["src/a.ts", 10, 0]], base: "f".repeat(40) });
  assert.equal(missing.status, 2, "a base this checkout doesn't have is never a pass");
  assert.match(missing.stderr, /The base f{40} isn't in this checkout: git fetch origin main/);
  assert.equal(size({ files: [["src/a.ts", 10, 0]], base: "main" }).status, 2, "a base that isn't a full sha");
});

test("#377 round 1, must 2: the branch's own diff or binary attributes don't hide its lines", unixOnly, () => {
  for (const attributes of [{ ".gitattributes": "src/** -diff\n" }, { "src/.gitattributes": "*.ts binary\n" }, { ".gitattributes": "*.ts diff=none\n" }]) {
    const r = local({ "src/a.ts": lines(1500), ...attributes });
    assert.equal(r.status, 1, `${JSON.stringify(attributes)}: ${r.stdout}`);
    assert.match(r.stdout, /HEAD against main: 1501 changed lines counted/);
  }
  // A real binary file, with a NUL byte, still counts 0, as GitHub counts it.
  const png = local({ "e2e/home.png": `\0PNG${lines(1500)}`, "src/a.ts": lines(10) });
  assert.equal(png.status, 0, png.stdout);
  assert.match(png.stdout, /HEAD against main: 10 changed lines counted, 0 not counted/);
});

test("#377 round 1, must 3: only data files under a test folder's fixtures count as fixtures, never source code", unixOnly, () => {
  const code = size({ files: [["src/fixtures/handler.ts", 1500, 0], ["src/routes/Fixtures/page.tsx", 900, 0], ["src/testdata/core.ts", 800, 0], ["src/a.ts", 10, 0]] });
  assert.equal(code.status, 1, code.stdout);
  assert.match(code.stdout, /#9: 3210 changed lines counted, 0 not counted/);
  const testCode = size({ files: [["test/fixtures/core.ts", 1500, 0], ["cli/test/fixtures/run.mjs", 200, 0]] });
  assert.equal(testCode.status, 1, testCode.stdout);
  assert.match(testCode.stdout, /#9: 1700 changed lines counted/);
  const data = size({ files: [["test/fixtures/core.json", 1500, 0], ["e2e/__fixtures__/page.txt", 900, 0], ["src/a.ts", 10, 0]] });
  assert.equal(data.status, 0, data.stderr);
  assert.match(data.stdout, /#9: 10 changed lines counted, 2400 not counted/);
  // A deleted source file and a new fixture don't pair as a rename: the deletion counts, and so does new code.
  const moved = local({ "test/fixtures/core.ts": lines(1500) });
  assert.equal(moved.status, 1, moved.stdout);
});

test("#377 round 1, must 4: a Size exception line counts only where the description shows it", unixOnly, () => {
  const files = [["src/a.ts", 1200, 0]];
  const labels = ["size-exception"];
  for (const [why, body] of [
    ["an HTML comment", "Closes #5\n\n<!--\nSize exception: hidden\n-->"],
    ["an unclosed HTML comment", "Closes #5\n\n<!-- note\nSize exception: hidden"],
    ["a fenced block", "Closes #5\n\n```\nSize exception: hidden\n```"],
    ["a tilde fence", "Closes #5\n\n~~~md\nSize exception: hidden\n~~~"],
    ["an indented code block", "Closes #5\n\n    Size exception: hidden"],
    ["a tab-indented code block", "Closes #5\n\n\tSize exception: hidden"],
  ]) {
    const r = size({ files, labels, body });
    assert.equal(r.status, 1, `${why}: ${r.stdout}`);
    assert.doesNotMatch(r.stdout, /hidden/, why);
  }
  const shown = size({ files, labels, body: "```\ncode\n```\n<!-- template note -->\nSize exception: generated API types\n\nCloses #5" });
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /Size exception: generated API types/);
});

test("#377 round 1, nice items: counts must be whole numbers, a reason needs a letter, and more lockfiles don't count", unixOnly, () => {
  for (const [why, entry] of [
    ["a string", { filename: "src/a.ts", additions: "1500", deletions: 0 }],
    ["a negative count", { filename: "src/a.ts", additions: 1500, deletions: -1000 }],
    ["no count", { filename: "src/a.ts", additions: 1500 }],
    ["a fraction", { filename: "src/a.ts", additions: 1.5, deletions: 0 }],
  ]) {
    const r = size({ entries: [entry] });
    assert.equal(r.status, 2, why);
    assert.match(r.stderr, /src\/a\.ts has a line count that isn't a whole number of 0 or more/, why);
  }
  assert.equal(size({ files: [["src/a.ts", 1200, 0]], labels: ["size-exception"], body: "Size exception: ." }).status, 1, "no letter");
  assert.equal(size({ files: [["src/a.ts", 1200, 0]], labels: ["size-exception"], body: "Size exception: 2FA codes" }).status, 0, "a letter");
  const locks = ["ios/Podfile.lock", "pubspec.lock", "flake.lock", "mix.lock", "src/App/packages.lock.json", "android/app/gradle.lockfile"];
  const r = size({ files: [...locks.map((name) => [name, 900, 0]), ["src/a.ts", 10, 0]] });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#9: 10 changed lines counted, 5400 not counted/);
  assert.match(read("stacks/tanstack-start/scripts/pr/check.ts"), /passes on its size exception/);
});

const contents = (path, text) => ({ [`repos/acme/app/contents/${path}?ref=${HEAD}`]: { type: "file", size: Buffer.byteLength(text), encoding: "base64", content: Buffer.from(text).toString("base64") } });
const nulCode = `/* \0 */\n${lines(1500)}`;

test("#377 round 2, must 1: a source file git or GitHub shows as binary is exit 2, and other binaries are listed", unixOnly, () => {
  const hidden = local({ "src/a.ts": nulCode, "src/b.ts": lines(10) });
  assert.equal(hidden.status, 2, hidden.stdout);
  assert.match(hidden.stderr, /src\/a\.ts is source code that shows as binary \(it holds a NUL byte\), so its lines can't be counted/);
  const empty = local({ "src/empty.ts": "", "src/b.ts": lines(10) });
  assert.equal(empty.status, 0, empty.stderr);
  const png = local({ "e2e/home.png": `\0PNG${lines(20)}`, "src/b.ts": lines(10) });
  assert.equal(png.status, 0, png.stderr);
  assert.match(png.stdout, /Binary files, not counted:\n {2}e2e\/home\.png/);
  // A pull request: GitHub lists a binary file as 0 added, 0 removed and no patch, so its content at the head decides.
  const entry = (filename, status = "added") => ({ filename, status, additions: 0, deletions: 0 });
  const pr = size({ entries: [entry("src/a.ts"), ...listed([["src/b.ts", 10, 0]])], api: contents("src/a.ts", nulCode) });
  assert.equal(pr.status, 2, pr.stdout);
  assert.match(pr.stderr, /src\/a\.ts is source code that shows as binary/);
  const renamed = size({ entries: [{ ...entry("src/b.ts", "renamed"), previous_filename: "src/a.ts" }], api: contents("src/b.ts", nulCode) });
  assert.equal(renamed.status, 2, "a rename whose new content holds a NUL");
  for (const [why, text] of [["an empty new file", ""], ["a mode change, no NUL", lines(1500)]]) {
    // #407: GitHub lists a mode change as "changed"; a "modified" entry with 0/0 and content is exit 2 (AC-407-2).
    const r = size({ entries: [entry("src/run.sh", why === "an empty new file" ? "added" : "changed")], api: contents("src/run.sh", text) });
    assert.equal(r.status, 0, `${why}: ${r.stderr}`);
  }
  const image = size({ entries: [entry("public/logo.png"), entry("src/gone.ts", "removed")] });
  assert.equal(image.status, 0, image.stderr);
  assert.match(image.stdout, /Binary files, not counted:\n {2}public\/logo\.png\n?$/);
  const unread = size({ entries: [entry("src/a.ts")], api: { [`repos/acme/app/contents/src/a.ts?ref=${HEAD}`]: { type: "file", size: 2000000, encoding: "none", content: "" } } });
  assert.equal(unread.status, 2, "content GitHub won't send is never a pass");
  // The gate's pr-rules.mjs uses the same check.
  const gate = rules({ files: [["src/a.ts", 0, 0], ["src/b.ts", 10, 5]], api: contents("src/a.ts", nulCode) });
  assert.equal(gate.status, 2, gate.stdout);
  assert.match(gate.stderr, /src\/a\.ts is source code that shows as binary/);
  assert.equal(rules({ files: [["src/a.ts", 0, 0], ["src/b.ts", 10, 5]], api: contents("src/a.ts", "") }).status, 0, "an empty file at the gate");
});

test("#377 round 2, must 2: a code block closes only on its own fence character, as long or longer, with nothing after it", unixOnly, () => {
  const files = [["src/a.ts", 1500, 0]];
  const labels = ["size-exception"];
  for (const [open, close] of [["```", "```~"], ["```", "~~~"], ["```", "``` x"], ["```", "``"], ["````", "```"], ["~~~", "~~~`"], ["~~~", "```"], ["~~~", "~~~ x"], ["~~~", "~~"]]) {
    const r = size({ files, labels, body: `Closes #5\n\n${open}\ncode\n${close}\nSize exception: hidden\n` });
    assert.equal(r.status, 1, `${open} closed by ${close}: ${r.stdout}`);
    assert.doesNotMatch(r.stdout, /hidden/, `${open} closed by ${close}`);
  }
  for (const [open, close] of [["```", "```"], ["```", "`````  "], ["~~~", "~~~~"], ["~~~md", "~~~"]]) {
    const r = size({ files, labels, body: `Closes #5\n\n${open}\ncode\n${close}\nSize exception: a mechanical rename\n` });
    assert.equal(r.status, 0, `${open} closed by ${close}: ${r.stderr}`);
  }
});

test("#377 round 2, nice items 3 and 4: only data types count as fixtures, under a top-level test folder; snapshots anywhere", unixOnly, () => {
  const counted = ["test/fixtures/page.html", "test/fixtures/run", "test/fixtures/Dockerfile", "test/fixtures/main.tf", "test/fixtures/a.mdx", "src/routes/test/fixtures/page.json", "src/__snapshots__/a.snap.ts"];
  const r = size({ files: counted.map((name) => [name, 100, 0]) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#9: 700 changed lines counted, 0 not counted/);
  const data = ["test/fixtures/a.json", "tests/fixtures/b.yaml", "e2e/__fixtures__/c.txt", "spec/testdata/d.csv", "__tests__/fixtures/e.golden", "src/modules/notes/__snapshots__/notes.test.ts.snap", "test/fixtures/f.png"];
  const skipped = size({ files: [...data.map((name) => [name, 300, 0]), ["src/a.ts", 10, 0]] });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /#9: 10 changed lines counted, 2100 not counted/);
});

/** pr-size.mjs --base main in a checkout git takes for another user's, as a dev container's mounted folder is. A fake
 * git (first on PATH) sets git's own GIT_TEST_ASSUME_DIFFERENT_OWNER for calls made inside the checkout, so git's real
 * ownership check runs without chown or root. The operator's global config is a fake home: `.gitconfig` holds `safe`
 * (the checkout's root by default, or the entries `safe(root)` returns), and `files(root, home)` replaces the home's
 * files ({ path under the home: text, or null for a folder }). `env(home)` adds variables, `undefined` removes one.
 * pr-size.mjs must trust the root itself only when git, reading that config, would. The fake logs each call as
 * "<folder>\t<arguments>\t<GIT_CONFIG_GLOBAL>". */
function otherOwner(files, { safe = (root) => [root], files: homeFiles, env: extra = () => ({}), owned = false } = {}) {
  const dir = checkout();
  commitBranch(dir, files);
  const root = realpathSync(dir);
  const fakes = tmp("onrails-owner-");
  const home = join(fakes, "home");
  mkdirSync(join(home, ".config"), { recursive: true });
  const config = homeFiles?.(root, home) ?? { ".gitconfig": `[safe]\n${safe(root).map((entry) => `\tdirectory = ${entry}\n`).join("")}` };
  for (const [path, text] of Object.entries(config)) {
    if (text === null) mkdirSync(join(home, path), { recursive: true });
    else mkdirSync(dirname(join(home, path)), { recursive: true }), writeFileSync(join(home, path), text);
  }
  mkdirSync(join(fakes, "bin"));
  writeFileSync(join(fakes, "bin", "git"), `#!/bin/sh
printf '%s\\t%s\\t%s\\n' "$PWD" "$*" "\${GIT_CONFIG_GLOBAL-unset}" >> "$FAKE_GIT_LOG"
case "$PWD" in "$OTHER_OWNER"|"$OTHER_OWNER"/*) GIT_TEST_ASSUME_DIFFERENT_OWNER=1; export GIT_TEST_ASSUME_DIFFERENT_OWNER;; esac
exec "$REAL_GIT" "$@"
`);
  chmodSync(join(fakes, "bin", "git"), 0o755);
  const log = join(fakes, "git.log");
  const env = safeEnv({ HOME: home, XDG_CONFIG_HOME: join(home, ".config"), OTHER_OWNER: owned ? "/nonexistent" : root, FAKE_GIT_LOG: log, REAL_GIT: join(git(fakes, "--exec-path").trim(), "git"), ...extra(home) }, { bins: [join(fakes, "bin")] });
  const r = spawnSync(process.execPath, [join(dir, SCRIPTS, "pr-size.mjs"), "--base", "main"], { cwd: dir, encoding: "utf8", env });
  const calls = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => line.split("\t")) : [];
  const control = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", env: { ...env, GIT_CONFIG_GLOBAL: "/dev/null" } });
  return { ...r, root, calls, control };
}

const named = (args) => [...args.matchAll(/safe\.directory=(\S*)/g)].map((m) => m[1]);
const isConfigRead = (args) => / config --file /.test(args);
const refused = (r, why) => {
  assert.equal(r.status, 2, `${why}: ${r.stdout}`);
  assert.match(r.stderr, /dubious ownership/, why);
  assert.doesNotMatch(r.stdout, /changed lines counted/, why);
};
const counted = (r, why) => {
  assert.equal(r.status, 0, `${why}: ${r.stderr}`);
  assert.match(r.stdout, /HEAD against main: 30 changed lines counted/, why);
};
const change = { "src/a.ts": lines(30) };
/** The root listed, then `rest`, in the global config. */
const listsRoot = (rest) => ({ files: (root) => ({ ".gitconfig": `[safe]\n\tdirectory = ${root}\n${rest}` }) });

test("AC-432-1: WHEN the checkout is owned by another user and the global config marks it safe THEN pr-size.mjs --base origin/main runs and counts", unixOnly, () => {
  const r = otherOwner({ "src/a.ts": lines(30) });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /dubious ownership/);
  assert.match(r.stdout, /HEAD against main: 30 changed lines counted, 0 not counted/);
  // The control: git as pr-size.mjs ran it before (no global config, no trust) refuses this checkout, as the fake owner means it to.
  assert.match(r.control.stderr, /dubious ownership/);
});

test("#432: only the checkout's own root is trusted, never a wildcard, and every call stays isolated from the global config", unixOnly, () => {
  const r = otherOwner(change);
  assert.equal(r.status, 0, r.stderr);
  // The operator's list is read by git itself, from a scratch folder: no repo, no trusted folder, the global config dropped.
  const reads = r.calls.filter(([, args]) => isConfigRead(args));
  assert.ok(reads.length > 0, "the list is read");
  for (const [cwd, args, global] of reads) {
    assert.ok(cwd !== r.root && !cwd.startsWith(`${r.root}/`), `a config read runs outside the checkout: ${cwd}`);
    assert.equal(global, "/dev/null", `git ${args}`);
    assert.deepEqual(named(args), [], `git ${args}`);
  }
  // Every call that can open the checkout: the first finds the root, and each names only that root.
  const rest = r.calls.filter(([, args]) => !isConfigRead(args));
  assert.match(rest[0][1], /rev-parse --show-toplevel$/, "the first call that opens the checkout finds the root");
  assert.ok(rest.length > 1);
  for (const [, args, global] of rest) {
    assert.deepEqual(named(args), [r.root], `git ${args}`);
    assert.equal(global, "/dev/null", `git ${args}`);
  }
});

test("#432: WHEN the checkout is owned by another user and the global config does not list it THEN pr-size.mjs refuses it as main does, exit 2", unixOnly, () => {
  const r = otherOwner(change, { safe: () => ["/srv/some/other/checkout"] });
  refused(r, "another folder listed");
  assert.ok(r.calls.every(([, args]) => !/safe\.directory=/.test(args)), "no call names a trusted folder");
  refused(otherOwner(change, { safe: () => [] }), "no safe.directory at all");
});

test("#432: a global safe.directory of * is read as git reads it, so the checkout counts, and every call still names only its root", unixOnly, () => {
  const r = otherOwner(change, { safe: () => ["*"] });
  counted(r, "wildcard");
  for (const [, args] of r.calls.filter(([, args]) => !isConfigRead(args))) assert.deepEqual(named(args), [r.root], `git ${args}`);
});

test("#432: an empty safe.directory clears the list before it, as in git, and a parent or a child of the root is not the root", unixOnly, () => {
  refused(otherOwner(change, { safe: (root) => [root, ""] }), "cleared after the root");
  counted(otherOwner(change, { safe: (root) => ["", root] }), "listed after the clear");
  refused(otherOwner(change, { safe: (root) => [dirname(root), `${root}/src`] }), "a parent and a child");
});

// Each form below lists the root, and git, reading the same files, then does not trust it (or dies). Reading it by
// hand once counted these; git parses the files now, so each is refused, as main refuses an unlisted checkout.
{
  const forms = {
    'a later `directory = ""`': listsRoot('\tdirectory = ""\n'),
    "a later `directory = # c`": listsRoot("\tdirectory = # reset\n"),
    "a later `directory = ; c`": listsRoot("\tdirectory = ; reset\n"),
    "a later bare `directory`": listsRoot("\tdirectory\n"),
    "a clear in an included file": { files: (root) => ({ ".gitconfig": `[safe]\n\tdirectory = ${root}\n[include]\n\tpath = cleared\n`, cleared: "[safe]\n\tdirectory =\n" }) },
    "a backslash continuation that joins the root's line to another value": { files: (root) => ({ ".gitconfig": `[safe]\n\tdirectory = /srv/other\\\n\tdirectory = ${root}\n` }) },
    "a section git rejects, `[ safe ]`": { files: (root) => ({ ".gitconfig": `[ safe ]\n\tdirectory = ${root}\n` }) },
    "an unclosed section after the root": listsRoot("[core\n"),
    "a line git rejects after the root": listsRoot("= x\n"),
  };
  for (const [why, options] of Object.entries(forms)) {
    test(`#432: WHEN the root is listed and then ${why} THEN it is refused, as git refuses it`, unixOnly, () => refused(otherOwner(change, options), why));
  }
}

// git reads no user config at all for these, though the files list the root.
{
  const listed = { files: (root) => ({ ".gitconfig": `[safe]\n\tdirectory = ${root}\n`, ".config/git/config": `[safe]\n\tdirectory = ${root}\n` }) };
  const forms = { "GIT_CONFIG_GLOBAL is empty": { GIT_CONFIG_GLOBAL: "" }, "HOME is unset": { HOME: undefined }, "HOME is empty": { HOME: "" } };
  for (const [why, env] of Object.entries(forms)) {
    test(`#432: WHEN ${why} THEN git reads no user config and the root is refused`, unixOnly, () => refused(otherOwner(change, { ...listed, env: () => env }), why));
  }
}

test("#432: GIT_CONFIG_GLOBAL, when set, is the only user config read, and a file that lists the root there counts", unixOnly, () => {
  const files = (root, home) => ({ ".gitconfig": "[safe]\n\tdirectory = /srv/other\n", ".config/git/config": "[safe]\n\tdirectory = /srv/other\n", "mine": `[safe]\n\tdirectory = ${root}\n` });
  counted(otherOwner(change, { files, env: (home) => ({ GIT_CONFIG_GLOBAL: join(home, "mine") }) }), "GIT_CONFIG_GLOBAL lists the root");
  // The other way round: the defaults list the root, the file GIT_CONFIG_GLOBAL names does not.
  const defaults = (root) => ({ ".gitconfig": `[safe]\n\tdirectory = ${root}\n`, ".config/git/config": `[safe]\n\tdirectory = ${root}\n`, "mine": "[safe]\n\tdirectory = /srv/other\n" });
  refused(otherOwner(change, { files: defaults, env: (home) => ({ GIT_CONFIG_GLOBAL: join(home, "mine") }) }), "GIT_CONFIG_GLOBAL wins over the defaults");
  refused(otherOwner(change, { files: defaults, env: (home) => ({ GIT_CONFIG_GLOBAL: join(home, "missing") }) }), "a GIT_CONFIG_GLOBAL file that doesn't exist reads nothing");
});

test("#432: the XDG file is read, then ~/.gitconfig, and an empty entry in the later file clears the earlier one", unixOnly, () => {
  const entry = (root) => `[safe]\n\tdirectory = ${root}\n`;
  const clear = "[safe]\n\tdirectory =\n";
  counted(otherOwner(change, { files: (root) => ({ ".config/git/config": entry(root) }) }), "the XDG file alone");
  counted(otherOwner(change, { files: (root) => ({ ".gitconfig": entry(root) }), env: () => ({ XDG_CONFIG_HOME: undefined }) }), "~/.gitconfig alone, no XDG_CONFIG_HOME");
  counted(otherOwner(change, { files: (root) => ({ ".config/git/config": entry(root) }), env: () => ({ XDG_CONFIG_HOME: undefined }) }), "the default XDG file, ~/.config/git/config");
  counted(otherOwner(change, { files: (root) => ({ "xdg/git/config": entry(root) }), env: (home) => ({ XDG_CONFIG_HOME: join(home, "xdg") }) }), "XDG_CONFIG_HOME names the folder");
  refused(otherOwner(change, { files: (root) => ({ ".config/git/config": entry(root), ".gitconfig": clear }) }), "a clear in ~/.gitconfig, after the XDG file lists the root");
  counted(otherOwner(change, { files: (root) => ({ ".config/git/config": clear, ".gitconfig": entry(root) }) }), "~/.gitconfig lists the root after the XDG file clears");
  counted(otherOwner(change, { files: (root) => ({ ".config/git/config": "[safe]\n\tdirectory = /srv/other\n", ".gitconfig": entry(root) }) }), "~/.gitconfig lists the root, the XDG file another folder");
});

test("#432: an included file's safe.directory counts, as git reads it", unixOnly, () => {
  counted(otherOwner(change, { files: (root) => ({ ".gitconfig": "[include]\n\tpath = shared\n", shared: `[safe]\n\tdirectory = ${root}\n` }) }), "the include lists the root");
});

test("#432: WHEN a user config file can't be read THEN nothing is listed from it, and a checkout that needs no trust still counts", unixOnly, () => {
  // ~/.gitconfig is a folder: git warns and carries on, so a checkout the user owns counts as it does on main.
  counted(otherOwner(change, { files: () => ({ ".gitconfig": null }), owned: true }), "an owned checkout, ~/.gitconfig a folder");
  counted(otherOwner(change, { files: (root) => ({ ".config/git/config": `[safe]\n\tdirectory = ${root}\n`, ".gitconfig": null }) }), "a folder after the XDG file that lists the root");
  refused(otherOwner(change, { files: () => ({ ".gitconfig": null }) }), "nothing listed, a checkout owned by another user");
});
