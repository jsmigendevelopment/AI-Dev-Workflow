// The privacy eval for kit lessons (#253 AC-2, #322): a made-up project full of planted details, a table of candidate
// lessons that each carry one of them, and clean lessons. Nothing planted may get through `lesson check --project`.
// Local only: a temp git repo, a temp home folder and the CLI in a child process. No model, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./child.mjs";
import { checkLesson } from "../src/lesson-check.mjs";
import { projectTerm } from "../src/lesson-deny.mjs";
import { loadKit } from "../src/kit.mjs";
import { put, safeEnv, tmp } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const kit = loadKit();
const manifest = { core: kit.core, templates: kit.templates };
const home = tmp("onrails-home-");
const gitEnv = (cwd, extra = {}) => safeEnv({ HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: "1", ...extra }, { cwd });

// Every detail planted in the fixture. All made up.
const PLANTED = {
  appName: "garden",
  owner: "north-river",
  person: "Faith Bridge",
  email: "faith@bright-paper.dev",
  emailDomain: "bright-paper",
  codeDomain: "green-market",
  filePath: "src/billing/sync-orders.ts",
  envName: "MARKET_SIGNAL_TOKEN",
  issueNumber: "#41",
  codeLine: "await chargeCard(orderTotal)",
  decisionName: "Grant",
  docsWord: "Orders",
  pascalName: "StoneParty",
  pluralApp: "notes",
};

function git(dir, args, { name = PLANTED.person, email = PLANTED.email } = {}) {
  const author = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: gitEnv(dir, author) });
  assert.equal(r.status, 0, r.stderr);
}

// A small project of its own, so one planted detail is the only project term a lesson could hit. The author's
// domain is reserved, so it adds no domain.
function small(repoName, files) {
  const dir = tmp("onrails-small-");
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  const author = { name: "Ada Quill", email: "ada@quill.test" };
  git(dir, ["init", "-q"], author);
  git(dir, ["remote", "add", "origin", `https://github.com/cedar-lane/${repoName}.git`], author);
  git(dir, ["add", "-A"], author);
  git(dir, ["commit", "-q", "-m", "start"], author);
  return dir;
}

function fixture({ repoName = PLANTED.appName, packageName = PLANTED.appName } = {}) {
  const dir = tmp("onrails-privacy-");
  const files = {
    "package.json": JSON.stringify({ name: packageName, private: true }),
    "docs/vision.md": `# Garden\n\nGarden keeps a small shop's ${PLANTED.docsWord} in one place.\n`,
    "packages/notes/package.json": JSON.stringify({ name: PLANTED.pluralApp }),
    "docs/decisions.md": `# Decisions\n\n| 1 | Signed off by ${PLANTED.decisionName} after ${PLANTED.issueNumber}, which kept \`${PLANTED.codeLine}\` in ${PLANTED.filePath}. |\n`,
    "docs/profile.toml": `[me]\nname = "${PLANTED.person}"\ngithub_owner = "${PLANTED.owner}"\n`,
    "src/api.ts": `export const BASE = "https://api.${PLANTED.codeDomain}.io/v1";\n`,
    [PLANTED.filePath]: `export async function sync(orderTotal) {\n  ${PLANTED.codeLine};\n}\n`,
    ".env.example": `${PLANTED.envName}=\n`,
    ".env": `${PLANTED.envName}=not-a-real-value\n`,
    ".env.local": "LOCAL_ONLY=1\n",
    ".gitignore": ".env\n.env.local\n",
  };
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  git(dir, ["init", "-q"]);
  git(dir, ["remote", "add", "origin", `https://github.com/${PLANTED.owner}/${repoName}.git`]);
  git(dir, ["remote", "add", "upstream", `https://github.com/${PLANTED.owner}/${PLANTED.pascalName}.git`]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "start"]);
  return dir;
}

const project = fixture();

const good = (extra = {}) => ({
  kit_version: "0.7.1", component: "back", category: "gate", tool: "claude-code", model_family: "opus",
  automation: "full", cost: { extra_runs: "2-5", hours_stuck: "<1" },
  lesson: "The builder waited on the review gate before the merge.",
  suggested_fix: "Run the overlap check before the [detail] step.",
  repo_key: "a".repeat(64), ...extra,
});

function check(record, dir = project) {
  const folder = tmp("onrails-lesson-");
  const text = JSON.stringify(record, null, 2);
  put(folder, "lesson.json", text);
  const file = join(folder, "lesson.json");
  const r = spawnSync(process.execPath, [CLI, "lesson", "check", file, "--project", dir],
    { encoding: "utf8", env: gitEnv(folder), cwd: folder });
  return { ...r, file, folder, text };
}

// One row per planted detail. `deny` marks a row the allowlist from #321 alone would pass, so only the deny set
// refuses it.
const ROWS = [
  { detail: "appName", deny: true, record: good({ lesson: "The builder broke the garden check before the merge." }) },
  { detail: "owner", deny: true, record: good({ suggested_fix: "Push to north-river before the review." }) },
  { detail: "person", deny: true, record: good({ lesson: "The builder waited on Faith Bridge for the review." }) },
  { detail: "email", record: good({ lesson: `The builder wrote to ${PLANTED.email} on the branch.` }) },
  { detail: "emailDomain", deny: true, record: good({ lesson: "The builder waited on the bright-paper review." }) },
  { detail: "codeDomain", deny: true, record: good({ suggested_fix: "Check the green-market server before the merge." }) },
  { detail: "filePath", record: good({ lesson: `The builder broke ${PLANTED.filePath} on the branch.` }) },
  { detail: "envName", record: good({ lesson: `The builder lost ${PLANTED.envName} on the branch.` }) },
  { detail: "issueNumber", record: good({ lesson: `The builder reopened ${PLANTED.issueNumber} on the branch.` }) },
  { detail: "codeLine", record: good({ suggested_fix: `Keep ${PLANTED.codeLine} on the branch.` }) },
  { detail: "decisionName", deny: true, record: good({ lesson: "The builder asked grant before the merge." }) },
  // A name in another form: its camelCase parts spaced or hyphenated, or its singular or plural. `carries` is the form.
  { detail: "pascalName", form: "spaced", carries: "stone party", deny: true,
    record: good({ lesson: "The builder broke the stone party check before the merge." }) },
  { detail: "pascalName", form: "hyphenated", carries: "stone-party", deny: true,
    record: good({ suggested_fix: "Run the stone-party check before the merge." }) },
  { detail: "pluralApp", form: "singular", carries: "note", deny: true,
    record: good({ lesson: "The builder broke the note check before the merge." }) },
  { detail: "decisionName", form: "plural", carries: "grants", deny: true,
    record: good({ lesson: "The builder asked grants before the merge." }) },
  { detail: "docsWord", form: "singular", carries: "order", deny: true,
    record: good({ lesson: "The builder lost an order before the merge." }) },
];

const CLEAN = [
  good(),
  good({ lesson: "Two builders changed the same file and the merge failed." }),
  good({ lesson: "The coordinator ran the flaky test three times before it passed.", category: "flaky-test" }),
  good({ suggested_fix: "Ask the person once and then wait for the answer." }),
];

const results = [];

for (const row of ROWS) {
  const form = row.form ? ` (${row.form})` : "";
  test(`AC-322-1: WHEN a lesson carries the planted ${row.detail}${form} THEN lesson check --project refuses it`, () => {
    assert.match(JSON.stringify(row.record), new RegExp(escape(row.carries ?? PLANTED[row.detail]), "i"), "the row carries its detail");
    if (row.deny) assert.equal(checkLesson(row.record, { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(row.record);
    results.push(r);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    if (row.deny) assert.match(r.stderr, /: contains a project term \(/);
  });
}

test("AC-322-2: WHEN a record is refused THEN it is not altered on disk, and nothing is cleaned up and accepted", () => {
  const r = check(ROWS[0].record);
  assert.equal(r.status, 1);
  assert.equal(readFileSync(r.file, "utf8"), r.text);
  assert.deepEqual(readdirSync(r.folder), ["lesson.json"]);
  assert.doesNotMatch(r.stdout + r.stderr, /accepted/i);
});

test("AC-322-3: WHEN the planted app name is a common English word THEN the deny set still refuses it", () => {
  const record = good({ lesson: "The builder broke the garden check before the merge." });
  assert.equal(checkLesson(record, { manifest }).ok, true, "the allowlist alone passes it");
  const r = check(record);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name|docs)\)$/m);
});

test("AC-322-4: WHEN every lesson lesson check accepts is scanned for every planted detail THEN none is found", () => {
  for (const record of CLEAN) results.push(check(record));
  const accepted = results.filter((r) => r.status === 0);
  assert.equal(accepted.length, CLEAN.length, "every clean lesson is accepted");
  for (const r of accepted) {
    for (const [name, value] of Object.entries(PLANTED)) {
      assert.doesNotMatch(r.text, new RegExp(escape(value), "i"), `${name} got through`);
      // Each part, camelCase parts too, in either number.
      const parts = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
      for (const word of parts) {
        const stem = word.replace(/([^s])s$/, "$1");
        assert.doesNotMatch(r.text, new RegExp(`\\b(${word}|${stem})(e?s)?\\b`, "i"), `part of ${name} got through`);
      }
    }
  }
});

test("AC-322-6: WHEN the repo is named after a kit word such as review THEN a lesson that uses review is accepted", () => {
  const dir = fixture({ repoName: "review", packageName: "review" });
  const r = check(good({ lesson: "The builder waited on the review before the merge." }), dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(check(good({ lesson: "The builder broke the garden check." }), dir).status, 1);
});

test("AC-322-6: WHEN the repo is named review THEN its plural reviews is accepted too", () => {
  const dir = fixture({ repoName: "review", packageName: "review" });
  const r = check(good({ lesson: "The builder waited on two reviews before the merge." }), dir);
  assert.equal(r.status, 0, r.stderr);
});

test("lesson check: an app named after a kit file name (board, vision-flow) is still refused, and a skill name leaves the set", () => {
  const board = fixture({ repoName: "Board", packageName: "vision-flow" });
  for (const lesson of ["The builder broke the board check.", "The builder broke the vision flow check."]) {
    const r = check(good({ lesson }), board);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name)\)$/m);
  }
  // The component field holds a name from the kit's own closed list, so it carries nothing from the project.
  assert.equal(check(good({ component: "board" }), board).status, 0);
  const grill = fixture({ repoName: "grill", packageName: "grill" });
  const r = check(good({ lesson: "The builder ran grill before the merge." }), grill);
  assert.equal(r.status, 0, r.stderr);
});

test("AC-385-1: WHEN the project is brightpaper THEN a lesson saying bright paper or bright-paper is refused", () => {
  const dir = small("brightpaper", { "package.json": JSON.stringify({ name: "brightpaper" }) });
  for (const lesson of ["The builder broke the bright paper check before the merge.",
    "The builder broke the bright-paper check before the merge."]) {
    assert.equal(checkLesson(good({ lesson }), { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(good({ lesson }), dir);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \((git remote|package name)\)$/m);
    assert.doesNotMatch(r.stdout + r.stderr, /bright|paper/i);
  }
  // Each word alone is no part of the name: only the run of words that joins into it is.
  for (const lesson of ["The builder broke the paper check.", "The builder saw a bright light before the merge."]) {
    assert.equal(check(good({ lesson }), dir).status, 0, lesson);
  }
});

test("AC-385-2: WHEN .env.example names RIVER_SIGNAL_TOKEN THEN river signal token is refused", () => {
  const dir = small("cedar", { ".env.example": "RIVER_SIGNAL_TOKEN=\nRIVERSIGNAL_KEY=\n" });
  // Spaced, hyphenated, both at once, and a name with a joined part read as two words.
  for (const lesson of ["The builder lost the river signal token on the branch.",
    "The builder lost the river-signal-token on the branch.", "The builder lost the river-signal token on the branch.",
    "The builder lost the river signal-token on the branch.", "The builder lost the river signal key on the branch.",
    "The builder lost the river-signal key on the branch."]) {
    assert.equal(checkLesson(good({ lesson }), { manifest }).ok, true, "the allowlist alone passes it");
    const r = check(good({ lesson }), dir);
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: contains a project term \(env name\)$/m);
    assert.doesNotMatch(r.stdout + r.stderr, /river|signal/i);
  }
  // An env name stays whole (decision 322-1): its words alone don't block a lesson.
  assert.equal(check(good({ lesson: "The builder lost the token by the river on the branch." }), dir).status, 0);
});

test("AC-385-3: WHEN --project is given THEN issue 41 and #41 are refused, and the error never prints the number", () => {
  for (const lesson of ["The builder closed issue 41 on the branch.", "The builder closed #41 on the branch.",
    "The builder closed issue 57 on the branch.", "The builder closed PR 41 on the branch.",
    "The builder closed pull request 41 on the branch.", "The builder closed pull 41 on the branch.",
    "The builder closed pulls 41 and 42 on the branch.", "The builder closed issue: 41 on the branch.",
    // A number before "times out" is still an issue's: only a count of times passes.
    "The check on pull request 41 times out after an hour.", "The build on issue 41 times out after an hour.",
    "The builder saw that pull 12 times out on the branch."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 1, lesson);
    assert.match(r.stderr, /^ {2}lesson: (contains a project term \(issue number\)|issue-number)$/m);
    assert.doesNotMatch(r.stdout + r.stderr, /41|42|57|12/);
  }
  const bare = good({ lesson: "The builder closed issue 41 on the branch." });
  assert.equal(checkLesson(bare, { manifest }).ok, true, "without a project, the allowlist alone passes it");
  // A small number that isn't an issue's still passes, and so does a count after the word issue.
  assert.equal(check(good({ lesson: "The coordinator ran the test 3 times before it passed." })).status, 0);
  for (const lesson of ["The builder hit the same issue 3 times before the merge.", "The builder hit the issue 2 times."]) {
    const r = check(good({ lesson }));
    assert.equal(r.status, 0, `${lesson}\n${r.stderr}`);
  }
  // Only times makes a count: issue 3 x is still an issue number, besides the word rule that refuses x.
  assert.match(check(good({ lesson: "The builder hit the issue 3 x before the merge." })).stderr,
    /^ {2}lesson: contains a project term \(issue number\)$/m);
});

// The lesson file read from a pipe, as /dev/stdin, the way `lesson check <(...)` hands one over. A shell pipe, since
// a child's own stdin from spawnSync is a socket that /dev/stdin can't open.
function checkPiped(text) {
  const folder = tmp("onrails-lesson-");
  put(folder, "lesson.json", text);
  const script = 'cat "$1" | "$2" "$3" lesson check /dev/stdin --project "$4"';
  return spawnSync("sh", ["-c", script, "sh", join(folder, "lesson.json"), process.execPath, CLI, project],
    { encoding: "utf8", env: gitEnv(folder), cwd: folder });
}

test("lesson check: a lesson file from a pipe is read, and refused past 1 MB", { skip: process.platform === "win32" ? "no /dev/stdin on Windows" : false }, () => {
  const small = checkPiped(JSON.stringify(good()));
  assert.equal(small.status, 0, small.stderr);
  const big = checkPiped(JSON.stringify(good({ lesson: "the merge ".repeat(110_000) })));
  assert.equal(big.status, 1);
  assert.match(big.stderr, /^ {2}record: too-large$/m);
});

test("lesson check: a lesson file over 1 MB is refused unread, and a long field is scanned fast", () => {
  const big = check(good({ lesson: "the merge ".repeat(110_000) }));
  assert.equal(big.status, 1);
  assert.match(big.stderr, /^ {2}record: too-large$/m);
  // A long run of short words against a long one-word term: each field is scanned in a bounded time.
  const long = "ab".repeat(29) + "c";
  const started = performance.now();
  assert.equal(projectTerm("ab ".repeat(300_000), new Map([[long, "package name"]])), null);
  assert.ok(performance.now() - started < 1000, "the scan took over a second");
});

test("AC-322-7: WHEN a record is refused for a project term THEN the output names the field and the source kind, never the term", () => {
  const r = check(good({ suggested_fix: "Check the green-market server before the merge." }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^ {2}suggested_fix: contains a project term \(domain\)$/m);
  assert.doesNotMatch(r.stdout + r.stderr, /green|market/i);
  const name = check(good({ lesson: "The builder waited on Faith Bridge for the review." }));
  assert.match(name.stderr, /^ {2}lesson: contains a project term \(profile\)$/m);
  assert.doesNotMatch(name.stdout + name.stderr, /faith|bridge/i);
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
